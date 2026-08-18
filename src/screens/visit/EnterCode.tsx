// The way in when the link itself will not open the app.
//
// It should be rare - a dispatched link opens the app directly - but the cases
// it covers are not: the app was installed after the message arrived, the link
// was forwarded into an app that strips them, the phone is a work handset with
// a locked-down browser, or the association files are not live yet. None of
// those are the inspector's fault and all of them leave them standing outside a
// building, so there has to be a way to type it in.

import { router } from "expo-router";

import { goBack } from "@/lib/nav";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { parseToken } from "@/lib/token";
import { colors, fonts, space } from "@/theme/tokens";

export function EnterCode() {
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);

	function open() {
		const token = parseToken(value);
		if (!token) {
			setError("That doesn't look like a visit link. Paste the whole link from your message, or type the code exactly.");
			return;
		}
		// Replaced, not pushed: Back from a visit should leave the app the way
		// arriving by link does, not drop the inspector on this screen again.
		router.replace({ pathname: "/v/[token]", params: { token } });
	}

	return (
		<Screen
			title="Open a visit"
			sub="Paste the link you were sent"
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => goBack("/")} />
					<Button label="Open visit" disabled={!value.trim()} onPress={open} style={styles.grow} />
				</>
			}
		>
			<Card>
				<TextField
					label="Visit link or code"
					value={value}
					onChange={(next) => {
						setValue(next);
						if (error) setError(null);
					}}
					placeholder="fieldagentlog.com/v/..."
					error={error}
					multiline
					mono
					inputMode="url"
					autoCapitalize="none"
					returnKeyType="go"
					onSubmit={open}
				/>
			</Card>

			<Help />
		</Screen>
	);
}

function Help() {
	return (
		<View style={styles.help}>
			<Text style={styles.helpTitle}>Where to find it</Text>
			<Text style={styles.helpBody}>
				It arrives by text or email when a visit is booked, and looks like fieldagentlog.com/v/ followed by a long code. Copy the whole thing.
			</Text>
			<Text style={styles.helpBody}>
				No link? Whoever booked the visit can send a new one. Links stop working after 14 days, and once a visit has been submitted.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	help: { gap: space.s2 },
	helpTitle: { fontFamily: fonts.displayHeavy, fontSize: 16, color: colors.plateInk },
	helpBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateMuted },
});
