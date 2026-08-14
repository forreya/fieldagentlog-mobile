// What build am I looking at? Asked on a doorstep, by someone whose app is
// behaving oddly, with a manager on the phone - so it has to be short enough to
// read out and specific enough to match a build.
//
// Mirrors the web app's src/lib/version.ts in shape and wording on purpose:
// the two apps get described down the same phone line, and "v0.1.0 (41)" should
// mean the same thing whichever one someone is holding.
//
// The commit and build time are stamped by app.config.js; the version and build
// number come from the resolved Expo config, which EAS fills in when it applies
// a remote version. Everything here degrades to a readable string rather than
// throwing or printing "undefined" - a diagnostics screen that crashes is worse
// than one that says "unknown".

import Constants from "expo-constants";

interface Stamp {
	commit?: string;
	buildTime?: string;
	buildProfile?: string;
}

const config = Constants.expoConfig;
const stamp = (config?.extra ?? {}) as Stamp;

export const APP_VERSION = config?.version ?? "0.0.0";
export const BUILD_COMMIT = stamp.commit ?? "";
export const BUILD_TIME = stamp.buildTime ?? "";
export const BUILD_PROFILE = stamp.buildProfile ?? "";

/** iOS calls it a build number, Android a version code; a person reading it out
 *  neither knows nor cares which platform they are on. */
export const BUILD_NUMBER: string = config?.ios?.buildNumber ?? (config?.android?.versionCode != null ? String(config.android.versionCode) : "");

/** The one line: "v0.1.0 (41)", or "v0.1.0 · 3bb6217" when no build number has
 *  been assigned yet - which is every run from a laptop. */
export function versionLabel(version = APP_VERSION, buildNumber = BUILD_NUMBER, buildCommit = BUILD_COMMIT): string {
	if (buildNumber) return `v${version} (${buildNumber})`;
	return buildCommit ? `v${version} · ${buildCommit}` : `v${version}`;
}

/** The build date. Falls back to the raw value rather than "Invalid Date". */
export function buildDateLabel(raw = BUILD_TIME): string {
	if (!raw) return "unknown";
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return raw;
	return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
