// A report has to belong to a block.
//
// Found on a device: the composer opened from a link with no block, accepted a
// perfectly good report, and the broker refused it with "Block not assigned to
// you." It came to rest in Your reports as a permanent failure - correct
// handling of a request that should never have been made.
//
// src/app holds routes and nothing else, so this test sits here and imports the
// route, the same way redirects.test.tsx does.

import { render, screen } from "@testing-library/react-native";

import ReportRoute from "../app/(app)/report";

const mockParams = { current: {} as Record<string, string> };

jest.mock("expo-router", () => {
	const { Text } = jest.requireActual("react-native");
	return {
		Redirect: ({ href }: { href: string }) => <Text>redirect:{String(href)}</Text>,
		useLocalSearchParams: () => mockParamsRef().current,
	};
});

jest.mock("@/screens/report/ReportIssue", () => {
	const { Text } = jest.requireActual("react-native");
	return {
		ReportIssue: ({ site }: { site: { id: string; name: string } }) => (
			<Text>
				compose:{site.id}:{site.name}
			</Text>
		),
	};
});

function mockParamsRef() {
	return mockParams;
}

test("a link with no block goes home rather than composing an unsendable report", async () => {
	mockParams.current = {};
	await render(<ReportRoute />);
	expect(screen.getByText("redirect:/(app)")).toBeTruthy();
});

test("a block is passed through to the composer", async () => {
	mockParams.current = { siteId: "b1", siteName: "Elm Court" };
	await render(<ReportRoute />);
	expect(screen.getByText("compose:b1:Elm Court")).toBeTruthy();
});

// The id is what the report hangs off; the name is only a label, so a missing
// one is worth a placeholder rather than throwing the report away.
test("a block with an id but no name still composes", async () => {
	mockParams.current = { siteId: "b1" };
	await render(<ReportRoute />);
	expect(screen.getByText("compose:b1:this block")).toBeTruthy();
});
