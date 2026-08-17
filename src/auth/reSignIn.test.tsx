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

import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

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

const probe: { signIn: () => Promise<unknown>; signOut: () => Promise<void> } = {
	signIn: async () => undefined,
	signOut: async () => undefined,
};

function Probe() {
	const { state, signIn, signOut } = useAuth();
	probe.signIn = () => signIn("cleaner@example.test", "pw");
	probe.signOut = signOut;
	return <Text>{state.status === "signed_in" ? `in:${state.role}` : state.status}</Text>;
}

beforeEach(() => {
	mockState.client = makeClient();
	mockState.built = 1;
	mockState.subscribeCount = 0;
});

async function mount() {
	await render(
		<AuthProvider>
			<Probe />
		</AuthProvider>,
	);
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());
}

test("signing in, out, and in again all land on a signed-in state", async () => {
	await mount();

	await act(async () => void (await probe.signIn()));
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());

	await act(async () => void (await probe.signOut()));
	await waitFor(() => expect(screen.getByText("signed_out")).toBeTruthy());

	// The one that regressed.
	await act(async () => void (await probe.signIn()));
	await waitFor(() => expect(screen.getByText("in:cleaner")).toBeTruthy());
});

test("sign-out leaves the client in place, so the listener stays attached", async () => {
	await mount();
	await act(async () => void (await probe.signOut()));

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
