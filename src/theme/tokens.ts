// FieldAgentLog design tokens, ported from the web app's src/styles/tokens.css.
// Identity: a bright "label-plate" working surface inside a slate housing, like
// a data-plate bolted to brushed steel. One calm signal (dusty steel blue);
// verdicts strictly green/red and never colour-alone.
//
// The palette is deliberately LIGHT-ONLY, matching the web app: the plate is a
// physical metaphor and a dark variant would undo it. app.json pins
// userInterfaceStyle to "light" so the OS never inverts it.
//
// Keep in step with ../../fieldagent/src/styles/tokens.css - with one knowing
// exception, marked below, where the web's value does not clear WCAG AA at the
// size this app renders it. The web has the same defect; fixing it there is a
// separate change in a separate repo.

export const colors = {
	// Slate housing
	ink: "#161B22",
	graphite: "#242E39",
	graphite2: "#2D3947",
	lineOnDark: "rgba(255,255,255,0.12)",
	textOnDark: "#EEF1F4",
	mutedOnDark: "#9AA4AE",

	// Label plate (bright working surface)
	plate: "#F6F8FA",
	plateRaised: "#FFFFFF",
	plateEdge: "#DCE1E7",
	plateEdgeStrong: "#C4CCD4",
	plateInk: "#14171A",
	plateMuted: "#5C6772",

	// Calm signal - dusty steel blue. Ink on signal and signalDeep on white both
	// clear 4.5:1.
	signal: "#5C8CAE",
	signalDeep: "#3E6784",
	signalTint: "#E4EEF5",

	// Verdicts (always paired with an icon + word).
	//
	// DIVERGES FROM THE WEB, deliberately. #1E8E3E managed 3.70:1 on passTint and
	// 4.21:1 on white, and #D7263D 4.16:1 on failTint - all short of AA's 4.5 for
	// text this size (15px and 14px; WCAG only relaxes to 3.0 at 18.66px bold).
	// Darkened by the smallest amount that clears it, so the hues still read as
	// the same green and red.
	pass: "#1B7E37",
	passTint: "#E6F4EA",
	fail: "#CD243A",
	failTint: "#FBE6E9",
	na: "#5C6772",
	naTint: "#ECEFF2",

	// Sync pill states
	syncOnline: "#7FD49B",

	// Severity ramp: low -> intolerable.
	//
	// The hues are the web's, unchanged. What changed is the text on top: white
	// on the amber was 2.47:1, which is the worst number in the palette by some
	// way. Amber is amber because it means something, so rather than muddy it
	// into brown the chip picks the readable text colour for its own background
	// - see severityTextColour.
	sevLow: "#5C6772",
	sevMedium: "#E8910C",
	sevHigh: "#E8590C",
	sevIntolerable: "#B00020",
} as const;

/** Loaded by @expo-google-fonts in the root layout; bundled, so they work offline. */
export const fonts = {
	display: "Archivo_700Bold",
	displayHeavy: "Archivo_800ExtraBold",
	body: "Archivo_400Regular",
	bodyMedium: "Archivo_600SemiBold",
	mono: "IBMPlexMono_500Medium",
} as const;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40, s12: 48 } as const;

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Minimum comfortable target with gloves on. Verdict controls go larger (78). */
export const TAP = 56;
export const TAP_VERDICT = 78;

/** Plate elevation. RN needs both an iOS shadow and an Android elevation. */
export const shadows = {
	plate: {
		shadowColor: "#14171A",
		shadowOpacity: 0.18,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 6 },
		elevation: 3,
	},
} as const;

export type ColorToken = keyof typeof colors;
