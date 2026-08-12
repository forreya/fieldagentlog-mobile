import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii, space } from "@/theme/tokens";

/** Cadence label ("Monthly"), rendered verbatim from the packet. */
export function FrequencyBadge({ label }: { label: string }) {
	if (!label) return null;
	return (
		<View style={styles.badge}>
			<View style={styles.dot} />
			<Text style={styles.badgeText}>{label}</Text>
		</View>
	);
}

/** Which visual treatment a server due-status code gets. Exported for tests:
 *  the server owns the words, we only choose the paint. */
export type DueTone = "overdue" | "due" | "clear";

export function dueTone(status: string): DueTone {
	const s = (status || "").toLowerCase();
	if (s.includes("overdue")) return "overdue";
	if (s.includes("due")) return "due";
	return "clear";
}

/**
 * Renders the server's status_label verbatim; only the styling keys off the
 * status code. Never invent due wording on the client.
 */
export function DueChip({ status, label }: { status: string; label?: string }) {
	const tone = dueTone(status);
	const text = label || status || "Due";
	return (
		<View style={[styles.chip, chipTones[tone]]}>
			<Text style={[styles.chipText, chipTextTones[tone]]}>{text}</Text>
		</View>
	);
}

/** Standard reference, stamped like a data plate. */
export function RefTag({ children }: { children: string }) {
	return <Text style={styles.ref}>{children}</Text>;
}

const styles = StyleSheet.create({
	badge: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.s2,
		paddingVertical: 6,
		paddingLeft: 10,
		paddingRight: space.s3,
		backgroundColor: colors.plate,
		borderWidth: 1,
		borderColor: colors.plateEdgeStrong,
		borderRadius: radii.sm,
	},
	dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colors.plateEdgeStrong, backgroundColor: colors.plateRaised },
	badgeText: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: colors.plateMuted },
	chip: { paddingVertical: 6, paddingHorizontal: space.s3, borderRadius: radii.sm, borderWidth: 1, borderColor: "transparent" },
	chipText: { fontFamily: fonts.displayHeavy, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" },
	ref: {
		fontFamily: fonts.mono,
		fontSize: 13,
		color: colors.plateInk,
		backgroundColor: colors.plate,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: 6,
		paddingVertical: 3,
		paddingHorizontal: space.s2,
		alignSelf: "flex-start",
		overflow: "hidden",
	},
});

const chipTones = StyleSheet.create({
	overdue: { backgroundColor: colors.signal },
	due: { backgroundColor: colors.signalTint, borderColor: colors.signal },
	clear: { backgroundColor: colors.naTint },
});

const chipTextTones = StyleSheet.create({
	overdue: { color: colors.ink },
	due: { color: colors.signalDeep },
	clear: { color: colors.plateMuted },
});
