import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CleanerSite } from "@/api/cleaner";
import { formatDistance } from "@/lib/nearby";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

/**
 * One site on the cleaner's list.
 *
 * Deliberately not BlockCard. A block card previews the jobs due on it, and a
 * cleaner has no use for that: most of a block's fire checks are somebody
 * else's responsibility, and showing them would imply otherwise. The only
 * number here is the one they are accountable for.
 */
export function SiteCard({
	site,
	onOpen,
	distanceKm,
	disabled,
}: {
	site: CleanerSite;
	onOpen: () => void;
	distanceKm?: number;
	/** Greyed while a session is open elsewhere: one site at a time. */
	disabled?: boolean;
}) {
	const duties = site.duties_due;
	const dutyText = duties === 0 ? "no checks due" : `${duties} fire check${duties === 1 ? "" : "s"} due`;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(disabled) }}
			accessibilityLabel={`${site.name}. ${dutyText}${distanceKm === undefined ? "" : `. ${formatDistance(distanceKm)} away`}`}
			disabled={disabled}
			onPress={onOpen}
			style={({ pressed }) => [styles.card, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
		>
			<View style={styles.head}>
				<View style={styles.id}>
					<Text style={styles.name}>{site.name}</Text>
					{site.address ? (
						<Text style={styles.address} numberOfLines={2}>
							{site.address}
						</Text>
					) : null}
					{distanceKm === undefined ? null : <Text style={styles.distance}>{formatDistance(distanceKm)} away</Text>}
				</View>
				{/* Silence is the good state. A "0 due" chip on every site trains
				    people to stop reading the chips at all. */}
				{duties > 0 ? (
					<View style={styles.duties}>
						<Text style={styles.dutiesText}>{duties} due</Text>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		minHeight: TAP,
	},
	pressed: { transform: [{ scale: 0.995 }], borderColor: colors.plateEdgeStrong },
	disabled: { opacity: 0.5 },
	head: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
	id: { flex: 1, gap: 2 },
	name: { fontFamily: fonts.displayHeavy, fontSize: 18, color: colors.plateInk },
	address: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.plateMuted },
	distance: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.signalDeep, marginTop: 2 },
	duties: { paddingVertical: 4, paddingHorizontal: space.s2, borderRadius: radii.sm, backgroundColor: colors.signalTint },
	dutiesText: { fontFamily: fonts.displayHeavy, fontSize: 12, color: colors.signalDeep },
});
