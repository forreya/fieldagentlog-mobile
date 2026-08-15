import { Pressable, StyleSheet, Text, View } from "react-native";

import type { NearStatus } from "@/data/useFind";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

import { TextField } from "./TextField";

interface Props {
	query: string;
	onQuery: (query: string) => void;
	near: NearStatus;
	onToggleNear: () => void;
	error: string | null;
	/** "3 of 8 blocks" - only shown once a query is actually filtering. */
	showing: { shown: number; total: number };
}

const NEAR_LABEL: Record<NearStatus, string> = {
	off: "Nearest",
	locating: "Locating...",
	on: "Nearest",
	error: "Nearest",
};

/**
 * Search, and order-by-distance. Both are conveniences: a field agent with four
 * blocks needs neither, and one with forty needs both.
 *
 * Nearest is a toggle rather than a mode, and it never asks for location just
 * by being on screen - only a tap does that.
 */
export function FindBar({ query, onQuery, near, onToggleNear, error, showing }: Props) {
	const filtering = query.trim().length > 0;
	const active = near === "on";

	return (
		<View style={styles.bar}>
			<View style={styles.row}>
				<View style={styles.field}>
					<TextField
						accessibilityLabel="Search your blocks"
						value={query}
						onChange={onQuery}
						placeholder="Search by name, address or postcode"
						autoCapitalize="none"
					/>
				</View>
				<Pressable
					accessibilityRole="switch"
					accessibilityState={{ checked: active, busy: near === "locating" }}
					accessibilityLabel="Sort by nearest"
					onPress={onToggleNear}
					style={[styles.near, active && styles.nearOn]}
				>
					<Text style={[styles.nearText, active && styles.nearTextOn]}>{NEAR_LABEL[near]}</Text>
				</Pressable>
			</View>

			{error ? (
				<Text accessibilityRole="alert" style={styles.error}>
					{error}
				</Text>
			) : null}

			{filtering ? (
				<Text style={styles.showing}>
					{showing.shown} of {showing.total} {showing.total === 1 ? "block" : "blocks"}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: { gap: space.s2 },
	row: { flexDirection: "row", alignItems: "flex-start", gap: space.s2 },
	field: { flex: 1 },
	near: {
		minHeight: TAP,
		paddingHorizontal: space.s3,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: radii.sm,
		borderWidth: 2,
		borderColor: colors.plateEdgeStrong,
	},
	nearOn: { backgroundColor: colors.signalDeep, borderColor: colors.signalDeep },
	nearText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.plateInk },
	nearTextOn: { color: colors.plateRaised },
	error: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.fail },
	showing: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
