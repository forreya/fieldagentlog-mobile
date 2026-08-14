// The guard around everything that needs an account.
//
// Deliberately a whole route group rather than a check per screen: a screen
// that forgets the check is a data leak, and there will be a dozen of them by
// Milestone F. Nothing the external inspector uses lives in here - the wizard,
// the code entry and the public landing all sit outside, signed out.

import { Redirect, Stack } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "@/components/StatusScreen";
import { RoleUnknownScreen } from "@/screens/auth/RoleUnknownScreen";

export default function SignedInLayout() {
	const { state } = useAuth();

	switch (state.status) {
		case "loading":
			// Never render a signed-in screen before the answer is known: a flash
			// of someone else's dashboard is worse than a moment of nothing.
			return <LoadingScreen />;
		case "signed_out":
		case "unconfigured":
			return <Redirect href="/login" />;
		case "role_unknown":
			return <RoleUnknownScreen />;
		case "signed_in":
			return <Stack screenOptions={{ headerShown: false }} />;
	}
}
