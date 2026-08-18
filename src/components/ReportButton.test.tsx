// The way in to reporting, and what it carries with it.
//
// Three placements, one difference between them: whether the block is already
// known. Getting that wrong is not cosmetic - a report opened from the on-site
// card must arrive with the block AND the visit in progress, or the link
// between "someone reported a blocked fire door" and "someone was cleaning that
// building at the time" is lost.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { PendingReport } from "@/db/types";

import { ReportButton } from "./ReportButton";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const mockPending = { current: [] as PendingReport[] };
jest.mock("@/data/useReports", () => ({ usePendingReports: () => mockPendingRef().current }));

function mockPendingRef() {
	return mockPending;
}

const push = router.push as jest.Mock;

beforeEach(() => {
	jest.clearAllMocks();
	mockPending.current = [];
});

test("from a block, the report opens against that block", async () => {
	await render(<ReportButton site={{ id: "b1", name: "Elm Court" }} />);
	fireEvent.press(screen.getByText("Report an issue"));

	expect(push).toHaveBeenCalledWith({
		pathname: "/(app)/report",
		params: { siteId: "b1", siteName: "Elm Court" },
	});
});

test("from the on-site card, it carries the visit in progress too", async () => {
	await render(<ReportButton site={{ id: "b1", name: "Elm Court" }} attendanceClientId="attend-1" />);
	fireEvent.press(screen.getByText("Report an issue"));

	expect(push).toHaveBeenCalledWith({
		pathname: "/(app)/report",
		params: { siteId: "b1", siteName: "Elm Court", attendance: "attend-1" },
	});
});

// No block, no params: the screen asks. Sending an empty siteId would look like
// a block to the route guard and produce a report nobody can file.
test("with no block, it passes none rather than an empty one", async () => {
	await render(<ReportButton />);
	fireEvent.press(screen.getByText("Report an issue"));

	expect(push).toHaveBeenCalledWith({ pathname: "/(app)/report", params: {} });
});

test("says nothing about the queue when it is empty", async () => {
	await render(<ReportButton site={{ id: "b1", name: "Elm Court" }} />);

	expect(screen.queryByText(/waiting to send/)).toBeNull();
});

// "Nothing appeared to happen" is how people stop reporting things.
test("reports still on the phone are counted, in plain words", async () => {
	mockPending.current = [{ local_id: "a" }, { local_id: "b" }] as PendingReport[];
	await render(<ReportButton site={{ id: "b1", name: "Elm Court" }} />);

	expect(screen.getByText("2 reports waiting to send - they go when you have signal.")).toBeTruthy();
});

test("one report is not 1 reports", async () => {
	mockPending.current = [{ local_id: "a" }] as PendingReport[];
	await render(<ReportButton site={{ id: "b1", name: "Elm Court" }} />);

	expect(screen.getByText("1 report waiting to send - they go when you have signal.")).toBeTruthy();
});
