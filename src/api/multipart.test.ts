// The file part, pinned to what the runtime's fetch accepts. FIND-011: the
// old { uri, name, type } descriptor threw "Unsupported FormDataPart
// implementation" inside Expo's fetch before any network I/O, in every build,
// and no shipped binary had ever uploaded a photo. These tests keep the part
// in the converter's contract: bytes() plus name/type - and never a bare uri.

import * as FS from "expo-file-system";

import { appendFile, filePart } from "./multipart";

jest.mock("expo-file-system");

const { __resetFileSystem, File, Paths } = FS as unknown as {
	__resetFileSystem: () => void;
	File: typeof FS.File;
	Paths: typeof FS.Paths;
};

beforeEach(() => __resetFileSystem());

/** A stored photo like the queue holds: uuid on disk, original name as metadata. */
function storedPhoto(contents = "jpeg-bytes") {
	const stored = new File(Paths.document, "3fd1a6de-store.jpg");
	stored.write(contents);
	return { uri: stored.uri, name: "IMG_0042.jpeg", type: "image/jpeg" };
}

test("carries the capture's name and MIME type, not the stored file's", () => {
	const part = filePart(storedPhoto());

	// The uuid name on disk is bookkeeping; the part headers should say what
	// the inspector's camera said.
	expect(part.name).toBe("IMG_0042.jpeg");
	expect(part.type).toBe("image/jpeg");
});

test("bytes() hands over exactly what is on disk", async () => {
	const part = filePart(storedPhoto("the actual photo bytes"));
	expect(new TextDecoder().decode(await part.bytes())).toBe("the actual photo bytes");
});

test("bytes are read lazily - building the part touches nothing", async () => {
	// A part for a file that does not exist must not throw until fetch itself
	// asks for the bytes: construction happens at append time, reads happen at
	// send time, and only the second is allowed to cost anything.
	const part = filePart({ uri: `${Paths.document.uri}/missing.jpg`, name: "x.jpg", type: "image/jpeg" });
	await expect(part.bytes()).rejects.toThrow();
});

test("appendFile appends a bytes()-bearing part - never the {uri} descriptor", () => {
	const form = new FormData();
	const append = jest.spyOn(form, "append");

	appendFile(form, "file", storedPhoto());

	const [field, part] = append.mock.calls[0] as unknown as [string, Record<string, unknown>];
	expect(field).toBe("file");
	// The exact property Expo's converter throws on. If a uri ever reaches
	// append again, every photo upload in the app is dead again.
	expect(part).not.toHaveProperty("uri");
	expect(typeof part.bytes).toBe("function");
	expect(part.name).toBe("IMG_0042.jpeg");
	expect(part.type).toBe("image/jpeg");
});
