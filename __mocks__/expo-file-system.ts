// expo-file-system backed by a real temporary directory on the host, so the
// photo-store tests exercise genuine filesystem behaviour: copies that really
// copy, deletes that really delete, sizes that are really bytes. A fake would
// only confirm the store calls the methods it happens to call.

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "fal-fs-"));

/** Strip the file:// scheme the real API uses in its uri property. */
function toPath(uri: string): string {
	return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

function toUri(path: string): string {
	return `file://${path}`;
}

function join(parts: (string | Directory | File)[]): string {
	// Strip the scheme from string parts too: nodePath.join would collapse the
	// "//" in file:// and produce a path that no longer resolves.
	const segments = parts.map((p) => (typeof p === "string" ? toPath(p) : toPath(p.uri)));
	return nodePath.join(...segments);
}

export class Directory {
	readonly uri: string;

	constructor(...parts: (string | Directory | File)[]) {
		this.uri = toUri(join(parts));
	}

	get exists(): boolean {
		return fs.existsSync(toPath(this.uri)) && fs.statSync(toPath(this.uri)).isDirectory();
	}

	create(options?: { intermediates?: boolean; idempotent?: boolean }): void {
		fs.mkdirSync(toPath(this.uri), { recursive: options?.intermediates ?? false });
	}

	delete(): void {
		fs.rmSync(toPath(this.uri), { recursive: true, force: true });
	}

	list(): (Directory | File)[] {
		return fs
			.readdirSync(toPath(this.uri))
			.map((name) => nodePath.join(toPath(this.uri), name))
			.map((full) => (fs.statSync(full).isDirectory() ? new Directory(full) : new File(full)));
	}
}

export class File {
	readonly uri: string;

	constructor(...parts: (string | Directory | File)[]) {
		this.uri = toUri(join(parts));
	}

	get exists(): boolean {
		return fs.existsSync(toPath(this.uri)) && fs.statSync(toPath(this.uri)).isFile();
	}

	get size(): number | null {
		return this.exists ? fs.statSync(toPath(this.uri)).size : null;
	}

	async copy(destination: Directory | File): Promise<void> {
		const target =
			destination instanceof Directory ? nodePath.join(toPath(destination.uri), nodePath.basename(toPath(this.uri))) : toPath(destination.uri);
		fs.copyFileSync(toPath(this.uri), target);
	}

	delete(): void {
		fs.unlinkSync(toPath(this.uri));
	}

	write(contents: string): void {
		fs.writeFileSync(toPath(this.uri), contents);
	}
}

export const Paths = {
	get document(): Directory {
		const dir = new Directory(nodePath.join(root, "document"));
		if (!dir.exists) dir.create({ intermediates: true });
		return dir;
	},
	get cache(): Directory {
		const dir = new Directory(nodePath.join(root, "cache"));
		if (!dir.exists) dir.create({ intermediates: true });
		return dir;
	},
};

/** Test helper: empty the sandbox between tests. */
export function __resetFileSystem(): void {
	fs.rmSync(root, { recursive: true, force: true });
	fs.mkdirSync(root, { recursive: true });
}
