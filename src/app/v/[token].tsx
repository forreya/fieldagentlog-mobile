// The inspector's front door: fieldagentlog.com/v/<token>, or the same token
// typed in by hand.
//
// This route is reachable SIGNED OUT and must stay that way. An external
// inspector has no account, no Supabase session and no app installed until the
// link arrives; gating this on auth, on config, or on the backend being
// reachable would break the product's main flow.

import { useLocalSearchParams } from "expo-router";

import { LoadingScreen } from "@/components/StatusScreen";
import { ConnectionErrorScreen } from "@/screens/visit/ConnectionErrorScreen";
import { DeadEndScreen } from "@/screens/visit/DeadEndScreen";
import { SuccessScreen } from "@/screens/visit/SuccessScreen";
import { VisitWizard } from "@/screens/visit/VisitWizard";
import { useVisitLoad } from "@/visit/useVisitLoad";
import { blockNameOf } from "@/visit/wizard";

export default function VisitRoute() {
	const { token } = useLocalSearchParams<{ token: string }>();
	const { state, retry } = useVisitLoad(token ?? "");

	switch (state.status) {
		case "loading":
			return <LoadingScreen />;
		case "dead_end":
			return <DeadEndScreen reason={state.reason} />;
		case "offline_no_cache":
			return <ConnectionErrorScreen mode="offline" onRetry={retry} token={token} />;
		case "error":
			return <ConnectionErrorScreen mode="error" onRetry={retry} token={token} />;
		case "submitted":
			// Reopening a finished link. Shown from cache without a request: the
			// visit is locked, so asking the server could only fail underground.
			return <SuccessScreen blockName={blockNameOf(state.record)} submitted={state.record.submitted} token={token} />;
		case "ready":
			return <VisitWizard record={state.record} fromCache={state.fromCache} />;
	}
}
