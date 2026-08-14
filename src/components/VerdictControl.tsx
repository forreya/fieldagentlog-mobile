import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Severity, Verdict } from "@/api/contract";
import { colors, fonts, radii, space, TAP, TAP_VERDICT } from "@/theme/tokens";

import { VerdictMark } from "./VerdictMark";

/**
 * The one bold gesture of the whole app: PASS / FAIL / N/A.
 *
 * Oversized on purpose (>=78pt). This is pressed with gloves on, in a stairwell,
 * often one-handed while holding a torch. Every option carries a shape and a
 * word as well as a colour, so it survives sunlight and colour-blindness alike.
 */
const VERDICTS: { value: Verdict; label: string; tint: string; on: string }[] = [
	{ value: "pass", label: "PASS", tint: colors.passTint, on: colors.pass },
	{ value: "fail", label: "FAIL", tint: colors.failTint, on: colors.fail },
	{ value: "na", label: "N/A", tint: colors.naTint, on: colors.na },
];

export function VerdictControl({ value, onChange }: { value: Verdict | null; onChange: (v: Verdict) => void }) {
	return (
		<View accessibilityRole="radiogroup" accessibilityLabel="Verdict for this check" style={styles.row}>
			{VERDICTS.map((option) => {
				const selected = value === option.value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="radio"
						accessibilityState={{ checked: selected }}
						accessibilityLabel={option.label}
						onPress={() => onChange(option.value)}
						style={({ pressed }) => [
							styles.verdict,
							{ backgroundColor: selected ? option.on : option.tint },
							selected && styles.selected,
							pressed && styles.pressed,
						]}
					>
						<VerdictMark verdict={option.value} color={selected ? colors.plateRaised : option.on} />
						<Text style={[styles.label, { color: selected ? colors.plateRaised : option.on }]}>{option.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

/** Escalating order matters: the ramp reads low to intolerable, left to right. */
const SEVERITIES: { value: Severity; label: string; tint: string }[] = [
	{ value: "low", label: "Low", tint: colors.sevLow },
	{ value: "medium", label: "Medium", tint: colors.sevMedium },
	{ value: "high", label: "High", tint: colors.sevHigh },
	{ value: "intolerable", label: "Intolerable", tint: colors.sevIntolerable },
];

export function SeveritySelect({ value, onChange }: { value: Severity | null; onChange: (v: Severity) => void }) {
	return (
		<View accessibilityRole="radiogroup" accessibilityLabel="Severity of the failure" style={styles.sevRow}>
			{SEVERITIES.map((option) => {
				const selected = value === option.value;
				return (
					<Pressable
						key={option.value}
						accessibilityRole="radio"
						accessibilityState={{ checked: selected }}
						accessibilityLabel={option.label}
						onPress={() => onChange(option.value)}
						style={({ pressed }) => [
							styles.sev,
							{ borderColor: option.tint },
							selected && { backgroundColor: option.tint },
							pressed && styles.pressed,
						]}
					>
						<Text style={[styles.sevLabel, { color: selected ? colors.plateRaised : option.tint }]}>{option.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	row: { flexDirection: "row", gap: space.s2 },
	verdict: {
		flex: 1,
		minHeight: TAP_VERDICT,
		alignItems: "center",
		justifyContent: "center",
		gap: space.s2,
		borderRadius: radii.md,
		borderWidth: 2,
		borderColor: "transparent",
		paddingVertical: space.s3,
	},
	selected: { borderColor: colors.plateInk },
	pressed: { transform: [{ scale: 0.98 }] },
	label: { fontFamily: fonts.displayHeavy, fontSize: 15, letterSpacing: 1 },
	sevRow: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
	sev: {
		minHeight: TAP,
		flexGrow: 1,
		flexBasis: "45%",
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.sm,
		borderWidth: 2,
		paddingHorizontal: space.s3,
	},
	sevLabel: { fontFamily: fonts.display, fontSize: 14, letterSpacing: 0.4 },
});
