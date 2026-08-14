// What the guard shows for each auth state.
//
// The rule being protected: nothing that needs an account renders until the
// answer is known. A flash of someone else's dashboard is not a cosmetic bug -
// on a shared phone it is a disclosure.

import { render, screen } from "@testing-library/react-native";

import SignedInLayout from "../app/(app)/_layout";

import type { AuthState } from "./AuthProvider";

const mockState = { current: { status: "loading" } as AuthState };

jest.mock("./AuthProvider", () => ({
	useAuth: () => ({ state: mockState.current, signOut: jest.fn(), retryRole: jest.fn(), signIn: jest.fn() }),
}));
// A mock factory may not close over imports, so react-native is required
// inside it. Both stand-ins just announce themselves.
jest.mock("expo-router", () => {
	const { Text } = jest.requireActual("react-native");
	return {
		Redirect: ({ href }: { href: string }) => <Text>redirect:{String(href)}</Text>,
		Stack: () => <Text>signed-in content</Text>,
		router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
	};
});

type SignedIn = Extract<AuthState, { status: "signed_in" }>;
const user = { id: "u1", email: "sam@company.co.uk" } as SignedIn["user"];

async function showFor(state: AuthState) {
	mockState.current = state;
	await render(<SignedInLayout />);
}

test("while the session is still being restored, nothing signed-in renders", async () => {
	await showFor({ status: "loading" });

	expect(screen.queryByText("signed-in content")).toBeNull();
	expect(screen.getByLabelText("Loading the visit")).toBeTruthy();
});

test("signed out goes to the login screen", async () => {
	await showFor({ status: "signed_out" });
	expect(screen.getByText(/redirect:/)).toBeTruthy();
	expect(screen.queryByText("signed-in content")).toBeNull();
});

test("a build with no config also goes to login, which explains itself there", async () => {
	await showFor({ status: "unconfigured" });
	expect(screen.getByText(/redirect:/)).toBeTruthy();
});

test("an unresolved persona is asked about rather than guessed", async () => {
	await showFor({ status: "role_unknown", user });

	expect(await screen.findByText("Couldn't finish signing in")).toBeTruthy();
	expect(screen.queryByText("signed-in content")).toBeNull();
});

test.each(["staff", "agent", "cleaner"] as const)("a signed-in %s reaches the app", async (role) => {
	await showFor({ status: "signed_in", user, role });
	expect(screen.getByText("signed-in content")).toBeTruthy();
});
