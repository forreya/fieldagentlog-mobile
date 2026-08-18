import { colors, fonts, radii, shadows, space, TAP, TAP_VERDICT } from "./tokens";

// These guard the brand contract, not the values' prettiness: the web app and
// this one must look like the same product, and the tap targets are an
// accessibility promise (README: >=56, verdicts >=78).

test("core palette matches the web app's tokens.css", () => {
	expect(colors.ink).toBe("#161B22");
	expect(colors.plate).toBe("#F6F8FA");
	expect(colors.signal).toBe("#5C8CAE");
});

// The one place the two deliberately differ, recorded here so it stays a
// decision rather than becoming drift. The web's verdict colours miss WCAG AA
// at the sizes this app renders them - #1E8E3E is 3.70:1 on passTint, #D7263D
// is 4.16:1 on failTint - so both are darkened by the least that clears 4.5.
// contrast.test.ts is what actually holds them there.
//
// The web has the same defect. When it is fixed there, these should meet again.
test("the verdict colours diverge from the web, on purpose", () => {
	expect(colors.pass).toBe("#1B7E37");
	expect(colors.fail).toBe("#CD243A");
});

test("tap targets meet the glove-friendly minimums", () => {
	expect(TAP).toBeGreaterThanOrEqual(56);
	expect(TAP_VERDICT).toBeGreaterThanOrEqual(78);
});

test("the severity ramp escalates through four distinct steps", () => {
	const ramp = [colors.sevLow, colors.sevMedium, colors.sevHigh, colors.sevIntolerable];
	expect(new Set(ramp).size).toBe(4);
});

test("spacing and radii scales are ordered", () => {
	const scale = [space.s1, space.s2, space.s3, space.s4, space.s5, space.s6, space.s8, space.s10, space.s12];
	expect(scale).toEqual([...scale].sort((a, b) => a - b));
	expect(radii.sm).toBeLessThan(radii.md);
	expect(radii.md).toBeLessThan(radii.lg);
});

test("every colour is a usable RN colour string", () => {
	for (const [name, value] of Object.entries(colors)) {
		expect(value).toMatch(/^(#[0-9A-F]{6}|rgba\([\d.,\s]+\))$/i);
		expect(name).not.toBe("");
	}
});

test("plate elevation covers both platforms", () => {
	expect(shadows.plate.elevation).toBeGreaterThan(0); // Android
	expect(shadows.plate.shadowRadius).toBeGreaterThan(0); // iOS
});

test("font families name loaded weights, not CSS stacks", () => {
	for (const family of Object.values(fonts)) {
		expect(family).not.toContain(",");
		expect(family).toMatch(/^(Archivo|IBMPlexMono)_/);
	}
});
