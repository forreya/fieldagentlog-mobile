// The report replay matrix.
//
// Same failure modes as a visit, and the same rule: the signal dies at every
// possible point and the report must still arrive exactly once, with every
// photo it was sent with.

import * as reportApi from "@/api/report";
import { ApiError } from "@/api/errors";
import * as photoStore from "@/db/photoStore";
import * as reportsDb from "@/db/reports";
import type { PendingReport, ReportPhoto } from "@/db/types";

import { createReportSource, pendingPhotoTotal, pushReport, reportHasWork } from "./reportSync";

jest.mock("@/api/report");
jest.mock("@/db/reports");
jest.mock("@/db/photoStore");

const api = reportApi as jest.Mocked<typeof reportApi>;
const db = reportsDb as jest.Mocked<typeof reportsDb>;
const store = photoStore as jest.Mocked<typeof photoStore>;

const photo = (n: number, ref: ReportPhoto["ref"] = null): ReportPhoto => ({
	local_id: `p${n}`,
	file: { uri: `file://${n}.jpg`, name: `${n}.jpg`, type: "image/jpeg" },
	ref,
});

const refFor = (n: number) => ({ path: `org/${n}.jpg`, file_name: `${n}.jpg`, content_type: "image/jpeg" });

const report = (over: Partial<PendingReport> = {}): PendingReport => ({
	local_id: "rep-1",
	site_id: "site-1",
	site_name: "Elm Court",
	category: "repairs",
	note: "Bin store door won't latch.",
	photos: [],
	at: 1_760_000_000_000,
	point: null,
	attendance_client_id: null,
	...over,
});

const saved = () => db.saveReport.mock.calls.map(([r]) => r);

beforeEach(() => {
	jest.clearAllMocks();
	api.uploadReportPhoto.mockImplementation(async (_block, file) => refFor(Number(file.name.split(".")[0])));
	api.createReport.mockResolvedValue({ report_id: "srv-1", status: "open" });
});

test("a report with no photos goes straight up", async () => {
	await pushReport(report());

	expect(api.uploadReportPhoto).not.toHaveBeenCalled();
	expect(api.createReport).toHaveBeenCalledWith(expect.objectContaining({ clientId: "rep-1", blockId: "site-1", photos: [] }));
	expect(db.deleteReport).toHaveBeenCalledWith("rep-1");
});

test("photos go first, then the report that names them", async () => {
	await pushReport(report({ photos: [photo(1), photo(2)] }));

	expect(api.uploadReportPhoto).toHaveBeenCalledTimes(2);
	expect(api.createReport).toHaveBeenCalledWith(expect.objectContaining({ photos: [refFor(1), refFor(2)] }));
	// Order, not just occurrence: the server refuses a report naming a path
	// nobody uploaded.
	expect(api.uploadReportPhoto.mock.invocationCallOrder[1]).toBeLessThan(api.createReport.mock.invocationCallOrder[0]);
});

test("each ref is persisted as it lands", async () => {
	await pushReport(report({ photos: [photo(1), photo(2)] }));

	// One save per upload, each carrying the ref just obtained.
	expect(saved()[0].photos[0].ref).toEqual(refFor(1));
	expect(saved()[0].photos[1].ref).toBeNull();
	expect(saved()[1].photos[1].ref).toEqual(refFor(2));
});

test("a signal that dies after three of five does not cost the three", async () => {
	// The case per-photo persistence exists for.
	const photos = [photo(1), photo(2), photo(3), photo(4), photo(5)];
	api.uploadReportPhoto
		.mockResolvedValueOnce(refFor(1))
		.mockResolvedValueOnce(refFor(2))
		.mockResolvedValueOnce(refFor(3))
		.mockRejectedValueOnce(new ApiError("network", "No signal."));

	await expect(pushReport(report({ photos }))).rejects.toThrow("No signal.");

	const afterFirstPass = saved().at(-1) as PendingReport;
	expect(afterFirstPass.photos.filter((p) => p.ref).length).toBe(3);
	expect(api.createReport).not.toHaveBeenCalled();
	expect(db.deleteReport).not.toHaveBeenCalled();

	// The next pass resumes at photo four.
	jest.clearAllMocks();
	api.uploadReportPhoto.mockImplementation(async (_b, file) => refFor(Number(file.name.split(".")[0])));
	api.createReport.mockResolvedValue({ report_id: "srv-1", status: "open" });

	await pushReport(afterFirstPass);

	expect(api.uploadReportPhoto).toHaveBeenCalledTimes(2);
	expect(api.createReport).toHaveBeenCalledWith(expect.objectContaining({ photos: [refFor(1), refFor(2), refFor(3), refFor(4), refFor(5)] }));
});

test("a create that fails leaves every ref intact for the retry", async () => {
	api.createReport.mockRejectedValue(new ApiError("network", "No signal."));

	await expect(pushReport(report({ photos: [photo(1)] }))).rejects.toThrow("No signal.");

	expect((saved().at(-1) as PendingReport).photos[0].ref).toEqual(refFor(1));
	expect(db.deleteReport).not.toHaveBeenCalled();
	// The bytes are still needed; nothing was cleaned up.
	expect(store.deleteStoredPhoto).not.toHaveBeenCalled();
});

test("once it lands, the local copy and its bytes are dropped", async () => {
	await pushReport(report({ photos: [photo(1), photo(2)] }));

	expect(store.deleteStoredPhoto).toHaveBeenCalledWith("file://1.jpg");
	expect(store.deleteStoredPhoto).toHaveBeenCalledWith("file://2.jpg");
	expect(db.deleteReport).toHaveBeenCalledWith("rep-1");
});

test("an already-uploaded photo is not uploaded again", async () => {
	await pushReport(report({ photos: [photo(1, refFor(1)), photo(2)] }));

	expect(api.uploadReportPhoto).toHaveBeenCalledTimes(1);
	expect(api.createReport).toHaveBeenCalledWith(expect.objectContaining({ photos: [refFor(1), refFor(2)] }));
});

test("what it sends is what was reported, not when it synced", async () => {
	await pushReport(report({ at: 1_700_000_000_000, point: { lat: 51.5, lng: -0.1, accuracy: 40, at: 1 }, attendance_client_id: "att-1" }));

	expect(api.createReport).toHaveBeenCalledWith(
		expect.objectContaining({ at: 1_700_000_000_000, point: { lat: 51.5, lng: -0.1, accuracy: 40, at: 1 }, attendanceClientId: "att-1" }),
	);
});

describe("a failure retrying cannot fix", () => {
	const permanent = () => new ApiError("forbidden", "That block isn't assigned to you.");

	test("is recorded and the report is never offered again", async () => {
		api.createReport.mockRejectedValue(permanent());

		await expect(pushReport(report({ photos: [photo(1)] }))).rejects.toThrow();

		const stored = saved().at(-1) as PendingReport;
		expect(stored.sync_error?.message).toBe("That block isn't assigned to you.");
		expect(reportHasWork(stored)).toBe(false);
		// Kept, not deleted: somebody still needs to know what they saw.
		expect(db.deleteReport).not.toHaveBeenCalled();
	});

	test("refs already obtained are not thrown away", async () => {
		api.createReport.mockRejectedValue(permanent());

		await expect(pushReport(report({ photos: [photo(1)] }))).rejects.toThrow();

		expect((saved().at(-1) as PendingReport).photos[0].ref).toEqual(refFor(1));
	});
});

describe("the badge", () => {
	test("counts photos still on the phone, across reports", async () => {
		expect(pendingPhotoTotal([report({ photos: [photo(1), photo(2, refFor(2))] }), report({ photos: [photo(3)] })])).toBe(2);
	});

	test("is zero when everything has a ref", async () => {
		expect(pendingPhotoTotal([report({ photos: [photo(1, refFor(1))] })])).toBe(0);
	});
});

describe("the source", () => {
	test("offers one task per report that can still be sent", async () => {
		const source = createReportSource(async () => [
			report({ local_id: "a" }),
			report({ local_id: "b", sync_error: { message: "nope", at: 1 } }),
			report({ local_id: "c" }),
		]);

		const tasks = await source.pending();

		expect(source.name).toBe("reports");
		expect(tasks.map((t) => t.id)).toEqual(["report:a", "report:c"]);
	});
});

test("a report queued while signed out is kept sendable", async () => {
	// An expired session is not retryable as-is, but signing back in fixes it.
	// Recording it as permanent threw away two real reports on device.
	api.createReport.mockRejectedValue(new ApiError("auth", "You're not signed in."));

	await expect(pushReport(report())).rejects.toThrow();

	expect(saved().every((r) => !r.sync_error)).toBe(true);
});
