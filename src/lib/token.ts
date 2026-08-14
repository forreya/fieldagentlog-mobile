// Reading a visit token out of whatever someone gives us.
//
// Links dispatched by BalanceBuddy are always `https://fieldagentlog.com/v/<token>`
// (`visitLinkUrl` in balancebuddy-web), and those open the app directly through
// the /v/[token] route. This file exists for the other way in: an inspector
// typing or pasting into the enter-a-code screen, where the input arrives as
// anything from a clean 64-hex string to a whole message-app URL with tracking
// junk on the end.
//
// The web app's src/lib/token.ts reads the browser's own location and so also
// honours `/<token>` at the root and `?token=`. Those shapes are accepted here
// too - someone will paste one - but they are deliberately NOT claimed as app
// links: matching the root form means claiming `/*`, which would take over
// every page on the domain (see fieldagent/docs/app-links.md).

/** Never a token: the link prefix, and the public guide pages. */
const RESERVED = new Set(["v", "guide", "cleaner-guide.pdf"]);

/**
 * A token as the server mints it: 32 random bytes as hex.
 *
 * Checked as a range rather than exactly 64 characters. The precise length is
 * the backend's choice, and an app already in the stores cannot be corrected
 * the day that changes - but a shape check still catches every realistic paste
 * mistake (half a link, the wrong URL, a word), and catching those on the phone
 * beats a network round trip that ends in "this link can't be used".
 */
const TOKEN = /^[0-9a-f]{32,128}$/i;

export function isVisitToken(value: string): boolean {
	return TOKEN.test(value);
}

/** Strip the punctuation message apps and email clients wrap links in. */
function unwrap(input: string): string {
	return input
		.trim()
		.replace(/^[<("']+/, "")
		.replace(/[>)."',]+$/, "");
}

function decode(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		// A stray % makes this throw; the raw text is still worth a look.
		return value;
	}
}

/** The candidate token in a string, before it is judged. */
function extract(raw: string): string {
	const text = unwrap(raw);

	// The canonical link. Also matches the custom scheme, fieldagentlog://v/<t>.
	const prefixed = text.match(/\/v\/([^/?#\s]+)/);
	if (prefixed) return decode(prefixed[1]);

	const query = text.match(/[?&]token=([^&#\s]+)/);
	if (query) return decode(query[1]);

	// A bare token, or the root link form. Take the last real path segment so
	// a trailing slash or a copied "https://fieldagentlog.com/<token>" both work.
	const withoutQuery = text.split(/[?#]/)[0];
	const segments = withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/");
	const last = segments.filter((s) => s && !RESERVED.has(s.toLowerCase())).pop();
	return last ? decode(last) : "";
}

/**
 * The visit token in `input`, or null if there isn't a plausible one.
 *
 * Lower-cased on the way out: the server stores the hash of the hex it minted,
 * so a token retyped in capitals would otherwise hash to nothing and look like
 * a dead link.
 */
export function parseToken(input: string): string | null {
	const candidate = extract(input).replace(/\s+/g, "");
	return isVisitToken(candidate) ? candidate.toLowerCase() : null;
}
