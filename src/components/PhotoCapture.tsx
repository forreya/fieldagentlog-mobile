import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import type { CheckResult } from "@/db/types";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";
import { capturePhoto, deniedMessage, type CaptureSource } from "@/visit/photos";

interface Props {
	token: string;
	checkId: string;
	result: CheckResult;
	onCaptured: (localId: string) => void;
	onCleared: () => void;
}

/**
 * Add, replace or remove the photo on a failed check.
 *
 * A photo that has not uploaded yet is not an error state and is not shown as
 * one: the inspector is very often underground, and "Saved on this phone" is
 * the truth. The upload happens whenever signal returns.
 */
export function PhotoCapture({ token, checkId, result, onCaptured, onCleared }: Props) {
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState<string | null>(null);
	const has = Boolean(result.photo_local_id || result.photo_ref);

	async function add(source: CaptureSource) {
		if (busy) return;
		setBusy(true);
		const outcome = await capturePhoto(token, checkId, source);
		setBusy(false);

		switch (outcome.status) {
			case "captured":
				setPreview(outcome.file.uri);
				onCaptured(outcome.localId);
				return;
			case "denied":
				Alert.alert("Permission needed", deniedMessage(outcome.source));
				return;
			case "failed":
				Alert.alert("Couldn't add that photo", outcome.message);
				return;
			case "cancelled":
				return;
		}
	}

	function choose() {
		const camera = { text: "Take a photo", onPress: () => void add("camera") };
		const library = { text: "Choose from library", onPress: () => void add("library") };
		const cancel = { text: "Cancel", style: "cancel" as const };
		// Android maps a three-button alert to slots by index, not by style:
		// [0] is the neutral button on the left, [2] the emphasised one on the
		// right. In iOS order that puts Cancel under the thumb of anyone who taps
		// the right-hand button by habit, so Android gets its own order with the
		// camera - the thing an inspector standing at a fault actually wants - in
		// the emphasised slot. iOS honours `style: "cancel"` and needs no help.
		Alert.alert("Add a photo", undefined, Platform.OS === "android" ? [cancel, library, camera] : [camera, library, cancel]);
	}

	if (busy) return <Busy />;
	if (!has) return <AddButton onPress={choose} />;

	return (
		<Attached
			preview={preview}
			uploaded={Boolean(result.photo_ref)}
			onReplace={choose}
			onRemove={() => {
				setPreview(null);
				onCleared();
			}}
		/>
	);
}

function Busy() {
	return (
		<View style={styles.busy} accessibilityRole="progressbar" accessibilityLabel="Adding photo">
			<ActivityIndicator color={colors.signal} />
			<Text style={styles.hint}>Preparing photo...</Text>
		</View>
	);
}

function AddButton({ onPress }: { onPress: () => void }) {
	return (
		<Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={onPress} style={styles.add}>
			<Text style={styles.addLabel}>Add a photo</Text>
			<Text style={styles.hint}>Optional</Text>
		</Pressable>
	);
}

function Attached({
	preview,
	uploaded,
	onReplace,
	onRemove,
}: {
	preview: string | null;
	uploaded: boolean;
	onReplace: () => void;
	onRemove: () => void;
}) {
	return (
		<View style={styles.row}>
			{preview ? <Image source={{ uri: preview }} style={styles.thumb} contentFit="cover" accessibilityLabel="Photo of the fault" /> : null}
			<View style={styles.actions}>
				{/* Not-yet-uploaded is not an error: the inspector is usually
				    underground, and "saved on this phone" is simply the truth. */}
				<Text style={styles.state}>{uploaded ? "Uploaded" : "Saved on this phone"}</Text>
				<View style={styles.buttons}>
					<Pressable accessibilityRole="button" accessibilityLabel="Replace photo" onPress={onReplace} style={styles.small}>
						<Text style={styles.smallLabel}>Replace</Text>
					</Pressable>
					<Pressable accessibilityRole="button" accessibilityLabel="Remove photo" onPress={onRemove} style={styles.small}>
						<Text style={[styles.smallLabel, styles.remove]}>Remove</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	add: {
		minHeight: TAP,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 2,
		borderStyle: "dashed",
		borderColor: colors.plateEdgeStrong,
		borderRadius: radii.md,
		padding: space.s3,
		gap: 2,
	},
	addLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.signalDeep },
	busy: { minHeight: TAP, alignItems: "center", justifyContent: "center", gap: space.s2 },
	row: { flexDirection: "row", gap: space.s3, alignItems: "center" },
	thumb: { width: 76, height: 76, borderRadius: radii.sm, backgroundColor: colors.plate },
	actions: { flex: 1, gap: space.s2 },
	state: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.plateInk },
	buttons: { flexDirection: "row", gap: space.s3 },
	small: { minHeight: 40, justifyContent: "center", paddingRight: space.s2 },
	smallLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.signalDeep },
	remove: { color: colors.fail },
	hint: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
