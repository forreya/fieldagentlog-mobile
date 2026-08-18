import { goBack } from "@/lib/nav";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { SentReport } from "@/api/report";
import { Button } from "@/components/Button";
import { Note } from "@/components/Note";
import { Screen } from "@/components/Screen";
import { StaleNote } from "@/components/StaleNote";
import { StatusPill } from "@/components/StatusPill";
import { REPORT_CATEGORIES, unsyncedPhotoCount, type PendingReport } from "@/db/types";
import { useReports, type ReportsView } from "@/data/useReports";
import { howLongAgo } from "@/components/VisitHistory";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, radii, space } from "@/theme/tokens";

const LABELS = new Map(REPORT_CATEGORIES.map((c) => [c.value, c.label]));

/**
 * What you have reported.
 *
 * Two lists in one, deliberately: the reports still on this phone come first,
 * because "did it go?" is the question somebody opens this screen to answer.
 * A queued report shown below the sent ones, or not shown at all, reads as lost.
 */
export function SentReports() {
	const sync = useSyncStatus();
	const reports = useReports();

	return (
		<Screen
			title="Your reports"
			sub="Issues you've raised"
			action={<StatusPill {...sync} />}
			scroll={false}
			footer={<Button label="Back" variant="ghostDark" block onPress={() => goBack()} />}
		>
			<Body reports={reports} />
		</Screen>
	);
}

function Body({ reports }: { reports: ReportsView }) {
	const { pending, sent, loading, refreshing, error, refresh } = reports;
	const nothingAtAll = !loading && !error && pending.length === 0 && sent.length === 0;

	return (
		<ScrollView
			contentContainerStyle={styles.list}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.signal} />}
		>
			{/* Local first, and rendered whatever the server is doing. */}
			{pending.map((report) => (
				<PendingRow key={report.local_id} report={report} />
			))}

			{error && sent.length === 0 && pending.length === 0 ? (
				<Note title="Couldn't load your reports" body={error}>
					<Button label="Try again" variant="ghost" onPress={refresh} />
				</Note>
			) : null}
			{error && (sent.length > 0 || pending.length > 0) ? <StaleNote message={error} updatedAt={null} /> : null}

			{loading && pending.length === 0 ? <Note title="Loading your reports" body="This only takes a moment." /> : null}

			{nothingAtAll ? <Note title="Nothing reported yet" body="Anything you report from a site shows up here, with what happened to it." /> : null}

			{sent.map((report) => (
				<SentRow key={report.id} report={report} />
			))}
		</ScrollView>
	);
}

/** Still on the phone. Says so plainly rather than looking like it was sent. */
function PendingRow({ report }: { report: PendingReport }) {
	const photos = report.photos.length;
	const waiting = unsyncedPhotoCount(report);
	const failed = report.sync_error;

	return (
		<View style={[styles.card, failed ? styles.cardFailed : styles.cardPending]}>
			<View style={styles.head}>
				<Text style={styles.site}>{report.site_name}</Text>
				<View style={[styles.tag, failed ? styles.tagFailed : styles.tagPending]}>
					<Text style={[styles.tagText, failed ? styles.tagTextFailed : styles.tagTextPending]}>{failed ? "Not sent" : "Waiting"}</Text>
				</View>
			</View>
			<Text style={styles.meta}>
				{LABELS.get(report.category) ?? report.category}
				{photos > 0 ? ` · ${photos} photo${photos === 1 ? "" : "s"}` : ""} · {howLongAgo(new Date(report.at).toISOString()) ?? "just now"}
			</Text>
			<Text style={styles.note} numberOfLines={3}>
				{report.note}
			</Text>
			<Text style={styles.status}>
				{failed
					? failed.message
					: waiting > 0
						? `Saved on this phone. ${waiting} photo${waiting === 1 ? "" : "s"} still to send.`
						: "Saved on this phone. It goes up when you have signal."}
			</Text>
		</View>
	);
}

function SentRow({ report }: { report: SentReport }) {
	return (
		<View style={styles.card}>
			<View style={styles.head}>
				<Text style={styles.site}>{report.block_name}</Text>
				<View style={styles.tag}>
					<Text style={styles.tagText}>{report.status}</Text>
				</View>
			</View>
			<Text style={styles.meta}>
				{LABELS.get(report.category) ?? report.category}
				{report.photo_count > 0 ? ` · ${report.photo_count} photo${report.photo_count === 1 ? "" : "s"}` : ""} ·{" "}
				{howLongAgo(report.reported_at) ?? "just now"}
			</Text>
			<Text style={styles.note} numberOfLines={3}>
				{report.note}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: space.s3, paddingBottom: space.s6 },
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s2,
	},
	cardPending: { borderLeftWidth: 4, borderLeftColor: colors.signal },
	cardFailed: { borderLeftWidth: 4, borderLeftColor: colors.fail },
	head: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
	site: { flex: 1, fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.plateInk },
	tag: { paddingVertical: 3, paddingHorizontal: space.s2, borderRadius: radii.sm, backgroundColor: colors.naTint },
	tagPending: { backgroundColor: colors.signalTint },
	tagFailed: { backgroundColor: colors.failTint },
	tagText: { fontFamily: fonts.displayHeavy, fontSize: 11, textTransform: "capitalize", color: colors.plateMuted },
	tagTextPending: { color: colors.signalDeep },
	tagTextFailed: { color: colors.fail },
	meta: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	note: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateInk },
	status: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.plateMuted },
});
