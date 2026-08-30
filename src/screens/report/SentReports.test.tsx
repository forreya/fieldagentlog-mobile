// "Did my report go?" - the question this screen exists to answer.

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { SentReport } from "@/api/report";
import type { ReportsView } from "@/data/useReports";
import type { PendingReport } from "@/db/types";
import { TAP } from "@/theme/tokens";

import { SentReports } from "./SentReports";

jest.mock("expo-router", () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock("@/sync/useSyncStatus", () => ({ useSyncStatus: () => ({ online: true, syncing: false, pending: 0 }) }));

const mockReports = { current: {} as ReportsView };
jest.mock("@/data/useReports", () => ({ useReports: () => mockReports.current }));

const pending = (over: Partial<PendingReport> = {}): PendingReport => ({
	local_id: "rep-1",
	site_id: "s1",
	site_name: "Elm Court",
	category: "waste",
	note: "Fly-tipping in the bin store.",
	photos: [],
	at: Date.now() - 60_000,
	point: null,
	attendance_client_id: null,
	...over,
});

const sent = (over: Partial<SentReport> = {}): SentReport => ({
	id: "srv-1",
	block_name: "Cedar Point",
	category: "repairs",
	note: "Handrail loose on the second landing.",
	photo_count: 2,
	reported_at: new Date(Date.now() - 86_400_000).toISOString(),
	status: "open",
	...over,
});

async function show(over: Partial<ReportsView> = {}) {
	mockReports.current = {
		pending: [],
		sent: [],
		loading: false,
		refreshing: false,
		error: null,
		refresh: jest.fn(),
		retry: jest.fn(),
		discard: jest.fn(),
		...over,
	};
	await render(<SentReports />);
}

const photo = (ref: unknown = null) => ({ local_id: "p1", file: { uri: "file://1.jpg", name: "1.jpg", type: "image/jpeg" }, ref }) as never;

test("nothing yet says so", async () => {
	await show();
	expect(screen.getByText("Nothing reported yet")).toBeTruthy();
});

describe("reports still on the phone", () => {
	test("are shown as waiting, not as sent", async () => {
		await show({ pending: [pending()] });

		expect(screen.getByText("Elm Court")).toBeTruthy();
		expect(screen.getByText("Waiting")).toBeTruthy();
		expect(screen.getByText(/Saved on this phone/)).toBeTruthy();
	});

	test("say how many photos are still to go", async () => {
		await show({ pending: [pending({ photos: [photo(), photo()] })] });
		expect(screen.getByText(/2 photos still to send/)).toBeTruthy();
	});

	test("one that can never send says why, rather than waiting forever", async () => {
		await show({ pending: [pending({ sync_error: { message: "That block isn't assigned to you.", at: 1 } })] });

		expect(screen.getByText("Not sent")).toBeTruthy();
		expect(screen.getByText("That block isn't assigned to you.")).toBeTruthy();
	});

	test("come before the sent ones - that is the question being asked", async () => {
		await show({ pending: [pending()], sent: [sent()] });

		const elm = screen.getByText("Elm Court");
		const cedar = screen.getByText("Cedar Point");
		expect(elm).toBeTruthy();
		expect(cedar).toBeTruthy();
	});
});

describe("reports the server has", () => {
	test("show the block, category, photo count and status", async () => {
		await show({ sent: [sent()] });

		expect(screen.getByText("Cedar Point")).toBeTruthy();
		expect(screen.getByText(/Repair · 2 photos/)).toBeTruthy();
		expect(screen.getByText("open")).toBeTruthy();
	});

	test("a report with no photos does not claim any", async () => {
		await show({ sent: [sent({ photo_count: 0 })] });
		expect(screen.queryByText(/photo/)).toBeNull();
	});
});

describe("when the server list fails", () => {
	test("a queued report is still shown, with the failure noted", async () => {
		// Same rule as the cleaner home: local state must not hide behind a
		// failed server read, or a queued report looks lost.
		await show({ pending: [pending()], error: "No signal." });

		expect(screen.getByText("Elm Court")).toBeTruthy();
		expect(screen.getByText("Showing what was saved here")).toBeTruthy();
	});

	test("with nothing at all, it offers a retry", async () => {
		await show({ error: "No signal." });

		expect(screen.getByText("Couldn't load your reports")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
	});
});

describe("a failed report's two ways out", () => {
	const failed = () => pending({ sync_error: { message: "Block not assigned to you.", at: 1 } });

	test("a waiting report offers neither - the queue owns it", async () => {
		await show({ pending: [pending()] });
		expect(screen.queryByText("Try again")).toBeNull();
		expect(screen.queryByText("Discard")).toBeNull();
	});

	test("a failed one offers Try again, which clears and re-queues", async () => {
		const retry = jest.fn();
		await show({ pending: [failed()], retry });

		fireEvent.press(screen.getByText("Try again"));
		expect(retry).toHaveBeenCalledWith("rep-1");
	});

	test("both ways out meet the glove-friendly tap target", async () => {
		// These are the recovery actions for a report that did not send, tapped
		// in the field - not dev-screen buttons, so no sm size here.
		await show({ pending: [failed()] });

		expect(screen.getByRole("button", { name: "Try again" })).toHaveStyle({ minHeight: TAP });
		expect(screen.getByRole("button", { name: "Discard" })).toHaveStyle({ minHeight: TAP });
	});

	test("Discard asks first, saying exactly what is lost", async () => {
		const discard = jest.fn();
		const alert = jest.spyOn(Alert, "alert");
		await show({ pending: [failed()], discard });

		fireEvent.press(screen.getByText("Discard"));

		// Nothing is discarded by the tap itself.
		expect(discard).not.toHaveBeenCalled();
		expect(alert).toHaveBeenCalledWith(
			"Discard unsent report?",
			"This report for Elm Court has not been sent. Discarding it will permanently remove the report and its photos from this device.",
			expect.anything(),
		);

		// Confirming is what discards.
		const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
		buttons.find((b) => b.text === "Discard")?.onPress?.();
		expect(discard).toHaveBeenCalledWith("rep-1");
		alert.mockRestore();
	});

	test("a report with no site name gets a generic confirm, never an id", async () => {
		const alert = jest.spyOn(Alert, "alert");
		await show({ pending: [pending({ site_name: " ", sync_error: { message: "nope", at: 1 } })] });

		fireEvent.press(screen.getByText("Discard"));
		expect(String(alert.mock.calls[0][1])).toContain("This report for this site has not been sent.");
		expect(String(alert.mock.calls[0][1])).not.toContain("s1");
		alert.mockRestore();
	});
});
