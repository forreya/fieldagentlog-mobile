import { Redirect, router } from "expo-router";

import { goBack } from "@/lib/nav";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, fonts, space } from "@/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in - for staff, field agents and cleaners.
 *
 * External inspectors never see this: their link is the credential, and the
 * wizard works with no account at all. Anyone who lands here by mistake gets a
 * way back rather than a dead end.
 */
export function LoginScreen() {
	const { state, signIn } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [tried, setTried] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// The guard on (app) keeps signed-out people OUT; nothing was pulling a
	// signed-in one IN, so a successful sign-in sat on this screen doing
	// nothing. Declarative rather than a push inside submit(): the session is
	// adopted asynchronously, and this also covers arriving here already
	// signed in.
	const emailOk = EMAIL_RE.test(email.trim());
	const passwordOk = password.length > 0;

	async function submit() {
		setTried(true);
		setError(null);
		if (!emailOk || !passwordOk || busy) return;

		setBusy(true);
		const result = await signIn(email, password);
		setBusy(false);
		// On success the provider adopts the session and the redirect above
		// fires; only a failure needs handling here.
		if (result.error) setError(result.error);
	}

	if (state.status === "signed_in" || state.status === "role_unknown") return <Redirect href="/(app)" />;

	return (
		<Screen
			title="Sign in"
			sub="Staff, field agents and cleaners"
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => goBack("/")} />
					<Button label="Sign in" busy={busy} onPress={() => void submit()} style={styles.grow} />
				</>
			}
		>
			<Card>
				<Text style={styles.lead}>See the blocks and fire-safety checks due for your visits.</Text>
				<TextField
					label="Email"
					value={email}
					onChange={setEmail}
					placeholder="you@company.co.uk"
					error={tried && !emailOk ? "Please enter a valid email address." : null}
					keyboardType="email-address"
					inputMode="email"
					autoCapitalize="none"
				/>
				<TextField
					label="Password"
					value={password}
					onChange={setPassword}
					placeholder="Your password"
					error={tried && !passwordOk ? "Please enter your password." : null}
					autoCapitalize="none"
					secure
					returnKeyType="go"
					onSubmit={() => void submit()}
				/>
				<FormError message={error} />
			</Card>

			{state.status === "unconfigured" ? <UnconfiguredNote /> : null}
			<InspectorNote />
		</Screen>
	);
}

function FormError({ message }: { message: string | null }) {
	if (!message) return null;
	return (
		<Text accessibilityRole="alert" style={styles.error}>
			{message}
		</Text>
	);
}

/** Only reachable if a build shipped without its config - which happened once,
 *  silently, so it says what is wrong rather than failing at the button. */
function UnconfiguredNote() {
	return (
		<Card>
			<Text style={styles.h}>Signing in isn&apos;t available in this build</Text>
			<Text style={styles.lead}>It was built without the details it needs to reach the server. Visit links still work.</Text>
		</Card>
	);
}

function InspectorNote() {
	return (
		<Card>
			<Text style={styles.h}>Here for an inspection?</Text>
			<Text style={styles.lead}>You don&apos;t need an account. Open the link you were sent, or enter it by hand.</Text>
			<Button label="Enter a visit link" variant="ghost" onPress={() => router.replace("/enter-code")} />
		</Card>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	h: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.plateInk },
	lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
	error: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21, color: colors.fail, marginTop: space.s1 },
});
