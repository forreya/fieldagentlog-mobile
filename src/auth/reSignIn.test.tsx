// Sign out, then sign in again, in the same app session.
//
// This is the second thing anyone does with a login screen, and it was broken:
// endSession dropped the cached Supabase client, so the next sign-in ran on a
// NEW client while AuthProvider's onAuthStateChange listener still watched the
// old one. Auth returned 200 and no event ever arrived. The app sat on the form
// with no error and no spinner, and only a restart cleared it.
//
// Every smoke run had missed it by restarting the app between personas.
//
// The mock below models the ONE thing that matters: getSupabase() hands back a
// cached client, and resetSupabase() makes the next call build a different one
// with its own listeners. A mock that returned a single shared object would
// pass whether or not the bug was present.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";

import { queueOwner } from "@/sync/owner";

import { AuthProvider, useAuth } from "./AuthProvider";
import { resetSupabase } from "./supabase";

type Listener = (event: string, session: unknown | null) => void;

const CLEANER = { id: "u1", email: "cleaner@example.test", app_metadata: { role: "cleaner" } };

function makeClient() {
	const listeners: Listener[] = [];
	let session: unknown = null;
	return {
		listeners,
		auth: {
			getSession: async () => ({ data: { session } }),
			signInWithPassword: async () => {
				session = { user: CLEANER };
				listeners.forEach((fn) => fn("SIGNED_IN", session));
				return { error: null };
			},
			signOut: async () => {
				session = null;
				listeners.forEach((fn) => fn("SIGNED_OUT", null));
				return { error: null };
			},
			onAuthStateChange: (fn: Listener) => {
				listeners.push(fn);
				mockState.subscribeCount += 1;
				return { data: { subscription: { unsubscribe: () => undefined } } };
			},
		},
	};
}

const mockState = { client: makeClient(), built: 1, subscribeCount: 0 };

jest.mock("./supabase", () => ({
	supabaseConfigured: () => true,
	getSupabase: () => mockStateRef().client,
	// Faithful to the real one: the NEXT getSupabase() builds a fresh client,
	// and anything still holding the old one is talking to a dead object.
	resetSupabase: () => {
		mockStateRef().client = mockMakeClient();
		mockStateRef().built += 1;
	},
	resolveUserRole: async (_sb: unknown, user: { app_metadata?: { role?: string } }) =>
		user.app_metadata?.role === "cleaner" ? { role: "cleaner", organizationIds: [] } : { role: "staff", organizationIds: ["o1"] },
}));

// jest.mock factories cannot close over non-`mock`-prefixed bindings, so the
// state and the factory are reached through these.
function mockStateRef() {
	return mockState;
}
function mockMakeClient() {
	return makeClient();
}

jest.mock("./roleCache", () => ({
	rememberRole: async () => undefined,
	recallRole: async () => null,
	forgetRole: async () => undefined,
}));

jest.mock("@/api/session", () => ({ onSessionExpired: () => () => undefined }));

const mockRequestSync = jest.fn();
jest.mock("@/sync/triggers", () => ({ requestSync: (reason: string) => mockRequestSync(reason) }));

// Buttons rather than captured callbacks: assigning to a module-level object
// during render is a mutation the React Compiler rightly refuses.
function Probe() {
	const { state, signIn, signOut } = useAuth();
	return (
		<>
			<Text>{state.status === "signed_in" ? `in:${state.role}` : state.status}</Text>
			<Pressable accessibilityRole="button" accessibilityLabel="do-sign-in" onPress={() => void signIn("cleaner@example.test", "pw")} />
			<Pressable accessibilityRole="button" accessibilityLabel="do-sign-out" onPress={() => void signOut()} />
		</>
	);
}

const pressSignIn = () => fireEvent.press(screen.getByLabelText("do-sign-in"));
const pressSignOut = () => fireEvent.press(screen.getByLabelText("do-sign-out"));

beforeEach(() => {
	mockState.client = makeClient();
	mockState.built = 1;
	mockState.subscribeCount = 0;
	mockRequestSync.mockClear();
});

async function mount() {
	// The provider clears the read cache on sign-out, so it lives under a query
	// client here exactly as it does in the app.
	const client = new QueryClient();
	await render(
		<QueryClientProvider client={client}>
			<AuthProvider>
				<Probe />
			</AuthProvider>
		</QueryClientProvider>,
	);
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());
	return client;
}

test("signing in, out, and in again all land on a signed-in state", async () => {
	await mount();

	pressSignIn();
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());

	pressSignOut();
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());

	// The one that regressed.
	pressSignIn();
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());
});

test("sign-out leaves the client in place, so the listener stays attached", async () => {
	await mount();
	pressSignOut();
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());

	expect(mockState.built).toBe(1);
	expect(mockState.subscribeCount).toBe(1);
	expect(mockState.client.listeners).toHaveLength(1);
});

test("the mock really does break the listener when the client is replaced", async () => {
	// Proves the two tests above can fail. Replace the client by hand and the
	// new one has nobody listening - which is exactly what shipped.
	await mount();
	resetSupabase();

	expect(mockState.built).toBe(2);
	expect(mockState.client.listeners).toHaveLength(0);
});

// Signing in is a sync trigger.
//
// Work rejected with "You're not signed in." is retryable - signing back in is
// the fix. Without a nudge here the queue waits for an unrelated trigger, which
// on device meant a report sitting through a whole signed-in session and only
// leaving at the next foreground.
test("signing out clears the read cache, its snapshot, and the queue owner", async () => {
	// The whole point of the account boundary: whoever signs in next starts
	// from nothing - not from this user's block list, and not able to push
	// this user's queued work.
	const client = await mount();

	pressSignIn();
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());
	expect(queueOwner()).toBe("u1");

	// Fresh cached data and a persisted snapshot, exactly as a used app holds.
	client.setQueryData(["dashboard", "u1", "staff"], { blocks: [] });
	await AsyncStorage.setItem("fa.query", '{"clientState":{}}');

	pressSignOut();
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());

	await waitFor(async () => {
		expect(client.getQueryData(["dashboard", "u1", "staff"])).toBeUndefined();
		expect(await AsyncStorage.getItem("fa.query")).toBeNull();
		expect(queueOwner()).toBeNull();
	});
});

test("a session arriving nudges the sync queue", async () => {
	await mount();
	expect(mockRequestSync).not.toHaveBeenCalled();

	pressSignIn();
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());

	expect(mockRequestSync).toHaveBeenCalledWith("signed in");
});

test("signing out does not nudge the queue", async () => {
	await mount();
	pressSignIn();
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());
	mockRequestSync.mockClear();

	pressSignOut();
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());

	expect(mockRequestSync).not.toHaveBeenCalled();
});
