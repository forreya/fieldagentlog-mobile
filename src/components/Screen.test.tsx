// The app frame, and the one thing it has to get right about dynamic type.
//
// Text in the body scales without limit - that is what the setting is for. The
// bar cannot: it is a fixed-height strip already sharing a row with the sync
// pill and the menu, and at the accessibility sizes the title collapsed to
// "Ce..." and the subtitle to "Check...". The screen that tells an inspector
// which building they are standing in stopped naming it, at exactly the setting
// meant to make the app more readable.

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { Screen } from "./Screen";

jest.mock("react-native-safe-area-context", () => {
	const { View } = jest.requireActual("react-native");
	return { SafeAreaView: View };
});

async function show() {
	await render(
		<Screen title="Cedar Point" sub="Check 1 of 4" signedInAs="agent@example.test">
			<Text>body copy</Text>
		</Screen>,
	);
}

test("the bar's own text is capped, so a long block name survives large type", async () => {
	await show();

	for (const label of ["Cedar Point", "Check 1 of 4", "Signed in as agent@example.test"]) {
		expect(screen.getByText(label).props.maxFontSizeMultiplier).toBe(1.3);
	}
});

// The cap is a concession the bar makes; nothing else should copy it.
test("body content is left to scale as far as the reader wants", async () => {
	await show();

	expect(screen.getByText("body copy").props.maxFontSizeMultiplier).toBeUndefined();
});
