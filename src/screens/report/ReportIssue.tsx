import { Image } from "expo-image";

import { goBack } from "@/lib/nav";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { TextField } from "@/components/TextField";
import { REPORT_CATEGORIES, type ReportCategory } from "@/db/types";
import { MAX_NOTE, MAX_PHOTOS } from "@/report/draft";
import { useReportDraft, type ReportDraftView } from "@/report/useReportDraft";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

/**
 * Reporting something that is wrong with a building.
 *
 * Deliberately unbound from the fire checks and from attendance: most of what
 * gets noticed on site - a blown door closer, fly-tipping in the bin store, a
 * leak down the stairwell - is neither a check verdict nor a shift. Forcing it
 * through either would mean the things nobody has a form for go unreported.
 *
 * Sending is persist-then-queue. Someone in a basement taps Send, the report is
 * on the phone, and they walk away. Nothing here waits for a network.
 */
export function ReportIssue({ site, attendanceClientId }: { site: { id: string; name: string }; attendanceClientId?: string | null }) {
	const sync = useSyncStatus();
	const report = useReportDraft(site, attendanceClientId ?? null);

	async function send() {
		if (await report.send()) goBack();
	}

	return (
		<Screen
			title="Report an issue"
			sub={site.name}
			action={<StatusPill {...sync} />}
			scroll={false}
			footer={
				<>
					<Button label="Cancel" variant="ghostDark" onPress={() => goBack()} />
					<Button label="Send" busy={report.busy} onPress={() => void send()} style={styles.grow} />
				</>
			}
		>
			<Body report={report} />
		</Screen>
	);
}

function Body({ report }: { report: ReportDraftView }) {
	const { draft } = report;
	const noteError = report.tried && !draft.note.trim() ? "Please say what the issue is." : null;

	return (
		<ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
			{report.error ? <Banner tone="bad" text={report.error} onDismiss={report.dismissError} /> : null}

			<Text style={styles.label}>WHAT KIND OF ISSUE</Text>
			<Categories selected={draft.category} onSelect={report.setCategory} />

			<TextField
				label="What's wrong"
				value={draft.note}
				onChange={report.setNote}
				placeholder="Where it is and what you saw. The more specific, the faster it gets fixed."
				error={noteError}
				multiline
				maxLength={MAX_NOTE}
			/>

			<Photos report={report} />
		</ScrollView>
	);
}

/** A wrapping grid rather than a segmented control: eight categories will not
 *  fit across a phone, and truncating them to fit makes them unreadable. */
function Categories({ selected, onSelect }: { selected: ReportCategory; onSelect: (value: ReportCategory) => void }) {
	return (
		<View style={styles.categories}>
			{REPORT_CATEGORIES.map((category) => {
				const on = category.value === selected;
				return (
					<Pressable
						key={category.value}
						accessibilityRole="radio"
						accessibilityState={{ selected: on }}
						accessibilityLabel={category.label}
						onPress={() => onSelect(category.value)}
						style={[styles.chip, on && styles.chipOn]}
					>
						<Text style={[styles.chipText, on && styles.chipTextOn]}>{category.label}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

function Photos({ report }: { report: ReportDraftView }) {
	const { photos } = report.draft;

	function choose() {
		const camera = { text: "Take a photo", onPress: () => void report.addPhoto("camera") };
		const library = { text: "Choose from library", onPress: () => void report.addPhoto("library") };
		const cancel = { text: "Cancel", style: "cancel" as const };
		// Android assigns the three buttons by index, not by style, so it gets its
		// own order with the camera in the emphasised slot. Same reasoning as
		// PhotoCapture; see the comment there.
		Alert.alert("Add a photo", undefined, Platform.OS === "android" ? [cancel, library, camera] : [camera, library, cancel]);
	}

	return (
		<View style={styles.photos}>
			<Text style={styles.label}>
				PHOTOS <Text style={styles.optional}>optional, up to {MAX_PHOTOS}</Text>
			</Text>

			{photos.length > 0 ? (
				<View style={styles.thumbs}>
					{photos.map((photo) => (
						<View key={photo.local_id} style={styles.thumb}>
							<Image source={{ uri: photo.file.uri }} style={styles.thumbImage} contentFit="cover" />
							<Pressable
								accessibilityRole="button"
								accessibilityLabel={`Remove photo ${photos.indexOf(photo) + 1}`}
								onPress={() => report.removePhoto(photo.local_id)}
								style={styles.remove}
							>
								<Text style={styles.removeText}>Remove</Text>
							</Pressable>
						</View>
					))}
				</View>
			) : null}

			{report.canAddPhoto ? (
				<Button label={photos.length === 0 ? "Add a photo" : "Add another"} variant="ghost" block onPress={choose} />
			) : (
				<Text style={styles.capped}>That&apos;s the maximum of {MAX_PHOTOS}. Remove one to add another.</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	body: { gap: space.s4, paddingBottom: space.s6 },
	label: { fontFamily: fonts.displayHeavy, fontSize: 12, letterSpacing: 0.8, color: colors.plateMuted },
	optional: { fontFamily: fonts.body, letterSpacing: 0, textTransform: "none" },
	categories: { flexDirection: "row", flexWrap: "wrap", gap: space.s2, marginTop: -space.s2 },
	chip: {
		minHeight: TAP,
		justifyContent: "center",
		paddingHorizontal: space.s3,
		borderRadius: radii.sm,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		backgroundColor: colors.plateRaised,
	},
	chipOn: { backgroundColor: colors.signalTint, borderColor: colors.signal },
	chipText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	chipTextOn: { fontFamily: fonts.displayHeavy, color: colors.signalDeep },
	photos: { gap: space.s2 },
	thumbs: { flexDirection: "row", flexWrap: "wrap", gap: space.s2 },
	thumb: { width: 96, gap: 4 },
	thumbImage: { width: 96, height: 96, borderRadius: radii.sm, backgroundColor: colors.plateEdge },
	remove: { minHeight: 32, justifyContent: "center", alignItems: "center" },
	removeText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fail },
	capped: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.plateMuted },
});
