// What makes a report sendable, and what it becomes.

import { canAddPhoto, draftProblem, emptyDraft, MAX_PHOTOS, toPendingReport, type Draft } from "./draft";

jest.mock("expo-crypto", () => ({ randomUUID: () => "uuid-1" }));

const photo = (n: number) => ({ local_id: `p${n}`, file: { uri: `file://${n}.jpg`, name: `${n}.jpg`, type: "image/jpeg" } });
const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });

describe("what stops a report being sent", () => {
	test("a note is required - a photo on its own is a puzzle", async () => {
		expect(draftProblem(draft({ note: "" }))).toMatch(/Say what the issue is/);
		expect(draftProblem(draft({ note: "   " }))).toMatch(/Say what the issue is/);
	});

	test("a note on its own is enough - photos are not required", async () => {
		// The opposite of what people expect, and deliberate: whoever picks this
		// up is not standing where the reporter is.
		expect(draftProblem(draft({ note: "Bin store door won't latch." }))).toBeNull();
	});

	test("more than the cap is refused", async () => {
		const photos = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => photo(i));
		expect(draftProblem(draft({ note: "x", photos }))).toBe(`You can attach up to ${MAX_PHOTOS} photos.`);
	});
});

describe("the photo cap", () => {
	test("allows up to the maximum and no further", () => {
		expect(canAddPhoto(draft({ photos: [] }))).toBe(true);
		expect(canAddPhoto(draft({ photos: Array.from({ length: MAX_PHOTOS - 1 }, (_, i) => photo(i)) }))).toBe(true);
		expect(canAddPhoto(draft({ photos: Array.from({ length: MAX_PHOTOS }, (_, i) => photo(i)) }))).toBe(false);
	});
});

describe("becoming a pending report", () => {
	const site = { id: "s1", name: "Elm Court" };
	const point = { lat: 51.5, lng: -0.1, accuracy: 40, at: 1_760_000_000_000 };

	test("carries the site, category, trimmed note and photos", () => {
		const report = toPendingReport(
			draft({ category: "waste", note: "  Fly-tipping in the bin store.  ", photos: [photo(1)] }),
			site,
			point,
			null,
			123,
		);

		expect(report).toMatchObject({
			site_id: "s1",
			site_name: "Elm Court",
			category: "waste",
			note: "Fly-tipping in the bin store.",
			at: 123,
			point,
			attendance_client_id: null,
		});
		expect(report.photos).toEqual([{ local_id: "p1", file: photo(1).file, ref: null }]);
	});

	test("the timestamp is when it was raised, not when it will sync", () => {
		// A report queued underground on Friday and sent on Monday happened on
		// Friday, and the managing agent needs to see Friday.
		const report = toPendingReport(draft({ note: "x" }), site, null, null, 1_700_000_000_000);
		expect(report.at).toBe(1_700_000_000_000);
	});

	test("no position is a fine answer", () => {
		expect(toPendingReport(draft({ note: "x" }), site, null, null).point).toBeNull();
	});

	test("links to the cleaning visit when raised during one", () => {
		expect(toPendingReport(draft({ note: "x" }), site, null, "att-1").attendance_client_id).toBe("att-1");
	});

	test("every photo starts with no server ref - that is the queue's job", () => {
		const report = toPendingReport(draft({ note: "x", photos: [photo(1), photo(2)] }), site, null, null);
		expect(report.photos.every((p) => p.ref === null)).toBe(true);
	});
});
