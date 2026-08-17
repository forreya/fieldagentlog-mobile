import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

/**
 * A dismissable line of news: something was sent, or something went wrong.
 *
 * Dismissable on purpose. These announce an event rather than a state, and an
 * undismissable "Report sent" is still on screen an hour later implying it just
 * happened. The screens own when to clear them; this only offers the button.
 */
export function Banner({ tone, text, onDismiss }: { tone: "ok" | "bad"; text: string; onDismiss: () => void }) {
	return (
		<View style={[styles.banner, tone === "bad" ? styles.bad : styles.ok]} accessibilityRole={tone === "bad" ? "alert" : "summary"}>
			<Text style={styles.text}>{text}</Text>
			<Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.dismiss}>
				<Text style={[styles.dismissText, tone === "bad" ? styles.dismissBad : styles.dismissOk]}>Done</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: space.s3,
		borderRadius: radii.lg,
		borderLeftWidth: 4,
		padding: space.s3,
	},
	ok: { backgroundColor: colors.passTint, borderLeftColor: colors.pass },
	bad: { backgroundColor: colors.failTint, borderLeftColor: colors.fail },
	text: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateInk },
	dismiss: { minHeight: TAP, justifyContent: "center", paddingHorizontal: space.s2, marginVertical: -space.s2 },
	dismissText: { fontFamily: fonts.displayHeavy, fontSize: 13 },
	dismissOk: { color: colors.pass },
	dismissBad: { color: colors.fail },
});
