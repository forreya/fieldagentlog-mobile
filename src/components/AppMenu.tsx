// The app bar's overflow menu.
//
// Sign out used to sit in the footer of every signed-in screen, which is the
// most reachable place on a phone given to the rarest action - while About and
// Your reports had nowhere to live at all. They share a menu now, and the
// footer belongs to whatever that screen is actually for.
//
// A Modal rather than an absolutely-positioned panel: a bare overlay inside the
// app bar is clipped by it on Android, and only a Modal reliably sits above a
// scrolling list on both platforms.

import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

/** How far down the panel hangs from the top of the screen.
 *
 * It deliberately overlaps the app bar it was opened from, the way a native
 * overflow menu does on both platforms - the alternative, anchoring to the
 * measured button, was tried and is more machinery than a transient menu over a
 * dimmed backdrop is worth. */
const PANEL_TOP = 96;

export function AppMenu() {
	const { signOut } = useAuth();
	const [open, setOpen] = useState(false);

	const pick = (go: () => void) => () => {
		setOpen(false);
		go();
	};

	return (
		<>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Menu"
				accessibilityState={{ expanded: open }}
				onPress={() => setOpen(true)}
				style={styles.kebab}
			>
				<Text style={styles.dots}>•••</Text>
			</Pressable>

			<Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
				{/* The backdrop is the way out. Without it the only way to dismiss on
				    Android is the back gesture, and on iOS there is none at all. */}
				<Pressable accessibilityRole="button" accessibilityLabel="Close menu" style={styles.backdrop} onPress={() => setOpen(false)}>
					<View style={styles.panel}>
						<Item label="Your reports" onPress={pick(() => router.push("/(app)/reports"))} />
						<Item label="About" onPress={pick(() => router.push("/about"))} />
						<Item label="Sign out" onPress={pick(() => void signOut())} />
					</View>
				</Pressable>
			</Modal>
		</>
	);
}

function Item({ label, onPress }: { label: string; onPress: () => void }) {
	return (
		<Pressable accessibilityRole="menuitem" accessibilityLabel={label} onPress={onPress} style={styles.item}>
			<Text style={styles.itemText}>{label}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	kebab: { minWidth: TAP, minHeight: TAP, alignItems: "center", justifyContent: "center" },
	dots: { fontFamily: fonts.displayHeavy, fontSize: 15, letterSpacing: 1, color: colors.textOnDark },
	// Top-right, under the bar: the panel should read as belonging to the button
	// that opened it rather than as a sheet from nowhere.
	backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
	panel: {
		position: "absolute",
		top: PANEL_TOP,
		right: space.s4,
		minWidth: 200,
		backgroundColor: colors.plateRaised,
		borderRadius: radii.md,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		paddingVertical: space.s2,
	},
	item: { minHeight: TAP, justifyContent: "center", paddingHorizontal: space.s4 },
	itemText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.plateInk },
});
