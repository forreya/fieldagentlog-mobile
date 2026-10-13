// fieldagentlog.com/v/ with no token - a mangled or truncated visit link. The
// inspector can still type the code from their message, so this goes straight
// to the enter-code screen instead of an unmatched route.

import { Redirect } from "expo-router";

export function VisitLinkWithoutToken() {
	return <Redirect href="/enter-code" />;
}
