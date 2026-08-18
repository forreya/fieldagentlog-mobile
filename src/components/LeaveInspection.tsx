// The way out of an inspection that has already started.
//
// Without it the wizard is a one-way street: an inspector who opened the wrong
// link, or who has to leave the building before finishing, has Back to the
// first check and then nothing. The web has had this since C2 and the mobile
// reducer has always supported it - only the control was missing.
//
// It steps back to the intro, not out of the app. The answers are already on
// the device (every verdict is persisted as it is given), so this loses
// nothing, and the confirmation says so - "leave" reads like "discard" to
// anyone who has not been told otherwise.

import { Alert, Pressable, StyleSheet, Text } from "react-native";

import { colors, fonts, space, TAP } from "@/theme/tokens";

export function LeaveInspection({ onLeave }: { onLeave: () => void }) {
	function confirm() {
		Alert.alert("Leave this inspection?", "Your answers so far are saved on this phone and will still be here when you come back.", [
			{ text: "Stay", style: "cancel" },
			{ text: "Leave", style: "destructive", onPress: onLeave },
		]);
	}

	return (
		<Pressable accessibilityRole="button" accessibilityLabel="Leave inspection" onPress={confirm} style={styles.button}>
			<Text style={styles.label}>Leave</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: { minHeight: TAP, justifyContent: "center", paddingHorizontal: space.s2 },
	label: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.mutedOnDark },
});
