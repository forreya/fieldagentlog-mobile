// The inspector's front door: fieldagentlog.com/v/<token>, or the same token
// typed in by hand.
//
// This route is reachable SIGNED OUT and must stay that way. An external
// inspector has no account, no Supabase session and no app installed until the
// link arrives; gating this on auth, on config, or on the backend being
// reachable would break the product's main flow.

import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Card, Screen } from "@/components/Screen";
import { LoadingScreen } from "@/components/StatusScreen";
import { ConnectionErrorScreen } from "@/screens/visit/ConnectionErrorScreen";
import { DeadEndScreen } from "@/screens/visit/DeadEndScreen";
import { VisitWizard } from "@/screens/visit/VisitWizard";
import { colors, fonts } from "@/theme/tokens";
import { useVisitLoad } from "@/visit/useVisitLoad";

export default function VisitRoute() {
	const { token } = useLocalSearchParams<{ token: string }>();
	const { state, retry } = useVisitLoad(token ?? "");

	switch (state.status) {
		case "loading":
			return <LoadingScreen />;
		case "dead_end":
			return <DeadEndScreen reason={state.reason} />;
		case "offline_no_cache":
			return <ConnectionErrorScreen mode="offline" onRetry={retry} />;
		case "error":
			return <ConnectionErrorScreen mode="error" onRetry={retry} />;
		case "submitted":
			// The locked success screen arrives with submit, in C5.
			return (
				<Screen title="Visit complete" sub="Already submitted">
					<Card>
						<Text style={styles.h}>This visit is complete</Text>
						<Text style={styles.p}>It was submitted from this device and can no longer be edited.</Text>
					</Card>
				</Screen>
			);
		case "ready":
			return <VisitWizard record={state.record} />;
	}
}

const styles = StyleSheet.create({
	h: { fontFamily: fonts.displayHeavy, fontSize: 20, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
