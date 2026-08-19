// What the fingerprint runtime version ignores.
//
// Two things vary between this machine and the EAS worker without any native
// code changing, and each cost one failed build before it was named here:
//
//   - app.config.js stamps extra.buildTime (a fresh timestamp on EVERY config
//     evaluation), extra.commit and extra.buildProfile for the About and
//     Diagnostics screens. Left in the fingerprint, the runtime version
//     computed locally could never equal the worker's, and every OTA update
//     would have missed its builds the same way.
//   - prebuild rewrites the android/ios npm scripts to `expo run:*` on the
//     worker (the documented side effect in docs/local-backend.md), so the
//     post-prebuild fingerprint differs from the pre-prebuild one. The skip
//     below is the enum's own remedy for exactly that, per its docstring.
//
// Neither carries native code, so skipping them costs the fingerprint nothing
// it exists to protect.
const { SourceSkips } = require("@expo/fingerprint");

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
	sourceSkips: SourceSkips.ExpoConfigExtraSection | SourceSkips.PackageJsonAndroidAndIosScriptsIfNotContainRun,
};
