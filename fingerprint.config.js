// What the fingerprint runtime version ignores.
//
// app.config.js stamps extra.buildTime, extra.commit and extra.buildProfile
// for the About and Diagnostics screens. buildTime is a fresh timestamp on
// EVERY config evaluation, so with the default fingerprint the runtime
// version computed on this machine could never equal the one computed on the
// EAS worker minutes later - the first fingerprint-validated build failed on
// exactly that, and every OTA update would have missed its builds the same
// way. The extra section carries no native code, so skipping it costs the
// fingerprint nothing it exists to protect.
const { SourceSkips } = require("@expo/fingerprint");

/** @type {import('@expo/fingerprint').Config} */
module.exports = {
	sourceSkips: SourceSkips.ExpoConfigExtraSection,
};
