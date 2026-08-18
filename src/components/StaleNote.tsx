import { StyleSheet, Text, View } from "react-native";

import { freshnessLabel } from "@/data/useDashboard";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * The refresh failed, but there is still a usable list underneath.
 *
 * The honesty is the point: a field worker deciding whether to walk into a
 * building needs to know the list is from this morning rather than now. Hiding
 * a failed refresh behind data that looks current is the one thing this must
 * never do.
 */
export function StaleNote({ message, updatedAt }: { message: string; updatedAt: number | null }) {
	return (
		<View style={styles.stale}>
			<Text style={styles.title}>Showing what was saved here</Text>
			<Text style={styles.body}>
				{message} {freshnessLabel(updatedAt)}.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	stale: { backgroundColor: colors.naTint, borderLeftWidth: 4, borderLeftColor: colors.sevMedium, borderRadius: 8, padding: space.s3, gap: 2 },
	title: { fontFamily: fonts.displayHeavy, fontSize: 15, color: colors.plateInk },
	body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateInk },
});
