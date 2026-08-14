// Getting a photo of a fault from the camera into the upload queue.
//
// ORDER IS LOAD-BEARING, and not in the obvious way:
//
//   1. downscale   - a modern phone photo is 3-12 MB. The server caps a single
//                    upload at 15 MB, the bucket may be stricter, and either
//                    way it is minutes of a field worker's data over one bar.
//                    Re-encoding also normalises EXIF rotation, so a portrait
//                    photo does not reach the logbook on its side.
//   2. store file  - copied out of the OS cache, which can be purged while the
//                    app is closed (see db/photoStore).
//   3. queue row   - written BEFORE the answer references it. The reverse
//                    order can strand a visit: the record would name a photo
//                    with no queue row, the sync engine would never resolve
//                    it, and the visit could never be submitted.
//   4. reducer     - only now does the check point at the photo.

import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import type { LocalFile } from "@/api/contract";
import { addPendingPhoto } from "@/db/photos";
import { storePhoto } from "@/db/photoStore";
import { uuid } from "@/lib/id";

/** Long edge cap. Comfortably past what any reviewer needs to see a fault. */
export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.8;

export type CaptureSource = "camera" | "library";

/** What the user chose not to do, versus what went wrong. */
export type CaptureOutcome =
	| { status: "captured"; localId: string; file: LocalFile }
	| { status: "cancelled" }
	| { status: "denied"; source: CaptureSource }
	| { status: "failed"; message: string };

async function requestPermission(source: CaptureSource): Promise<boolean> {
	const result = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
	return result.granted;
}

async function pick(source: CaptureSource): Promise<ImagePicker.ImagePickerResult> {
	const options: ImagePicker.ImagePickerOptions = {
		mediaTypes: ["images"],
		// Editing is off: an inspector photographing a fault wants the whole
		// scene, and a crop step is one more thing to do with cold hands.
		allowsEditing: false,
		quality: 1,
		exif: false,
	};
	return source === "camera" ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options);
}

/**
 * Shrink to something a phone signal can actually send.
 *
 * Only downscales - a photo already smaller than the cap keeps its dimensions
 * rather than being blown up. The re-encode still happens, which is what bakes
 * in the EXIF rotation.
 */
export async function downscale(uri: string, maxEdge: number = MAX_EDGE): Promise<{ uri: string; width: number; height: number }> {
	const context = ImageManipulator.manipulate(uri);
	const image = await context.renderAsync();

	const longest = Math.max(image.width, image.height);
	if (longest > maxEdge) {
		const scale = maxEdge / longest;
		context.resize({ width: Math.round(image.width * scale), height: Math.round(image.height * scale) });
	}

	const rendered = await context.renderAsync();
	const saved = await rendered.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
	return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Capture a photo for one check and queue it. Returns what happened so the
 * screen can tell the difference between "changed their mind" and "broken".
 */
export async function capturePhoto(token: string, checkId: string, source: CaptureSource): Promise<CaptureOutcome> {
	try {
		if (!(await requestPermission(source))) return { status: "denied", source };

		const picked = await pick(source);
		if (picked.canceled || !picked.assets?.length) return { status: "cancelled" };

		const asset = picked.assets[0];
		const shrunk = await downscale(asset.uri);

		const name = asset.fileName?.trim() || `check-${checkId}.jpg`;
		const stored = await storePhoto({ uri: shrunk.uri, name, type: "image/jpeg" });

		const localId = uuid();
		await addPendingPhoto({ local_id: localId, token, check_id: checkId, file: stored, ref: null, created_at: Date.now() });

		return { status: "captured", localId, file: stored };
	} catch (err) {
		return { status: "failed", message: err instanceof Error ? err.message : "Couldn't add that photo." };
	}
}

/** Plain-English copy for a refused permission. */
export function deniedMessage(source: CaptureSource): string {
	return source === "camera"
		? "FieldAgentLog needs camera access to photograph a fault. Turn it on in Settings, then try again."
		: "FieldAgentLog needs access to your photos. Turn it on in Settings, then try again.";
}
