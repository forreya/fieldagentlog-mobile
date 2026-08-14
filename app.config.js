// app.json stays the source of truth for everything static. This file exists
// only to stamp the things that are known at BUILD time and cannot be written
// by hand: which commit this build came from, and when it was made.
//
// Without it the version stamp can only say "0.1.0", which is the same string
// for every build that month - useless for the question it exists to answer,
// which is "exactly which build is on that phone?" asked down a phone line by
// someone standing in a stairwell.

const { execSync } = require("node:child_process");

/** EAS sets this on its builders. Locally, ask git; if that fails, say so
 *  rather than guessing - an empty commit is honest, a wrong one is not. */
function commit() {
	const fromEas = process.env.EAS_BUILD_GIT_COMMIT_HASH;
	if (fromEas) return fromEas.slice(0, 7);
	try {
		return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return "";
	}
}

module.exports = ({ config }) => ({
	...config,
	extra: {
		...config.extra,
		commit: commit(),
		buildTime: new Date().toISOString(),
		// Which eas.json profile produced this. Blank for a local dev run.
		buildProfile: process.env.EAS_BUILD_PROFILE ?? "",
	},
});
