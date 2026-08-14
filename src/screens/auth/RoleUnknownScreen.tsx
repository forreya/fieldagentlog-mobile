import { StyleSheet, Text } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { StatusScreen } from "@/components/StatusScreen";
import { colors, fonts } from "@/theme/tokens";

/**
 * Signed in, but we could not establish which persona this is and have never
 * cached one - a first sign-in with no signal, almost always.
 *
 * Guessing is the one thing not to do here. Treating a failed membership query
 * as "no memberships" would quietly demote a staff member to an external agent
 * and hide their own blocks, which looks like missing data rather than a
 * permissions problem.
 */
export function RoleUnknownScreen() {
	const { retryRole, signOut } = useAuth();

	return (
		<StatusScreen
			title="Couldn't finish signing in"
			body="You're signed in, but we couldn't check what your account has access to. That usually means no connection."
		>
			<Button label="Try again" size="lg" block onPress={() => void retryRole()} />
			<Button label="Sign out" variant="ghostDark" block onPress={() => void signOut()} />
			<Text style={styles.note}>An inspection link still works without an account.</Text>
		</StatusScreen>
	);
}

const styles = StyleSheet.create({
	note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.mutedOnDark, textAlign: "center" },
});
