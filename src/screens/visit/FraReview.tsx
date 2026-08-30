import { Pressable, StyleSheet, Text, View } from "react-native";

import { FRA_STATUS_LABEL, type FraAction, type FraActionStatus } from "@/api/contract";
import { Card } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import type { VisitRecord } from "@/db/types";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";
import type { WizardAction } from "@/visit/wizard";

const OPTIONS: { value: FraActionStatus; label: string }[] = (["outstanding", "in_progress", "resolved"] as const).map((value) => ({
	value,
	label: FRA_STATUS_LABEL[value],
}));

/** The server sends the assessment's own wording, so match loosely. */
function severityColor(severity: string): string {
	switch (severity.toLowerCase()) {
		case "low":
			return colors.sevLow;
		case "medium":
			return colors.sevMedium;
		case "high":
			return colors.sevHigh;
		case "intolerable":
			return colors.sevIntolerable;
		default:
			return colors.na;
	}
}

/**
 * Open actions carried over from the fire risk assessment.
 *
 * Entirely optional: only actions the inspector explicitly touches are sent, so
 * an untouched list submits nothing and leaves the assessment as it stands.
 * Tapping the chosen status again clears it, which is the only way back to
 * "didn't look at it" once something has been pressed by mistake.
 */
export function FraReview({
	actions,
	updates,
	dispatch,
}: {
	actions: FraAction[];
	updates: VisitRecord["fra_updates"];
	dispatch: (action: WizardAction) => void;
}) {
	return (
		<View style={styles.section}>
			<Text style={styles.heading}>Open actions from the fire risk assessment</Text>
			{actions.map((action) => (
				<FraCard key={action.id} action={action} update={updates[action.id]} dispatch={dispatch} />
			))}
		</View>
	);
}

function FraCard({
	action,
	update,
	dispatch,
}: {
	action: FraAction;
	update: VisitRecord["fra_updates"][string] | undefined;
	dispatch: (action: WizardAction) => void;
}) {
	const setStatus = (status: FraActionStatus) =>
		update?.status === status
			? dispatch({ type: "CLEAR_FRA", actionId: action.id })
			: dispatch({ type: "SET_FRA", actionId: action.id, status, note: update?.note ?? "" });

	return (
		<Card>
			<View style={styles.titleRow}>
				{action.severity ? (
					<View style={[styles.sev, { backgroundColor: severityColor(action.severity) }]}>
						<Text style={styles.sevText}>{action.severity}</Text>
					</View>
				) : null}
				<Text style={styles.title}>{action.title}</Text>
			</View>
			{action.detail ? <Text style={styles.detail}>{action.detail}</Text> : null}

			<View accessibilityRole="radiogroup" accessibilityLabel={`Status of: ${action.title}`} style={styles.options}>
				{OPTIONS.map((option) => {
					const selected = update?.status === option.value;
					return (
						<Pressable
							key={option.value}
							accessibilityRole="radio"
							accessibilityState={{ checked: selected }}
							accessibilityLabel={option.label}
							onPress={() => setStatus(option.value)}
							style={[styles.option, selected && styles.optionOn]}
						>
							<Text style={[styles.optionLabel, selected && styles.optionLabelOn]}>{option.label}</Text>
						</Pressable>
					);
				})}
			</View>

			{update ? (
				<TextField
					accessibilityLabel={`Note for: ${action.title}`}
					placeholder="Add a note (optional)"
					value={update.note}
					onChange={(note) => dispatch({ type: "SET_FRA", actionId: action.id, status: update.status, note })}
					multiline
				/>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	section: { gap: space.s3 },
	heading: { fontFamily: fonts.bodyMedium, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: colors.plateMuted },
	titleRow: { flexDirection: "row", alignItems: "center", gap: space.s2, flexWrap: "wrap" },
	sev: { paddingVertical: 3, paddingHorizontal: space.s2, borderRadius: radii.sm },
	sevText: { fontFamily: fonts.displayHeavy, fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase", color: colors.plateRaised },
	title: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	detail: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateMuted },
	options: { flexDirection: "row", gap: space.s2 },
	option: {
		flex: 1,
		minHeight: TAP,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.sm,
		borderWidth: 2,
		borderColor: colors.plateEdgeStrong,
		paddingHorizontal: space.s2,
	},
	optionOn: { backgroundColor: colors.signalDeep, borderColor: colors.signalDeep },
	optionLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.plateInk, textAlign: "center" },
	optionLabelOn: { color: colors.plateRaised },
});
