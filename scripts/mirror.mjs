#!/usr/bin/env node
// Shared-mirror guard. Some logic must stay byte-identical between this app and
// the FieldAgent web app (../fieldagent): due-date maths, dashboard assembly,
// the wire contract. Nothing enforces that by itself, and the gena-web /
// gena-mobile pair shows what happens then - silent drift nobody notices until
// two clients disagree about whether a check is overdue.
//
// Two checks, because CI cannot see the peer repo:
//
//   verify  - are the local copies unchanged since they were last synced?
//             Compares each file to the hash recorded in shared-mirror.json.
//             Needs no peer checkout, so this is the one CI runs.
//   compare - do the local copies actually match the peer repo right now?
//             Needs ../fieldagent on disk. Run before/after touching shared
//             logic; it is the check that catches drift originating on the web
//             side.
//   update  - re-record hashes after a deliberate, synced change.
//
// Usage: node scripts/mirror.mjs <verify|compare|update>

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "shared-mirror.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const peerRoot = resolve(root, manifest.peerRepo);

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function verify() {
	const problems = [];
	for (const entry of manifest.files) {
		const local = join(root, entry.local);
		if (!existsSync(local)) {
			problems.push(`${entry.local} is missing`);
			continue;
		}
		const actual = sha(local);
		if (actual !== entry.sha256) {
			problems.push(`${entry.local} has changed since it was last synced with the web app`);
		}
	}
	if (problems.length) {
		console.error(red("Shared-mirror check failed:\n"));
		for (const p of problems) console.error(`  - ${p}`);
		console.error(
			[
				"",
				"These files are shared with the FieldAgent web app and must not drift.",
				"If the change is intentional, apply the SAME change in ../fieldagent, then:",
				"",
				"  node scripts/mirror.mjs compare   # prove both repos agree",
				"  node scripts/mirror.mjs update    # re-record the hashes",
				"",
			].join("\n"),
		);
		process.exit(1);
	}
	console.log(green(`Shared mirror verified (${manifest.files.length} file(s) unchanged since last sync).`));
}

function compare() {
	if (!existsSync(peerRoot)) {
		console.error(red(`Peer repo not found at ${peerRoot}.`));
		console.error("Clone the FieldAgent web app beside this one, or run 'verify' instead (CI does).");
		process.exit(1);
	}
	const problems = [];
	for (const entry of manifest.files) {
		const local = join(root, entry.local);
		const peer = join(peerRoot, entry.peer);
		if (!existsSync(peer)) {
			problems.push(`${entry.peer} is missing from the web app - was it moved or renamed?`);
			continue;
		}
		if (!existsSync(local)) {
			problems.push(`${entry.local} is missing here`);
			continue;
		}
		if (sha(local) !== sha(peer)) {
			problems.push(`${entry.local} differs from ${manifest.peerRepo}/${entry.peer}`);
		}
	}
	if (problems.length) {
		console.error(red("Shared files have drifted:\n"));
		for (const p of problems) console.error(`  - ${p}`);
		console.error(`\nDiff them, decide which side is right, sync both, then: node scripts/mirror.mjs update\n`);
		process.exit(1);
	}
	console.log(green(`Shared mirror matches the web app (${manifest.files.length} file(s) identical).`));
}

function update() {
	for (const entry of manifest.files) {
		entry.sha256 = sha(join(root, entry.local));
	}
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(green(`Recorded hashes for ${manifest.files.length} file(s).`));
}

const command = process.argv[2];
if (command === "verify") verify();
else if (command === "compare") compare();
else if (command === "update") update();
else {
	console.error("Usage: node scripts/mirror.mjs <verify|compare|update>");
	process.exit(1);
}
