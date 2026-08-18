import { StyleSheet, Text, View } from "react-native";

import type { CleanerDuty } from "@/api/cleaner";
import { Button } from "@/components/Button";
import { colors, fonts, radii, space } from "@/theme/tokens";

/**
 * "While you're here": the fire checks that are a cleaner's job at this site.
 *
 * Framed as an offer rather than a task list. A cleaner came to clean; these
 * are worth doing because they are already standing in the building, and the
 * copy says so instead of implying they were sent for them.
 *
 * Only the count and the cadence per row. What each check actually involves is
 * the wizard's job, and duplicating it here would make the card a wall of text
 * on the screen someone reads with one hand.
 */
export function DutiesCard({ duties, busy, onStart }: { duties: CleanerDuty[]; busy: boolean; onStart: () => void }) {
	if (duties.length === 0) return null;

	return (
		<View style={styles.card}>
			<Text style={styles.eyebrow}>WHILE YOU&apos;RE HERE</Text>
			<Text style={styles.title}>
				{duties.length} fire-safety {duties.length === 1 ? "check" : "checks"} due
			</Text>

			<View style={styles.list}>
				{duties.map((duty) => (
					<View key={duty.id} style={styles.row}>
						<Text style={styles.dutyTitle} numberOfLines={2}>
							{duty.title}
						</Text>
						<View style={[styles.chip, duty.status === "overdue" ? styles.chipOverdue : styles.chipSoon]}>
							<Text style={[styles.chipText, duty.status === "overdue" ? styles.chipTextOverdue : styles.chipTextSoon]}>{duty.freq_label}</Text>
						</View>
					</View>
				))}
			</View>

			<Button label="Start checks" variant="ghost" busy={busy} block onPress={onStart} />
			<Text style={styles.hint}>Each result goes into the block&apos;s fire logbook under your name.</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s3,
	},
	eyebrow: { fontFamily: fonts.displayHeavy, fontSize: 11, letterSpacing: 1.2, color: colors.plateMuted },
	title: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.plateInk },
	list: { gap: space.s2 },
	row: { flexDirection: "row", alignItems: "center", gap: space.s3 },
	dutyTitle: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.plateInk },
	chip: { paddingVertical: 3, paddingHorizontal: space.s2, borderRadius: radii.sm },
	chipOverdue: { backgroundColor: colors.failTint },
	chipSoon: { backgroundColor: colors.naTint },
	chipText: { fontFamily: fonts.displayHeavy, fontSize: 11 },
	chipTextOverdue: { color: colors.fail },
	chipTextSoon: { color: colors.plateMuted },
	hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.plateMuted },
});
