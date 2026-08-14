import { render, screen } from "@testing-library/react-native";

import { AboutScreen } from "./AboutScreen";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

test("shows every value someone might be asked to read out", async () => {
	await render(<AboutScreen />);

	for (const label of ["Version", "Commit", "Built", "Backend"]) {
		expect(screen.getByText(label)).toBeTruthy();
	}
});

test("an unstamped build says 'unknown' rather than showing a blank", async () => {
	// Under Jest there is no Expo config to read, so this is the degraded path
	// the screen must survive - it is the screen people open when things break.
	await render(<AboutScreen />);
	expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
});
