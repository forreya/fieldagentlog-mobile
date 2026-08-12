import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii } from "@/theme/tokens";

/** What the sync engine is doing, in the app bar. Ported from the web pill. */
export type SyncState = { online: boolean; syncing?: boolean; pending?: number };

/** Pure: the pill's words and tone for a sync state. Tested directly. */
export function pillFor(state: SyncState): { label: string; tone: "online" | "offline" | "busy" } {
	if (!state.online) return { label: "Offline", tone: "offline" };
	if (state.syncing) return { label: "Syncing", tone: "busy" };
	if (state.pending && state.pending > 0) return { label: `${state.pending} to sync`, tone: "busy" };
	return { label: "Online", tone: "online" };
}

export function StatusPill(state: SyncState) {
	const { label, tone } = pillFor(state);
	return (
		<View accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.pill}>
			<View style={[styles.dot, { backgroundColor: toneColors[tone] }]} />
			<Text style={[styles.label, { color: toneColors[tone] }]}>{label}</Text>
		</View>
	);
}

const toneColors = {
	online: colors.syncOnline,
	offline: colors.mutedOnDark,
	busy: colors.signal,
} as const;

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 5,
		paddingHorizontal: 10,
		borderRadius: radii.pill,
		borderWidth: 1,
		borderColor: colors.lineOnDark,
	},
	dot: { width: 8, height: 8, borderRadius: 4 },
	label: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" },
});
