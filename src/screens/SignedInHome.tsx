// Which home a signed-in person lands on.
//
// Every persona now has one, so this is a router rather than a screen. The
// fallback below is not dead code: `role_unknown` is a real state (the claim
// could not be read and the lookup has not returned), and a role we do not
// recognise is possible the day BalanceBuddy adds a fourth. Neither should show
// a blank page.

import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { BlocksHome } from "@/screens/blocks/BlocksHome";
import { CleanerHome } from "@/screens/cleaner/CleanerHome";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts } from "@/theme/tokens";

export function SignedInHome() {
	const { state, signOut } = useAuth();
	const sync = useSyncStatus();
	if (state.status !== "signed_in") return null;

	// Staff and agents share a screen - what differs is where the blocks come
	// from, which useDashboard decides. A cleaner's list is sites, not blocks.
	if (state.role === "agent" || state.role === "staff") return <BlocksHome />;
	if (state.role === "cleaner") return <CleanerHome />;

	return (
		<Screen
			title="FieldAgentLog"
			sub={`Signed in as ${state.role}`}
			action={<StatusPill {...sync} />}
			signedInAs={state.user.email ?? undefined}
			footer={<Button label="Sign out" variant="ghostDark" block onPress={() => void signOut()} />}
		>
			<Card>
				<Text style={styles.h}>We can&apos;t tell what you do here</Text>
				<Text style={styles.p}>
					Your account signed in, but it isn&apos;t set up as staff, a field agent or a cleaner. Your managing agent can put that right.
				</Text>
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
