// The signed-in home. A placeholder on purpose: D3 replaces it with the real
// dashboard, and D1 only needs somewhere the guard can legitimately land.

import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts } from "@/theme/tokens";

const WHAT_IS_COMING: Record<string, string> = {
	staff: "Your blocks, the checks due on them, and planning a round of visits.",
	agent: "The blocks assigned to you and the checks due on each one.",
	cleaner: "Checking in and out of a site, your duties, and reporting an issue.",
};

export default function SignedInHome() {
	const { state, signOut } = useAuth();
	const sync = useSyncStatus();
	if (state.status !== "signed_in") return null;

	return (
		<Screen
			title="FieldAgentLog"
			sub={`Signed in as ${state.role}`}
			action={<StatusPill {...sync} />}
			signedInAs={state.user.email ?? undefined}
			footer={<Button label="Sign out" variant="ghostDark" block onPress={() => void signOut()} />}
		>
			<Card>
				<Text style={styles.h}>Nothing here yet</Text>
				<Text style={styles.p}>{WHAT_IS_COMING[state.role]} It arrives in the next build.</Text>
			</Card>
			<Card>
				<Text style={styles.h}>About this app</Text>
				<Text style={styles.p}>The version, and what it is connected to. Worth quoting if you report a problem.</Text>
				<Button label="About" variant="ghost" onPress={() => router.push("/about")} />
			</Card>
			<Card>
				<Text style={styles.h}>Open a visit</Text>
				<Text style={styles.p}>Inspection links work whether or not you are signed in.</Text>
				<Button label="Enter a visit link" variant="ghost" onPress={() => router.push("/enter-code")} />
			</Card>
		</Screen>
	);
}

const styles = StyleSheet.create({
	h: { fontFamily: fonts.displayHeavy, fontSize: 18, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
