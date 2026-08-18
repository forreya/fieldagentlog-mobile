import { router } from "expo-router";

import { goBack } from "@/lib/nav";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { backendSummary } from "@/lib/config";
import { APP_NAME } from "@/lib/constants";
import { APP_VERSION, BUILD_COMMIT, BUILD_NUMBER, BUILD_PROFILE, buildDateLabel, versionLabel } from "@/lib/version";
import { colors, fonts, space } from "@/theme/tokens";

const GUIDE_URL = "https://fieldagentlog.com/guide";

/**
 * Which build is this?
 *
 * Deliberately dull and readable: when something is wrong on site, this is what
 * gets read down the phone, so every value is a short string someone can say
 * out loud. It is reachable signed out, because the person having trouble is
 * often an inspector with no account at all.
 */
export function AboutScreen() {
	return (
		<Screen
			title="About"
			sub="This app"
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => goBack("/")} />
					<Button label="Diagnostics" variant="ghostDark" onPress={() => router.push("/diagnostics")} style={styles.grow} />
				</>
			}
		>
			<Card>
				<Text style={styles.name}>{APP_NAME}</Text>
				<Text style={styles.version}>{versionLabel()}</Text>
			</Card>

			<Card>
				<Row label="Version" value={APP_VERSION} />
				{BUILD_NUMBER ? <Row label="Build" value={BUILD_NUMBER} /> : null}
				<Row label="Commit" value={BUILD_COMMIT || "unknown"} />
				<Row label="Built" value={buildDateLabel()} />
				{BUILD_PROFILE ? <Row label="Profile" value={BUILD_PROFILE} /> : null}
				<Row label="Backend" value={backendSummary()} />
			</Card>

			<Text style={styles.note}>Reporting a problem? Quote the version above - it identifies exactly which build you&apos;re on.</Text>

			<Button label="Read the guide" variant="ghost" onPress={() => void Linking.openURL(GUIDE_URL).catch(() => undefined)} />
		</Screen>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.row}>
			<Text style={styles.label}>{label}</Text>
			<Text style={styles.value} selectable>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	name: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.plateInk },
	version: { fontFamily: fonts.mono, fontSize: 15, color: colors.plateMuted },
	row: { flexDirection: "row", alignItems: "baseline", gap: space.s3, minHeight: 28 },
	label: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.plateMuted },
	value: { flex: 2, fontFamily: fonts.mono, fontSize: 14, color: colors.plateInk },
	note: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateMuted },
});
