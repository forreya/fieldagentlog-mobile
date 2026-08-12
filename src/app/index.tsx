import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { backendSummary } from "@/lib/config";
import { APP_NAME } from "@/lib/constants";
import { colors, fonts, space } from "@/theme/tokens";

export default function Index() {
	return (
		<Screen title={APP_NAME} sub="Foundations build" action={<StatusPill online />}>
			<Card>
				<Text style={styles.h}>Nothing here yet</Text>
				<Text style={styles.p}>The wizard, sign-in and cleaner flows arrive in later phases. Backend: {backendSummary()}.</Text>
			</Card>
			<Link href="/gallery" style={styles.link}>
				Component gallery
			</Link>
		</Screen>
	);
}

const styles = StyleSheet.create({
	h: { fontFamily: fonts.displayHeavy, fontSize: 20, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, color: colors.plateMuted, lineHeight: 22 },
	link: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.signalDeep, padding: space.s2 },
});
