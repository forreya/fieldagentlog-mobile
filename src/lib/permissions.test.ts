// What the app asks the operating system for, and why.
//
// Guards the H2 audit. Expo's base Android template ships four permissions
// under a comment reading "REMOVE WHATEVER YOU DO NOT NEED", and nobody had -
// the app was shipping SYSTEM_ALERT_WINDOW ("draw over other apps"), VIBRATE
// and WRITE_EXTERNAL_STORAGE without using any of them. On iOS the plugins had
// added Face ID, microphone, motion and two background-location strings, all
// boilerplate, for capabilities this app does not have.
//
// The reason this is a test and not just a note: every one of them came back
// from a dependency's defaults, not from anyone deciding to ask for it. The
// same thing will happen the next time a plugin is added.
//
// It reads app.json rather than the generated manifests, because app.json is
// the source of truth and the native folders are gitignored build output. To
// re-run the real audit: `npx expo prebuild --clean` and read
// android/app/src/main/AndroidManifest.xml and ios/*/Info.plist. See
// docs/permissions.md.

import config from "../../app.json";

type PluginEntry = string | [string, Record<string, unknown>];

function optionsFor(name: string): Record<string, unknown> {
	const plugins = config.expo.plugins as PluginEntry[];
	const found = plugins.find((p) => (typeof p === "string" ? p : p[0]) === name);
	if (!found || typeof found === "string") throw new Error(`${name} has no options - permission strings would fall back to boilerplate`);
	return found[1];
}

describe("Android", () => {
	const blocked = config.expo.android.blockedPermissions;

	// Each of these is dependency boilerplate, not something the app uses.
	test.each([
		["android.permission.SYSTEM_ALERT_WINDOW", "drawing over other apps"],
		["android.permission.VIBRATE", "vibration - the app never calls it"],
		["android.permission.WRITE_EXTERNAL_STORAGE", "writing to shared storage - photos stay app-private"],
		["android.permission.RECORD_AUDIO", "recording audio"],
		["android.permission.READ_MEDIA_VIDEO", "reading video"],
		["android.permission.ACCESS_BACKGROUND_LOCATION", "background location, which the app promises it never uses"],
	])("blocks %s (%s)", (permission) => {
		expect(blocked).toContain(permission);
	});
});

describe("iOS purpose strings", () => {
	// A string ending up as "$(PRODUCT_NAME)" boilerplate means a plugin default
	// leaked through: it reads as unfinished to a reviewer and tells the person
	// holding the phone nothing.
	test.each([
		["expo-image-picker", "photosPermission"],
		["expo-image-picker", "cameraPermission"],
		["expo-location", "locationWhenInUsePermission"],
		// Motion is not switched off despite the app never using it: expo-location
		// links CoreMotion, and Apple rejects the binary without a purpose string
		// (ITMS-90683, build 8). The string has to exist, so it tells the truth.
		["expo-location", "motionUsagePermission"],
	])("%s.%s is written for the person reading it", (plugin, key) => {
		const value = optionsFor(plugin)[key];

		expect(typeof value).toBe("string");
		expect(value).not.toContain("$(PRODUCT_NAME)");
		expect(value as string).toContain("FieldAgentLog");
	});

	// Strings for capabilities the app does not have. `false` is what removes
	// the key; omitting the option puts the plugin's default back.
	test.each([
		["expo-secure-store", "faceIDPermission"],
		["expo-image-picker", "microphonePermission"],
		["expo-location", "locationAlwaysPermission"],
		["expo-location", "locationAlwaysAndWhenInUsePermission"],
	])("%s.%s is switched off, not left to a default", (plugin, key) => {
		expect(optionsFor(plugin)[key]).toBe(false);
	});
});

// The location copy promises this, and there is no background mode in the
// build to contradict it. Turning either of these on would make that a lie.
test("background location stays off on both platforms", () => {
	const location = optionsFor("expo-location");

	expect(location.isIosBackgroundLocationEnabled).toBe(false);
	expect(location.isAndroidBackgroundLocationEnabled).toBe(false);
});
