// Which home each persona lands on. Sending someone to the wrong one is not a
// cosmetic bug: an agent's screen fetches through a broker a cleaner is refused
// by, so the mistake surfaces as an error rather than as the wrong list.

import { render, screen } from "@testing-library/react-native";

import { SignedInHome } from "./SignedInHome";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));
jest.mock("@/screens/blocks/BlocksHome", () => ({ BlocksHome: () => null }));
jest.mock("@/screens/cleaner/CleanerHome", () => ({ CleanerHome: () => null }));

const mockState = { current: {} as Record<string, unknown> };
jest.mock("@/auth/AuthProvider", () => ({
	useAuth: () => ({ state: mockState.current, signOut: jest.fn() }),
}));

const BlocksHomeMock = jest.requireMock("@/screens/blocks/BlocksHome") as { BlocksHome: jest.Mock };
const CleanerHomeMock = jest.requireMock("@/screens/cleaner/CleanerHome") as { CleanerHome: jest.Mock };

function signedInAs(role: string) {
	mockState.current = { status: "signed_in", role, user: { id: "u1", email: `${role}@example.test` } };
}

beforeEach(() => {
	jest.clearAllMocks();
	BlocksHomeMock.BlocksHome = jest.fn(() => null);
	CleanerHomeMock.CleanerHome = jest.fn(() => null);
});

test.each(["agent", "staff"])("%s lands on the blocks home", async (role) => {
	signedInAs(role);
	await render(<SignedInHome />);

	expect(BlocksHomeMock.BlocksHome).toHaveBeenCalled();
	expect(CleanerHomeMock.CleanerHome).not.toHaveBeenCalled();
});

test("a cleaner lands on the cleaner home, not the blocks home", async () => {
	signedInAs("cleaner");
	await render(<SignedInHome />);

	expect(CleanerHomeMock.CleanerHome).toHaveBeenCalled();
	expect(BlocksHomeMock.BlocksHome).not.toHaveBeenCalled();
});

test("an unrecognised role gets an explanation, not a blank screen", async () => {
	// Reachable two ways: the claim could not be read, or BalanceBuddy grew a
	// persona this build predates.
	signedInAs("inspector-general");
	await render(<SignedInHome />);

	expect(screen.getByText("We can't tell what you do here")).toBeTruthy();
	expect(BlocksHomeMock.BlocksHome).not.toHaveBeenCalled();
	expect(CleanerHomeMock.CleanerHome).not.toHaveBeenCalled();
});

test("signed out renders nothing - the guard, not this screen, does the redirect", async () => {
	mockState.current = { status: "signed_out" };
	const view = await render(<SignedInHome />);
	expect(view.toJSON()).toBeNull();
});
