// The launcher and store assets are generated from the web repo's
// public/favicon.svg - the one piece of icon artwork there is. These tests pin
// the properties the stores enforce (dimensions, alpha) and that every file
// app.json points at actually exists, so a regenerated or reverted asset fails
// here instead of at submission.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { colors } from "../theme/tokens";

const root = join(__dirname, "..", "..");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")).expo;

/** Width, height and alpha straight from the PNG's IHDR chunk. */
function png(relPath: string) {
	const bytes = readFileSync(join(root, relPath));
	const colorType = bytes[25];
	// Colour types 4 and 6 carry an alpha channel; 0, 2 and 3 only do via a tRNS chunk.
	const hasAlpha = colorType === 4 || colorType === 6 || bytes.includes("tRNS");
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), hasAlpha };
}

test("every asset app.json references exists on disk", () => {
	const splash = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")[1];
	const refs = [appJson.icon, appJson.android.adaptiveIcon.foregroundImage, appJson.android.adaptiveIcon.monochromeImage, splash.image];
	for (const ref of refs) expect(existsSync(join(root, ref))).toBe(true);
});

test("the app icon is 1024x1024 with no alpha, as both stores require", () => {
	expect(png("assets/images/icon.png")).toEqual({ width: 1024, height: 1024, hasAlpha: false });
});

test("iOS uses the shared icon - the template Icon Composer bundle is gone", () => {
	expect(appJson.ios.icon).toBeUndefined();
	expect(existsSync(join(root, "assets/expo.icon"))).toBe(false);
});

test("the Android adaptive layers are transparent art on a brand-ink ground", () => {
	expect(png("assets/images/android-icon-foreground.png")).toEqual({ width: 1024, height: 1024, hasAlpha: true });
	expect(png("assets/images/android-icon-monochrome.png")).toEqual({ width: 432, height: 432, hasAlpha: true });
	expect(appJson.android.adaptiveIcon.backgroundColor).toBe(colors.ink);
	expect(appJson.android.adaptiveIcon.backgroundImage).toBeUndefined();
});

test("the splash is the mark on the brand-ink ground, not the Expo template", () => {
	const splash = appJson.plugins.find((p: unknown) => Array.isArray(p) && p[0] === "expo-splash-screen")[1];
	expect(splash.backgroundColor).toBe(colors.ink);
	expect(png("assets/images/splash-icon.png").hasAlpha).toBe(true);
});

test("the Play listing assets meet Play's specs", () => {
	expect(png("assets/store/play-icon-512.png")).toEqual({ width: 512, height: 512, hasAlpha: false });
	expect(png("assets/store/feature-graphic-1024x500.png")).toEqual({ width: 1024, height: 500, hasAlpha: false });
});
