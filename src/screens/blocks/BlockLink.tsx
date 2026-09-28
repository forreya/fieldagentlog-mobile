// The block poster's front door: fieldagentlog.com/b/<block id>.
//
// The block screen itself lives inside the (app) group, whose guard sends a
// signed-out person to /login and forgets where they were going. This route
// sits outside the group so it can remember the block first, then hand over.
// The id is an address, not a credential: the block screen only shows what the
// signed-in account's dashboard already holds.

import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { setPendingBlockId } from "@/lib/pendingLink";

export function BlockLink() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const { state } = useAuth();

	switch (state.status) {
		case "loading":
			// The answer decides where this goes; a moment of nothing beats a
			// bounce through the login screen for someone who is signed in.
			return null;
		case "signed_out":
		case "unconfigured":
			if (id) setPendingBlockId(id);
			return <Redirect href="/login" />;
		case "signed_in":
		case "role_unknown":
			// The (app) guard shows the role_unknown screen itself and keeps this
			// route underneath, so the block opens once the persona resolves.
			if (!id) return <Redirect href="/(app)" />;
			return <Redirect href={{ pathname: "/(app)/block/[id]", params: { id } }} />;
	}
}
