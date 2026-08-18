import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import type { ReportDraftView } from "@/report/useReportDraft";

import { ReportIssue } from "./ReportIssue";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));

const mockDraft = { current: {} as ReportDraftView };
jest.mock("@/report/useReportDraft", () => ({ useReportDraft: () => mockDraft.current }));

const FILE = { uri: "file://a.jpg", name: "a.jpg", type: "image/jpeg" };

async function show(over: Partial<ReportDraftView> = {}) {
	mockDraft.current = {
		draft: { category: "repairs", note: "", photos: [] },
		busy: false,
		tried: false,
		error: null,
		canAddPhoto: true,
		setCategory: jest.fn(),
		setNote: jest.fn(),
		addPhoto: jest.fn(),
		removePhoto: jest.fn(),
		send: jest.fn(async () => true),
		dismissError: jest.fn(),
		...over,
	};
	await render(<ReportIssue site={{ id: "s1", name: "Elm Court" }} />);
	return mockDraft.current;
}

test("names the site it is about, so nobody reports against the wrong one", async () => {
	await show();
	expect(screen.getByText("Elm Court")).toBeTruthy();
});

test("offers every category, with repairs selected by default", async () => {
	await show();

	expect(screen.getByLabelText("Repair")).toBeTruthy();
	expect(screen.getByLabelText("Waste")).toBeTruthy();
	expect(screen.getByLabelText("Antisocial")).toBeTruthy();
});

test("picking a category reports it", async () => {
	const view = await show();
	fireEvent.press(screen.getByLabelText("Waste"));
	expect(view.setCategory).toHaveBeenCalledWith("waste");
});

test("the note error appears only after a send has been tried", async () => {
	await show({ tried: false, draft: { category: "repairs", note: "", photos: [] } });
	expect(screen.queryByText("Please say what the issue is.")).toBeNull();

	await show({ tried: true, draft: { category: "repairs", note: "", photos: [] } });
	expect(screen.getByText("Please say what the issue is.")).toBeTruthy();
});

test("a successful send returns to where they came from", async () => {
	const view = await show();
	fireEvent.press(screen.getByRole("button", { name: "Send" }));

	await screen.findByText("Elm Court");
	expect(view.send).toHaveBeenCalled();
});

describe("photos", () => {
	test("the button invites the first one, then more", async () => {
		await show({ draft: { category: "repairs", note: "", photos: [] } });
		expect(screen.getByRole("button", { name: "Add a photo" })).toBeTruthy();

		await show({ draft: { category: "repairs", note: "", photos: [{ local_id: "p1", file: FILE }] } });
		expect(screen.getByRole("button", { name: "Add another" })).toBeTruthy();
	});

	test("each attached photo can be removed", async () => {
		const view = await show({ draft: { category: "repairs", note: "", photos: [{ local_id: "p1", file: FILE }] } });

		fireEvent.press(screen.getByLabelText("Remove photo 1"));
		expect(view.removePhoto).toHaveBeenCalledWith("p1");
	});

	test("at the cap the button is replaced by an explanation", async () => {
		// Better than a disabled button nobody can interpret.
		await show({ canAddPhoto: false, draft: { category: "repairs", note: "", photos: [] } });

		expect(screen.queryByRole("button", { name: /Add/ })).toBeNull();
		expect(screen.getByText(/maximum of 10/)).toBeTruthy();
	});
});

test("an error is shown and can be dismissed", async () => {
	const view = await show({ error: "You can attach up to 10 photos." });

	expect(screen.getByText("You can attach up to 10 photos.")).toBeTruthy();
	fireEvent.press(screen.getByLabelText("Dismiss"));
	expect(view.dismissError).toHaveBeenCalled();
});

test("cancel goes back without sending", async () => {
	const view = await show();
	fireEvent.press(screen.getByRole("button", { name: "Cancel" }));

	expect(router.back).toHaveBeenCalled();
	expect(view.send).not.toHaveBeenCalled();
});
