// A scanned block poster has to end on that block, whoever is holding the phone.

import { render, screen } from "@testing-library/react-native";

import type { AuthState } from "@/auth/AuthProvider";
import { setPendingBlockId, takePendingBlockId } from "@/lib/pendingLink";

import { BlockLink } from "./BlockLink";

const mockState = { current: { status: "signed_out" } as AuthState };
const mockParams = { current: {} as { id?: string } };

jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: mockState.current, signIn: jest.fn(), signOut: jest.fn(), retryRole: jest.fn() }),
}));
jest.mock("expo-router", () => {
	const { Text } = jest.requireActual("react-native");
	return {
		Redirect: ({ href }: { href: unknown }) => <Text>redirect:{typeof href === "string" ? href : JSON.stringify(href)}</Text>,
		useLocalSearchParams: () => mockParams.current,
	};
});

const user = { id: "u1", email: "sam@company.co.uk" } as Extract<AuthState, { status: "signed_in" }>["user"];

async function open(state: AuthState, id?: string) {
	mockState.current = state;
	mockParams.current = id === undefined ? {} : { id };
	await render(<BlockLink />);
}

beforeEach(() => {
	takePendingBlockId();
});

test("signed in, the link opens the block", async () => {
	await open({ status: "signed_in", user, role: "agent" }, "b1");

	expect(screen.getByText(`redirect:${JSON.stringify({ pathname: "/(app)/block/[id]", params: { id: "b1" } })}`)).toBeTruthy();
	expect(takePendingBlockId()).toBeNull();
});

test("signed out, the block is remembered and the login screen comes first", async () => {
	await open({ status: "signed_out" }, "b1");

	expect(screen.getByText("redirect:/login")).toBeTruthy();
	expect(takePendingBlockId()).toBe("b1");
});

test("a build with no config goes to login the same way, which explains itself there", async () => {
	await open({ status: "unconfigured" }, "b1");

	expect(screen.getByText("redirect:/login")).toBeTruthy();
	expect(takePendingBlockId()).toBe("b1");
});

test("while the session is still being restored, nothing happens yet", async () => {
	await open({ status: "loading" }, "b1");

	expect(screen.queryByText(/redirect:/)).toBeNull();
	expect(takePendingBlockId()).toBeNull();
});

test("an unresolved persona still heads for the block, where the guard explains itself", async () => {
	await open({ status: "role_unknown", user }, "b1");
	expect(screen.getByText(/"id":"b1"/)).toBeTruthy();
});

test("no id and signed in lands on the signed-in home", async () => {
	await open({ status: "signed_in", user, role: "staff" });

	expect(screen.getByText("redirect:/(app)")).toBeTruthy();
	expect(takePendingBlockId()).toBeNull();
});

test("no id and signed out lands on login with nothing remembered", async () => {
	setPendingBlockId("stale");
	takePendingBlockId();
	await open({ status: "signed_out" }, "");

	expect(screen.getByText("redirect:/login")).toBeTruthy();
	expect(takePendingBlockId()).toBeNull();
});
