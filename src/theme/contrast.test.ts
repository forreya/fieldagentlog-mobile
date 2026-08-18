// Every text pairing in the app, measured.
//
// This computes WCAG contrast rather than pinning hex values, so it keeps
// meaning something after a palette change: swap a colour and the test says
// whether the new one is readable, instead of just that it is different.
//
// It found four failures on the first run. The worst was the "medium" severity
// chip at 2.47:1 - white on amber, 11px - which is the badge telling somebody
// how serious a fire-safety defect is.
//
// Sizes are the ones the components actually use. WCAG relaxes to 3.0 only at
// 24px, or 18.66px bold; everything here is smaller than that, so 4.5 is the
// bar throughout.

import { colors } from "./tokens";
import { severityTextColour } from "@/components/VisitHistory";

function channel(value: number): number {
	return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
	const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const AA = 4.5;

describe("text on the plate", () => {
	test.each([
		["body", colors.plateInk, colors.plate],
		["body on a card", colors.plateInk, colors.plateRaised],
		["muted", colors.plateMuted, colors.plate],
		["muted on a card", colors.plateMuted, colors.plateRaised],
		["a link", colors.signalDeep, colors.plate],
		["a selected chip", colors.signalDeep, colors.signalTint],
	])("%s", (_name, fg, bg) => {
		expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
	});
});

describe("text in the housing", () => {
	test.each([
		["title", colors.textOnDark, colors.graphite],
		["subtitle", colors.mutedOnDark, colors.graphite],
		["the online pill", colors.syncOnline, colors.graphite],
	])("%s", (_name, fg, bg) => {
		expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
	});
});

// Never colour alone - each is paired with an icon and a word - but the word
// still has to be readable.
describe("verdicts", () => {
	test.each([
		["pass", colors.pass, colors.passTint],
		["fail", colors.fail, colors.failTint],
		["n/a", colors.na, colors.naTint],
	])("%s on its tint", (_name, fg, bg) => {
		expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
	});

	test.each([
		["pass", colors.pass],
		["fail", colors.fail],
	])("%s as plain text on a card", (_name, fg) => {
		expect(contrast(fg, colors.plateRaised)).toBeGreaterThanOrEqual(AA);
		expect(contrast(fg, colors.plate)).toBeGreaterThanOrEqual(AA);
	});
});

// The chip picks its own text colour, so the test asks the chip rather than
// assuming white.
describe("severity chips", () => {
	test.each([
		["low", colors.sevLow],
		["medium", colors.sevMedium],
		["high", colors.sevHigh],
		["intolerable", colors.sevIntolerable],
	])("%s is readable", (severity, background) => {
		expect(contrast(severityTextColour(severity), background)).toBeGreaterThanOrEqual(AA);
	});
});

test("the primary button's label is readable on it", () => {
	expect(contrast(colors.ink, colors.signal)).toBeGreaterThanOrEqual(AA);
});
