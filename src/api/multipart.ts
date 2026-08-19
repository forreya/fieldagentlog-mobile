// Building the file part of a multipart body, in the one shape the runtime's
// fetch accepts.
//
// Expo's WinterCG fetch replaces React Native's global fetch in EVERY build
// (expo/src/winter/runtime.native.ts, imported by the expo package's own side
// effects), and its body converter refuses RN's classic { uri, name, type }
// descriptor outright: "Unsupported FormDataPart implementation", thrown in
// JS before any network I/O. That throw is what FIND-011 chased for a day
// while it wore the network's clothes. What the converter does accept
// (expo/src/winter/fetch/convertFormData.ts, pinned by Expo's own test suite):
// strings, Blobs, and objects exposing bytes() with name/type read into the
// part headers - the interface expo-file-system's File implements.
//
// The part deliberately carries OUR name and type rather than the stored
// File's own: the file on disk is named by a uuid, while the capture's
// original filename and the pipeline's known MIME type (always "image/jpeg" -
// both photo paths re-encode on the way in) are what the server should see.
//
// Bytes are read lazily, inside fetch's own conversion, one photo per request
// and never at append time. This runtime has no streaming multipart, so a
// bounded read of one downscaled photo is inherent to it, not a choice made
// here.

import { File } from "expo-file-system";

import type { LocalFile } from "./contract";

/** What convertFormDataAsync reads: bytes(), plus the part-header metadata. */
export interface FilePart {
	bytes: () => Promise<Uint8Array>;
	name: string;
	type: string;
}

/** A stored photo as a multipart file part the active fetch can send. */
export function filePart(file: LocalFile): FilePart {
	const stored = new File(file.uri);
	return { bytes: () => stored.bytes(), name: file.name, type: file.type };
}

/** Append a stored photo under `field`. The cast is the usual lie told to the
 *  DOM typings; the runtime accepts any bytes()-bearing object (see above). */
export function appendFile(form: FormData, field: string, file: LocalFile): void {
	form.append(field, filePart(file) as unknown as Blob);
}
