import * as FS from "expo-file-system";

import { deleteStoredPhoto, storePhoto, storedPhotoExists, storeUsageBytes, sweepOrphans } from "./photoStore";

jest.mock("expo-file-system");
jest.mock("expo-crypto", () => {
	let n = 0;
	return { randomUUID: () => `uuid-${++n}` };
});

// Reached through the package specifier: importing the mock file by path would
// create a second module identity (see db.test.ts).
const { __resetFileSystem } = FS as unknown as { __resetFileSystem: () => void };

beforeEach(() => __resetFileSystem());

/** A photo as the camera hands it over: sitting in the cache directory. */
function captured(name = "IMG_0001.jpg", bytes = "photo-bytes"): { uri: string; name: string; type: string } {
	const file = new FS.File(FS.Paths.cache, name);
	(file as unknown as { write: (s: string) => void }).write(bytes);
	return { uri: file.uri, name, type: "image/jpeg" };
}

describe("storePhoto", () => {
	test("copies the bytes out of cache into permanent storage", async () => {
		const source = captured();
		const stored = await storePhoto(source);

		expect(stored.uri).not.toBe(source.uri);
		expect(stored.uri).toContain("/document/photos/");
		expect(storedPhotoExists(stored.uri)).toBe(true);
	});

	test("leaves the original alone - the picker owns it, and iOS may reuse it", async () => {
		const source = captured();
		await storePhoto(source);
		expect(new FS.File(source.uri).exists).toBe(true);
	});

	test("keeps the human filename as metadata while renaming on disk", async () => {
		const stored = await storePhoto(captured("Front door closer.jpg"));
		// The name travels to the server; the disk name is ours.
		expect(stored.name).toBe("Front door closer.jpg");
		expect(stored.uri).not.toContain("Front door closer");
	});

	test("never lets a source name escape the photo directory", async () => {
		// A traversal name must not write outside the sandbox. The stored path is
		// generated, so the dots simply never reach the filesystem.
		const stored = await storePhoto(captured("evil.jpg"));
		const renamed = { ...captured("x.jpg"), name: "../../../../etc/passwd" };
		const stored2 = await storePhoto(renamed);

		for (const uri of [stored.uri, stored2.uri]) {
			expect(uri).toContain("/document/photos/");
			expect(uri).not.toContain("..");
		}
	});

	test("preserves the extension, and falls back to .jpg when there is none", async () => {
		expect((await storePhoto(captured("a.png"))).uri).toMatch(/\.png$/);
		expect((await storePhoto(captured("noextension"))).uri).toMatch(/\.jpg$/);
	});

	test("two photos with the same name do not collide", async () => {
		const a = await storePhoto(captured("IMG_0001.jpg", "first"));
		const b = await storePhoto(captured("IMG_0001.jpg", "second"));
		expect(a.uri).not.toBe(b.uri);
		expect(storedPhotoExists(a.uri)).toBe(true);
		expect(storedPhotoExists(b.uri)).toBe(true);
	});

	test("a missing source fails loudly rather than queueing an empty photo", async () => {
		await expect(storePhoto({ uri: "file:///nope/gone.jpg", name: "gone.jpg", type: "image/jpeg" })).rejects.toThrow();
	});
});

describe("deleteStoredPhoto", () => {
	test("removes the file", async () => {
		const stored = await storePhoto(captured());
		deleteStoredPhoto(stored.uri);
		expect(storedPhotoExists(stored.uri)).toBe(false);
	});

	test("deleting twice is harmless - a swept photo must not jam the queue", async () => {
		const stored = await storePhoto(captured());
		deleteStoredPhoto(stored.uri);
		expect(() => deleteStoredPhoto(stored.uri)).not.toThrow();
	});

	test("an unknown path is ignored rather than thrown", () => {
		expect(() => deleteStoredPhoto("file:///nope/missing.jpg")).not.toThrow();
	});
});

describe("sweepOrphans", () => {
	test("keeps referenced photos and removes the rest", async () => {
		const keep = await storePhoto(captured("keep.jpg"));
		const orphan = await storePhoto(captured("orphan.jpg"));

		const removed = sweepOrphans([keep.uri]);

		expect(removed).toBe(1);
		expect(storedPhotoExists(keep.uri)).toBe(true);
		expect(storedPhotoExists(orphan.uri)).toBe(false);
	});

	test("an empty reference set clears everything - used when a visit is finished", async () => {
		await storePhoto(captured("a.jpg"));
		await storePhoto(captured("b.jpg"));
		expect(sweepOrphans([])).toBe(2);
		expect(storeUsageBytes()).toBe(0);
	});

	test("sweeping an empty store is a no-op, not an error", () => {
		expect(sweepOrphans(["file:///anything.jpg"])).toBe(0);
	});
});

describe("storeUsageBytes", () => {
	test("adds up what the queue is holding", async () => {
		await storePhoto(captured("a.jpg", "12345"));
		await storePhoto(captured("b.jpg", "123"));
		expect(storeUsageBytes()).toBe(8);
	});

	test("reports zero rather than throwing when nothing has been stored", () => {
		expect(storeUsageBytes()).toBe(0);
	});
});
