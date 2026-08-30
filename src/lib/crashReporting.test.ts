// There is no crash reporting, by decision (2026-08-20): no Sentry project
// will ever be created, and the dormant integration was removed in the build
// 10 cleanup (docs/build-10-cleanup.md). A template upgrade or a well-meaning
// paste could quietly bring it back, so this checks the decision holds - in
// the dependency list, the config plugins, the build env and the source.
//
// The build-config checks ride along because they guard the same files:
// requireCommit stops EAS building an uncommitted tree (a stale binary was
// uploaded twice that way, docs/releasing.md), and expo-file-system must be
// declared rather than resolved through expo's own dependencies.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const app = JSON.parse(readFileSync("app.json", "utf8")).expo;
const eas = JSON.parse(readFileSync("eas.json", "utf8"));

function sourceFiles(dir: string, found: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) sourceFiles(path, found);
		else if (/\.tsx?$/.test(entry)) found.push(path);
	}
	return found;
}

describe("no crash reporting, ever", () => {
	test("no @sentry package is declared", () => {
		const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
		expect(declared.filter((name) => name.startsWith("@sentry"))).toEqual([]);
	});

	test("no sentry config plugin", () => {
		const names = (app.plugins as unknown[]).map((entry) => (Array.isArray(entry) ? entry[0] : entry));
		expect(names.filter((name) => String(name).includes("sentry"))).toEqual([]);
	});

	test("no SENTRY env var in any build profile", () => {
		for (const profile of Object.values(eas.build) as { env?: Record<string, string> }[]) {
			expect(Object.keys(profile.env ?? {}).filter((key) => key.includes("SENTRY"))).toEqual([]);
		}
	});

	test("no source file imports @sentry", () => {
		const offenders = sourceFiles("src").filter((file) => /from\s+["']@sentry/.test(readFileSync(file, "utf8")));
		expect(offenders).toEqual([]);
	});

	// The guard has to be able to fail, or it is decoration. The sample is
	// concatenated so this file's own text does not trip the scan above.
	test("the import guard would catch one", () => {
		const sample = 'import * as Sentry from "' + "@sentry" + '/react-native";';
		expect(/from\s+["']@sentry/.test(sample)).toBe(true);
	});
});

describe("build config", () => {
	test("EAS refuses to build an uncommitted tree", () => {
		expect(eas.cli.requireCommit).toBe(true);
	});

	test("expo-file-system is a declared dependency, not a transitive accident", () => {
		expect(pkg.dependencies["expo-file-system"]).toBeDefined();
	});
});
