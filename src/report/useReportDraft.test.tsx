// The form's behaviour, and the one rule that matters: the report is on disk
// before anything touches the network.

import { act, renderHook, waitFor } from "@testing-library/react-native";

import * as reportsDb from "@/db/reports";
import * as position from "@/lib/position";
import { syncEngine } from "@/sync/engine";
import * as photos from "@/visit/photos";

import { MAX_PHOTOS } from "./draft";
import { useReportDraft } from "./useReportDraft";

jest.mock("@/db/reports");
jest.mock("@/lib/position");
jest.mock("@/visit/photos");
jest.mock("@/sync/engine", () => ({ syncEngine: { sync: jest.fn() } }));
jest.mock("expo-crypto", () => {
	let n = 0;
	return { randomUUID: () => `uuid-${++n}` };
});

const db = reportsDb as jest.Mocked<typeof reportsDb>;
const geo = position as jest.Mocked<typeof position>;
const pick = photos as jest.Mocked<typeof photos>;
const engine = syncEngine as unknown as { sync: jest.Mock };

const SITE = { id: "s1", name: "Elm Court" };
const FIX = { lat: 51.5, lng: -0.1, accuracy: 40, at: 1_760_000_000_000 };
const FILE = { uri: "file://a.jpg", name: "a.jpg", type: "image/jpeg" };

beforeEach(() => {
	jest.clearAllMocks();
	db.saveReport.mockResolvedValue(undefined);
	geo.captureReportFix.mockResolvedValue(FIX);
	pick.pickAndStore.mockResolvedValue({ status: "stored", file: FILE });
	pick.deniedMessage.mockReturnValue("denied copy");
});

const mount = () => renderHook(() => useReportDraft(SITE, null));

test("an empty note is refused, and nothing is written", async () => {
	const { result } = await mount();

	let sent: boolean | undefined;
	await act(async () => {
		sent = await result.current.send();
	});

	expect(sent).toBe(false);
	expect(result.current.error).toMatch(/Say what the issue is/);
	expect(db.saveReport).not.toHaveBeenCalled();
	expect(engine.sync).not.toHaveBeenCalled();
});

test("the form does not scold somebody who is still typing", async () => {
	// `tried` gates the inline error: it appears on the first send, not on the
	// first keystroke.
	const { result } = await mount();
	expect(result.current.tried).toBe(false);

	await act(async () => void (await result.current.send()));
	expect(result.current.tried).toBe(true);
});

test("a valid report is saved and queued, in that order", async () => {
	const { result } = await mount();
	await act(async () => result.current.setNote("Bin store door won't latch."));

	let sent: boolean | undefined;
	await act(async () => {
		sent = await result.current.send();
	});

	expect(sent).toBe(true);
	expect(db.saveReport).toHaveBeenCalledWith(expect.objectContaining({ site_id: "s1", note: "Bin store door won't latch.", point: FIX }));
	// Persisted before the engine hears about it: a sync that runs first has
	// nothing to find.
	expect(db.saveReport.mock.invocationCallOrder[0]).toBeLessThan(engine.sync.mock.invocationCallOrder[0]);
});

test("a report still sends when no position can be had", async () => {
	// A bin store rarely has a fix. Losing the report over it would be absurd.
	geo.captureReportFix.mockResolvedValue(null);
	const { result } = await mount();
	await act(async () => result.current.setNote("Leak on the stairs."));

	await act(async () => void (await result.current.send()));

	expect(db.saveReport).toHaveBeenCalledWith(expect.objectContaining({ point: null }));
});

describe("photos", () => {
	test("adding one puts it in the draft", async () => {
		const { result } = await mount();

		await act(async () => void (await result.current.addPhoto("camera")));

		expect(result.current.draft.photos).toHaveLength(1);
		expect(result.current.draft.photos[0].file).toEqual(FILE);
	});

	test("cancelling the picker changes nothing and says nothing", async () => {
		pick.pickAndStore.mockResolvedValue({ status: "cancelled" });
		const { result } = await mount();

		await act(async () => void (await result.current.addPhoto("library")));

		expect(result.current.draft.photos).toHaveLength(0);
		expect(result.current.error).toBeNull();
	});

	test("a refused permission explains itself", async () => {
		pick.pickAndStore.mockResolvedValue({ status: "denied", source: "camera" });
		const { result } = await mount();

		await act(async () => void (await result.current.addPhoto("camera")));

		expect(result.current.error).toBe("denied copy");
	});

	test("the cap stops at the maximum and says so", async () => {
		const { result } = await mount();
		for (let i = 0; i < MAX_PHOTOS; i++) {
			await act(async () => void (await result.current.addPhoto("camera")));
		}
		expect(result.current.draft.photos).toHaveLength(MAX_PHOTOS);
		expect(result.current.canAddPhoto).toBe(false);

		await act(async () => void (await result.current.addPhoto("camera")));

		expect(result.current.draft.photos).toHaveLength(MAX_PHOTOS);
		expect(result.current.error).toBe(`You can attach up to ${MAX_PHOTOS} photos.`);
	});

	test("one can be removed to make room", async () => {
		const { result } = await mount();
		await act(async () => void (await result.current.addPhoto("camera")));
		const id = result.current.draft.photos[0].local_id;

		await act(async () => result.current.removePhoto(id));

		expect(result.current.draft.photos).toHaveLength(0);
		expect(result.current.canAddPhoto).toBe(true);
	});
});

test("the category defaults to repairs and can be changed", async () => {
	const { result } = await mount();
	expect(result.current.draft.category).toBe("repairs");

	await act(async () => result.current.setCategory("waste"));
	await waitFor(() => expect(result.current.draft.category).toBe("waste"));
});

// A cleaner opening the form cold has not said where yet. That is a validation
// rule like the empty note, not a reason to refuse to render the form - and it
// must never be guessed, because a report filed against the wrong building is
// worse than one that made someone tap twice.
test("a report with no site chosen is refused, and nothing is written", async () => {
	const { result } = await renderHook(() => useReportDraft(null, null));

	await act(async () => {
		result.current.setNote("Bike chained across the fire exit.");
	});

	let sent: boolean | undefined;
	await act(async () => {
		sent = await result.current.send();
	});

	expect(sent).toBe(false);
	expect(result.current.error).toBe("Choose which site this is about.");
	expect(db.saveReport).not.toHaveBeenCalled();
	expect(engine.sync).not.toHaveBeenCalled();
});

// The attendance link is what ties "someone reported a blocked fire door" to
// "someone was cleaning that building at the time".
test("a report raised while on site carries the attendance id", async () => {
	const { result } = await renderHook(() => useReportDraft(SITE, "attend-1"));

	await act(async () => {
		result.current.setNote("Bin store door propped open.");
	});
	await act(async () => {
		await result.current.send();
	});

	await waitFor(() => expect(db.saveReport).toHaveBeenCalled());
	expect(db.saveReport.mock.calls[0][0]).toMatchObject({ site_id: "s1", attendance_client_id: "attend-1" });
});
