// What an inspector might actually paste. Every one of these is a real shape
// that has to work, because the alternative is a person standing outside a
// building with a link they cannot open.

import { isVisitToken, parseToken } from "./token";

const T = "a".repeat(64);
const MIXED = "AbCd".repeat(16);

describe("the links people are sent", () => {
	test.each([
		["the canonical dispatched link", `https://fieldagentlog.com/v/${T}`],
		["without the scheme, as messaging apps often show it", `fieldagentlog.com/v/${T}`],
		["the custom scheme", `fieldagentlog://v/${T}`],
		["with a trailing slash", `https://fieldagentlog.com/v/${T}/`],
		["with tracking junk appended", `https://fieldagentlog.com/v/${T}?utm_source=sms`],
		["with a fragment", `https://fieldagentlog.com/v/${T}#top`],
	])("%s", (_label, input) => {
		expect(parseToken(input)).toBe(T);
	});

	test("a staging host is honoured - the token, not the domain, is the credential", () => {
		expect(parseToken(`https://staging.fieldagentlog.com/v/${T}`)).toBe(T);
	});
});

describe("the older shapes the web app still accepts", () => {
	test("the root form", () => {
		expect(parseToken(`https://fieldagentlog.com/${T}`)).toBe(T);
	});

	test("the query fallback", () => {
		expect(parseToken(`https://fieldagentlog.com/?token=${T}`)).toBe(T);
	});
});

describe("typed and pasted by hand", () => {
	test("a bare token", () => {
		expect(parseToken(T)).toBe(T);
	});

	test("surrounding whitespace and a stray newline from a paste", () => {
		expect(parseToken(`  ${T.slice(0, 32)}\n${T.slice(32)}  `)).toBe(T);
	});

	test("wrapped in the punctuation mail clients add", () => {
		expect(parseToken(`<https://fieldagentlog.com/v/${T}>`)).toBe(T);
		expect(parseToken(`"${T}"`)).toBe(T);
	});

	test("retyped in capitals, and lower-cased to match what the server hashed", () => {
		expect(parseToken(MIXED)).toBe(MIXED.toLowerCase());
	});

	test("percent-encoded, as a copied URL sometimes is", () => {
		expect(parseToken(`https://fieldagentlog.com/v/${encodeURIComponent(T)}`)).toBe(T);
	});
});

describe("what is not a token", () => {
	test.each([
		["nothing", ""],
		["only spaces", "   "],
		["the link with the token missing", "https://fieldagentlog.com/v/"],
		["the site's home page", "https://fieldagentlog.com"],
		["the public guide", "https://fieldagentlog.com/guide"],
		["half a token", T.slice(0, 20)],
		["the right length but not hex", "z".repeat(64)],
		["a sentence", "here is the link for tomorrow"],
		["someone else's URL entirely", "https://example.com/login?next=/home"],
	])("%s", (_label, input) => {
		expect(parseToken(input)).toBeNull();
	});

	test("a malformed percent-escape does not throw", () => {
		expect(() => parseToken("https://fieldagentlog.com/v/%E0%A4%A")).not.toThrow();
	});
});

describe("isVisitToken", () => {
	test("accepts the 64-hex the server mints", () => {
		expect(isVisitToken(T)).toBe(true);
	});

	test("tolerates a different length rather than hard-coding 64", () => {
		// An app already in the stores cannot be corrected the day the backend
		// changes its token length; the charset check still does the real work.
		expect(isVisitToken("f".repeat(32))).toBe(true);
		expect(isVisitToken("f".repeat(31))).toBe(false);
	});
});
