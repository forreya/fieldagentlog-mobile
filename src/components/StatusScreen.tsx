import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, space } from "@/theme/tokens";

/**
 * A whole-screen message: loading, a dead link, a failed load.
 *
 * Deliberately plain. These are the screens someone meets when the app cannot
 * do what they came to do, often outdoors and in a hurry, so the title says
 * what happened and the body says what to do about it.
 */
export function StatusScreen({
	tone = "neutral",
	title,
	body,
	children,
}: {
	tone?: "neutral" | "bad";
	title: string;
	body?: string;
	children?: ReactNode;
}) {
	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.inner}>
				<View style={[styles.mark, tone === "bad" && styles.markBad]} />
				<Text style={styles.title}>{title}</Text>
				{body ? <Text style={styles.body}>{body}</Text> : null}
				{children ? <View style={styles.actions}>{children}</View> : null}
			</View>
		</SafeAreaView>
	);
}

/** The first thing an inspector sees when a link opens. */
export function LoadingScreen() {
	return (
		<SafeAreaView style={styles.root}>
			<View style={styles.inner}>
				<ActivityIndicator accessibilityLabel="Loading the visit" color={colors.signal} size="large" />
				<Text style={styles.body}>Loading this visit...</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.ink },
	inner: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.s6, gap: space.s4 },
	mark: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.signal },
	markBad: { backgroundColor: colors.fail },
	title: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.textOnDark, textAlign: "center" },
	body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.mutedOnDark, textAlign: "center", maxWidth: 340 },
	actions: { alignSelf: "stretch", gap: space.s3, marginTop: space.s4 },
});
