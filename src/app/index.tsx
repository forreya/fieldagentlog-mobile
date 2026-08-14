import { Link, router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { APP_NAME } from "@/lib/constants";
import { colors, fonts, space } from "@/theme/tokens";

export default function Index() {
	const sync = useSyncStatus();
	return (
		<Screen title={APP_NAME} sub="Fire-safety inspections" action={<StatusPill {...sync} />}>
			<Card>
				<Text style={styles.h}>Got a visit link?</Text>
				<Text style={styles.p}>
					Tapping the link in your message opens the visit straight away. If it opens your browser instead, paste it in here.
				</Text>
				<Button label="Enter a visit link" size="lg" block onPress={() => router.push("/enter-code")} />
			</Card>
			<Card>
				<Text style={styles.h}>Work here?</Text>
				<Text style={styles.p}>Staff, field agents and cleaners sign in to see the blocks and checks due to them.</Text>
				<Button label="Sign in" variant="ghost" onPress={() => router.push("/login")} />
			</Card>
			<Link href="/gallery" style={styles.link}>
				Component gallery
			</Link>
			<Link href="/diagnostics" style={styles.link}>
				Diagnostics
			</Link>
		</Screen>
	);
}

const styles = StyleSheet.create({
	h: { fontFamily: fonts.displayHeavy, fontSize: 20, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, color: colors.plateMuted, lineHeight: 22 },
	link: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.signalDeep, padding: space.s2 },
});
