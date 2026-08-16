import { StyleSheet, Text } from "react-native";

import { colors, fonts } from "@/theme/tokens";

import { Card } from "./Screen";

/**
 * A titled message in a card: empty states, load failures, gentle explanations.
 * One shape everywhere, so "no blocks" and "couldn't load blocks" read as
 * siblings rather than as two apps.
 */
export function Note({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
	return (
		<Card>
			<Text style={styles.title}>{title}</Text>
			<Text style={styles.body}>{body}</Text>
			{children}
		</Card>
	);
}

const styles = StyleSheet.create({
	title: { fontFamily: fonts.displayHeavy, fontSize: 18, color: colors.plateInk },
	body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
