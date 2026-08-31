import { ImageManipulator } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { addPendingPhoto, deletePhoto, getPhoto } from "@/db/photos";
import { deleteStoredPhoto, storePhoto } from "@/db/photoStore";

import { capturePhoto, discardPhoto, downscale, MAX_EDGE } from "./photos";

jest.mock("expo-image-picker");
jest.mock("expo-image-manipulator");
jest.mock("@/db/photos", () => ({ addPendingPhoto: jest.fn(), getPhoto: jest.fn(), deletePhoto: jest.fn() }));
jest.mock("@/db/photoStore", () => ({ storePhoto: jest.fn(), deleteStoredPhoto: jest.fn() }));
jest.mock("@/lib/id", () => ({ uuid: () => "local-1" }));

const picker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const manipulator = ImageManipulator as jest.Mocked<typeof ImageManipulator>;
const store = storePhoto as jest.MockedFunction<typeof storePhoto>;
const queue = addPendingPhoto as jest.MockedFunction<typeof addPendingPhoto>;

/** A manipulate() context whose rendered image reports these dimensions. */
function mockImage(width: number, height: number) {
	const resize = jest.fn();
	const saved = { uri: "file:///cache/small.jpg", width: 100, height: 100 };
	const rendered = { width, height, saveAsync: jest.fn().mockResolvedValue(saved) };
	manipulator.manipulate.mockReturnValue({ resize, renderAsync: jest.fn().mockResolvedValue(rendered) } as never);
	return { resize, saved };
}

function granted(value = true) {
	picker.requestCameraPermissionsAsync.mockResolvedValue({ granted: value } as never);
	picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: value } as never);
}

function picked(uri = "file:///cache/DSC_0001.jpg", fileName?: string) {
	picker.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri, fileName }] } as never);
	picker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri, fileName }] } as never);
}

beforeEach(() => {
	jest.clearAllMocks();
	store.mockImplementation(async (file) => ({ ...file, uri: "file:///documents/photos/local-1.jpg" }));
});

describe("downscale", () => {
	test("shrinks an oversized photo to the long-edge cap, keeping aspect", async () => {
		const { resize } = mockImage(4032, 3024);
		await downscale("file:///cache/big.jpg");
		expect(resize).toHaveBeenCalledWith({ width: MAX_EDGE, height: 1500 });
	});

	test("caps on the long edge whichever way the photo is turned", async () => {
		const { resize } = mockImage(3024, 4032);
		await downscale("file:///cache/portrait.jpg");
		expect(resize).toHaveBeenCalledWith({ width: 1500, height: MAX_EDGE });
	});

	test("leaves a small photo alone rather than blowing it up", async () => {
		const { resize } = mockImage(800, 600);
		await downscale("file:///cache/small.jpg");
		expect(resize).not.toHaveBeenCalled();
	});

	test("always re-encodes, which is what bakes in the EXIF rotation", async () => {
		// A portrait photo whose orientation lives only in EXIF arrives at the
		// logbook on its side unless the pixels are rewritten.
		const { resize } = mockImage(1000, 800);
		const result = await downscale("file:///cache/rotated.jpg");
		expect(resize).not.toHaveBeenCalled();
		expect(result.uri).toBe("file:///cache/small.jpg");
	});
});

describe("capturePhoto", () => {
	test("stores the file, then queues the row, then reports the local id", async () => {
		granted();
		picked();
		mockImage(4032, 3024);

		const outcome = await capturePhoto("tok", "c1", "camera");

		expect(outcome).toMatchObject({ status: "captured", localId: "local-1" });
		// The queue row must name the STORED file, not the cache one the picker
		// returned - the OS can purge that while the app is closed.
		expect(store).toHaveBeenCalledWith(expect.objectContaining({ uri: "file:///cache/small.jpg" }));
		expect(queue).toHaveBeenCalledWith(
			expect.objectContaining({
				local_id: "local-1",
				token: "tok",
				check_id: "c1",
				ref: null,
				file: expect.objectContaining({ uri: "file:///documents/photos/local-1.jpg" }),
			}),
		);
	});

	test("queues the row before the caller can reference it", async () => {
		// Reversed, a crash in between would strand the visit: the record would
		// name a photo with no queue row, and the sync engine could never
		// resolve it or submit.
		granted();
		picked();
		mockImage(1000, 800);

		const order: string[] = [];
		store.mockImplementation(async (file) => {
			order.push("store");
			return file;
		});
		queue.mockImplementation(async () => void order.push("queue"));

		await capturePhoto("tok", "c1", "camera");
		expect(order).toEqual(["store", "queue"]);
	});

	test("uses the camera or the library as asked", async () => {
		granted();
		picked();
		mockImage(1000, 800);

		await capturePhoto("tok", "c1", "library");
		expect(picker.launchImageLibraryAsync).toHaveBeenCalled();
		expect(picker.launchCameraAsync).not.toHaveBeenCalled();
	});

	test("a refused permission is reported, not treated as a failure", async () => {
		granted(false);
		const outcome = await capturePhoto("tok", "c1", "camera");
		expect(outcome).toEqual({ status: "denied", source: "camera" });
		expect(picker.launchCameraAsync).not.toHaveBeenCalled();
	});

	test("backing out of the picker queues nothing", async () => {
		granted();
		picker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: null } as never);
		const outcome = await capturePhoto("tok", "c1", "camera");
		expect(outcome).toEqual({ status: "cancelled" });
		expect(queue).not.toHaveBeenCalled();
	});

	test("a failure anywhere surfaces a message rather than throwing at the screen", async () => {
		granted();
		picked();
		manipulator.manipulate.mockImplementation(() => {
			throw new Error("decoder gave up");
		});

		const outcome = await capturePhoto("tok", "c1", "camera");
		// Our copy, not the thrown one: what actually lands in that catch is the
		// image decoder or the file system, and "decoder gave up" is the polite
		// end of what they say.
		expect(outcome).toEqual({ status: "failed", message: "Couldn't add that photo. Try again." });
		expect(queue).not.toHaveBeenCalled();
	});

	test("falls back to a sensible filename when the picker gives none", async () => {
		granted();
		picked("file:///cache/x.jpg", undefined);
		mockImage(1000, 800);

		await capturePhoto("tok", "c9", "camera");
		expect(store).toHaveBeenCalledWith(expect.objectContaining({ name: "check-c9.jpg" }));
	});
});

describe("discardPhoto", () => {
	const fetchRow = getPhoto as jest.MockedFunction<typeof getPhoto>;
	const removeRow = deletePhoto as jest.MockedFunction<typeof deletePhoto>;
	const removeFile = deleteStoredPhoto as jest.MockedFunction<typeof deleteStoredPhoto>;

	beforeEach(() => {
		fetchRow.mockReset();
		removeRow.mockReset();
		removeFile.mockReset();
	});

	test("deletes the stored file, then the row (FIND-013)", async () => {
		fetchRow.mockResolvedValue({ local_id: "p1", file: { uri: "file:///photos/p1.jpg" } } as never);
		await discardPhoto("p1");
		expect(removeFile).toHaveBeenCalledWith("file:///photos/p1.jpg");
		expect(removeRow).toHaveBeenCalledWith("p1");
	});

	test("a row that is already gone deletes nothing", async () => {
		fetchRow.mockResolvedValue(undefined);
		await discardPhoto("p1");
		expect(removeFile).not.toHaveBeenCalled();
		expect(removeRow).not.toHaveBeenCalled();
	});

	test("a storage failure is swallowed - a leak, not a loss", async () => {
		fetchRow.mockRejectedValue(new Error("db locked"));
		await expect(discardPhoto("p1")).resolves.toBeUndefined();
	});
});
