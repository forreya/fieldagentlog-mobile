// Being signed in has to take you somewhere.
//
// Both of these were real, and both were invisible to every existing test: the
// guard on (app) kept signed-out people OUT, but nothing pulled a signed-in one
// IN. Signing in succeeded - token issued, role resolved - and left you looking
// at the login form. Found the first time the app ran against a real backend.

import { render, screen } from "@testing-library/react-native";

// Safe above the jest.mock calls below: babel hoists those above every import.
import Landing from "../app/index";
import { LoginScreen } from "../screens/auth/LoginScreen";

import type { AuthState } from "./AuthProvider";

const mockState = { current: { status: "signed_out" } as AuthState };

jest.mock("./AuthProvider", () => ({
	useAuth: () => ({ state: mockState.current, signIn: jest.fn(), signOut: jest.fn(), retryRole: jest.fn() }),
}));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));
jest.mock("expo-router", () => {
	const { Text } = jest.requireActual("react-native");
	return {
		Redirect: ({ href }: { href: string }) => <Text>redirect:{String(href)}</Text>,
		Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
		router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
	};
});

const user = { id: "u1", email: "sam@company.co.uk" } as Extract<AuthState, { status: "signed_in" }>["user"];

test("signing in moves you off the login screen", async () => {
	mockState.current = { status: "signed_in", user, role: "agent" };
	await render(<LoginScreen />);

	expect(screen.getByText(/redirect:/)).toBeTruthy();
	expect(screen.queryByText("Sign in")).toBeNull();
});

test("an unresolved persona still leaves the login screen, so it can be explained", async () => {
	mockState.current = { status: "role_unknown", user };
	await render(<LoginScreen />);
	expect(screen.getByText(/redirect:/)).toBeTruthy();
});

test("signed out, the login screen is the login screen", async () => {
	mockState.current = { status: "signed_out" };
	await render(<LoginScreen />);
	expect(screen.getByLabelText("Email")).toBeTruthy();
});

test("a signed-in agent cold-starting lands on their blocks, not the inspector page", async () => {
	mockState.current = { status: "signed_in", user, role: "agent" };
	await render(<Landing />);

	expect(screen.getByText(/redirect:/)).toBeTruthy();
	expect(screen.queryByText("Got a visit link?")).toBeNull();
});

test("signed out, the landing is the inspector's - most people opening this app have no account", async () => {
	mockState.current = { status: "signed_out" };
	await render(<Landing />);
	expect(screen.getByText("Got a visit link?")).toBeTruthy();
});
