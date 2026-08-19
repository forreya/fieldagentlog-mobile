// The update policy, which is mostly a set of things that must not happen.
//
// The web swaps builds while the app is out of sight (fieldagent/src/lib/
// pwa.ts). Native does not have to: expo-updates applies at the next cold
// start on its own, so there is no moment where a running app is replaced -
// unless something calls reloadAsync(). Nothing does, and this checks that,
// because a mid-inspection reload would lose a wizard's in-memory answers and
// is exactly the failure the web policy was written to avoid.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { updateLabel, type UpdateState } from "./updates";

const config = JSON.parse(readFileSync("app.json", "utf8")).expo;

function sourceFiles(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) sourceFiles(path, found);
		else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) found.push(path);
	}
	return found;
}

describe("nothing applies an update under the user's thumb", () => {
	test("no source file calls reloadAsync", () => {
		// Comments are allowed to name it - the policy has to be explainable.
		// What must not exist is a call.
		const code = (file: string) =>
			readFileSync(file, "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, "");
		const offenders = sourceFiles("src").filter((f) => /\breloadAsync\s*\(/.test(code(f)));

		expect(offenders).toEqual([]);
	});

	// The guard has to be able to fail, or it is decoration.
	test("the guard would catch one", () => {
		const withCall = "await Updates.reloadAsync();";
		expect(/\breloadAsync\s*\(/.test(withCall)).toBe(true);
	});
});

describe("app.json", () => {
	// The one that matters most on a doorstep: launch must never wait on a
	// network check. Zero means run what is already on the phone.
	test("launch never blocks on the update check", () => {
		expect(config.updates.fallbackToCacheTimeout).toBe(0);
	});

	test("the check happens after launch, not before", () => {
		expect(config.updates.checkAutomatically).toBe("ON_LOAD");
	});

	// An over-the-air update is JavaScript only. appVersion would happily send a
	// new bundle to a binary built before a native module was added.
	test("updates are keyed to the native fingerprint, not the version string", () => {
		expect(config.runtimeVersion).toEqual({ policy: "fingerprint" });
	});

	test("the update url points at this EAS project", () => {
		expect(config.updates.url).toBe(`https://u.expo.dev/${config.extra.eas.projectId}`);
	});
});

// Every build has to listen to a track, or it silently never updates.
test("every build profile names a channel", () => {
	const profiles = JSON.parse(readFileSync("eas.json", "utf8")).build;

	for (const [name, profile] of Object.entries<{ channel?: string }>(profiles)) {
		expect(`${name}:${profile.channel ?? "MISSING"}`).toBe(`${name}:${name}`);
	}
});

describe("what the Diagnostics screen says", () => {
	const state = (over: Partial<UpdateState> = {}): UpdateState => ({
		pending: false,
		running: "embedded",
		runtimeVersion: "1",
		channel: "production",
		enabled: true,
		...over,
	});

	// The sentence has to tell someone what to DO, because the person reading it
	// out is usually on the phone to whoever asked whether the fix has landed.
	test("a pending update says it needs the app reopening", () => {
		expect(updateLabel(state({ pending: true }))).toContain("next time the app is opened");
	});

	test("a build without updates says so rather than claiming to be current", () => {
		expect(updateLabel(state({ enabled: false }))).toBe("Not used in this build");
	});

	test("the shipped bundle is distinguishable from a downloaded one", () => {
		expect(updateLabel(state())).toBe("Running the version that was installed (production)");
		expect(updateLabel(state({ running: "abc123" }))).toBe("Up to date (production)");
	});

	// Found on a device: Expo Go reports isEnabled true and an updateId of its
	// own, so the row read "Up to date" on a phone that cannot receive an update
	// at all. A diagnostic that lies is worse than no diagnostic.
	test("a build with no channel says so rather than claiming to be current", () => {
		expect(updateLabel(state({ enabled: false, running: "expo-go-id", channel: "" }))).toBe("Not used in this build");
	});
});
