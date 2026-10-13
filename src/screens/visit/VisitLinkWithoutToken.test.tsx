// A visit link with the token missing still gets the inspector somewhere useful.

import { render, screen } from "@testing-library/react-native";

import { VisitLinkWithoutToken } from "./VisitLinkWithoutToken";

jest.mock("expo-router", () => {
	const { Text } = jest.requireActual("react-native");
	return { Redirect: ({ href }: { href: string }) => <Text>redirect:{href}</Text> };
});

test("/v/ with no token goes to the enter-code screen", async () => {
	await render(<VisitLinkWithoutToken />);
	expect(screen.getByText("redirect:/enter-code")).toBeTruthy();
});
