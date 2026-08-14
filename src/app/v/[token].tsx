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
		case "ready": {
			// The wizard itself arrives in C2-C5. Until then this proves the load
			// path end to end: the right visit, the right checks, from cache or not.
			const packet = state.record.packet as { visit?: { block_name?: string; due_date?: string }; checks?: unknown[] };
			return (
				<Screen title={packet.visit?.block_name ?? "Visit"} sub={state.status === "submitted" ? "Already submitted" : "Loaded"}>
					<Card>
						<Text style={styles.h}>{state.status === "submitted" ? "This visit is complete" : "Ready to inspect"}</Text>
						<Text style={styles.p}>
							{packet.checks?.length ?? 0} check(s) due{packet.visit?.due_date ? `, by ${packet.visit.due_date}` : ""}.
							{state.status === "ready" && state.fromCache ? " Working from the copy saved on this device." : ""}
						</Text>
					</Card>
				</Screen>
			);
		}
	}
}

const styles = StyleSheet.create({
	h: { fontFamily: fonts.displayHeavy, fontSize: 20, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
