import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, fonts, radii, shadows, space } from "@/theme/tokens";

interface Props {
	title: string;
	sub?: string;
	/** Right-aligned app-bar control (sync pill, sign out). */
	action?: ReactNode;
	/** Pinned under the bar so it survives drilling in. */
	signedInAs?: string;
	/** Actions docked at the bottom, above the home indicator. */
	footer?: ReactNode;
	scroll?: boolean;
	children: ReactNode;
}

/**
 * How far the app bar's own text is allowed to grow.
 *
 * Everything in the body scales without limit - that is the point of dynamic
 * type. The bar is different: it is a fixed-height strip already sharing a row
 * with the sync pill and a menu, and at the accessibility sizes the title
 * collapsed to "Ce..." and the subtitle to "Check...", so the block being
 * inspected became unreadable at exactly the setting meant to help.
 *
 * 1.3 is where the longest real block name still fits on one line. The body
 * text below it is untouched.
 */
const BAR_TEXT_SCALE = 1.3;

/**
 * The app frame: graphite housing (app bar and bottom bar) around a bright
 * plate working surface. Safe-area insets are handled here so no screen has to
 * think about notches or home indicators.
 */
export function Screen({ title, sub, action, signedInAs, footer, scroll = true, children }: Props) {
	const body = <View style={styles.body}>{children}</View>;
	return (
		<View style={styles.root}>
			<SafeAreaView edges={["top"]} style={styles.bar}>
				<View style={styles.barRow}>
					<View style={styles.barTitles}>
						<Text numberOfLines={1} maxFontSizeMultiplier={BAR_TEXT_SCALE} style={styles.title}>
							{title}
						</Text>
						{sub ? (
							<Text numberOfLines={1} maxFontSizeMultiplier={BAR_TEXT_SCALE} style={styles.sub}>
								{sub}
							</Text>
						) : null}
					</View>
					{action}
				</View>
				{signedInAs ? (
					<Text numberOfLines={1} maxFontSizeMultiplier={BAR_TEXT_SCALE} style={styles.who}>
						Signed in as {signedInAs}
					</Text>
				) : null}
			</SafeAreaView>

			{scroll ? <ScrollView contentContainerStyle={styles.scroll}>{body}</ScrollView> : body}

			{footer ? (
				<SafeAreaView edges={["bottom"]} style={styles.footer}>
					<View style={styles.footerRow}>{footer}</View>
				</SafeAreaView>
			) : null}
		</View>
	);
}

/** A raised plate card - the unit every screen composes from. */
export function Card({ children }: { children: ReactNode }) {
	return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
	root: { flex: 1, backgroundColor: colors.plate },
	bar: { backgroundColor: colors.graphite, paddingHorizontal: space.s4, paddingTop: space.s3 },
	barRow: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 40 },
	barTitles: { flex: 1 },
	title: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.textOnDark },
	sub: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedOnDark, marginTop: 2 },
	who: { fontFamily: fonts.body, fontSize: 12, color: colors.mutedOnDark, paddingBottom: space.s2 },
	scroll: { flexGrow: 1 },
	body: { flex: 1, paddingHorizontal: space.s4, paddingTop: space.s5, paddingBottom: space.s8, gap: space.s5 },
	footer: { backgroundColor: colors.graphite, borderTopWidth: 1, borderTopColor: colors.lineOnDark },
	footerRow: { flexDirection: "row", gap: space.s3, padding: space.s3 },
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s5,
		gap: space.s3,
		...shadows.plate,
	},
});
