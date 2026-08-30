// What the app thinks is true, on one screen.
//
// This replaces the throwaway probe screens used to verify each phase against a
// real device. Those proved a point and were deleted; this one stays, because
// the questions it answers - which backend, what is queued, is the database the
// version we expect - are exactly what gets asked down a phone when something
// is wrong on site. Phase D2 builds the user-facing About screen on top of it.

import { goBack } from "@/lib/nav";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { allAttendance } from "@/db/attendance";
import type { AttendanceSession } from "@/db/types";
import { getDatabase, LATEST_VERSION } from "@/db/database";
import { storeUsageBytes } from "@/db/photoStore";
import { allReports } from "@/db/reports";
import { updateLabel, useUpdateState } from "@/lib/updates";
import { backendSummary } from "@/lib/config";
import { BUILD_COMMIT, versionLabel } from "@/lib/version";
import { syncEngine, type SyncState } from "@/sync/engine";
import { ownedByQueueOwner } from "@/sync/owner";
import { pillState } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

interface Snapshot {
	backend: string;
	dbVersion: string;
	journalMode: string;
	attendance: string;
	reports: string;
	photoBytes: number;
}

/** One queue's rows, described by state rather than lumped into a count.
 *  "Waiting" sends itself, "needs attention" will not move without a person,
 *  and "another account's" is held for whoever captured it - three different
 *  answers to the support question this screen exists for. Counts only;
 *  nothing here exposes another account's content. */
export function describeQueue<T extends { sync_error?: unknown; owner_user_id?: string | null }>(rows: T[], owes: (row: T) => boolean): string {
	let waiting = 0;
	let attention = 0;
	let held = 0;
	for (const row of rows) {
		if (!ownedByQueueOwner(row.owner_user_id)) held += 1;
		else if (row.sync_error) attention += 1;
		else if (owes(row)) waiting += 1;
	}
	const parts = [`${waiting} waiting`, `${attention} ${attention === 1 ? "needs" : "need"} attention`];
	if (held > 0) parts.push(`${held} another account's`);
	return parts.join(" · ");
}

/** Whether a session still owes the server an end. Mirrors the sync source's
 *  rule minus ownership and failure, which describeQueue judges itself. */
function attendanceOwes(session: AttendanceSession): boolean {
	return !session.synced_in || (session.check_out !== null && !session.synced_out);
}

async function readSnapshot(): Promise<Snapshot> {
	let dbVersion = "unavailable";
	let journalMode = "unavailable";
	try {
		const db = await getDatabase();
		dbVersion = String((await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"))?.user_version ?? "?");
		journalMode = (await db.getFirstAsync<{ journal_mode: string }>("PRAGMA journal_mode"))?.journal_mode ?? "?";
	} catch {
		/* leave as unavailable - this screen must render even when storage will not open */
	}
	return {
		backend: backendSummary(),
		dbVersion,
		journalMode,
		attendance: describeQueue(await allAttendance(), attendanceOwes),
		reports: describeQueue(await allReports(), () => true),
		photoBytes: storeUsageBytes(),
	};
}

export function DiagnosticsScreen() {
	const update = useUpdateState();
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [sync, setSync] = useState<SyncState>(syncEngine.getState());

	const refresh = useCallback(() => {
		void readSnapshot().then(setSnapshot);
	}, []);

	useEffect(() => {
		refresh();
		return syncEngine.subscribe(setSync);
	}, [refresh]);

	return (
		<Screen
			title="Diagnostics"
			sub="What the app thinks is true"
			action={<StatusPill {...pillState(sync)} />}
			footer={<Button label="Back" variant="ghostDark" onPress={() => goBack("/")} />}
		>
			<Card>
				<Text style={styles.heading}>This build</Text>
				<Row label="Version" value={`${versionLabel()}${BUILD_COMMIT ? "" : " (unstamped)"}`} />
				{/* "Have you got the fix yet?" is asked down a phone line, and until
				    now nothing on the phone could answer it. */}
				<Row label="Updates" value={updateLabel(update)} />
				{/* Static by decision (2026-08-20): no crash reporting, ever. The row
				    stays so the answer down a phone line is "none", not a shrug. */}
				<Row label="Crash reports" value="none" />
				<Row label="Supabase" value={snapshot?.backend ?? "..."} />
				<Row label="Database version" value={`${snapshot?.dbVersion ?? "..."} (expected ${LATEST_VERSION})`} />
				<Row label="Journal mode" value={snapshot?.journalMode ?? "..."} />
			</Card>

			<Card>
				<Text style={styles.heading}>Queues</Text>
				<Row label="Waiting to sync" value={String(sync.pending)} />
				<Row label="Attendance" value={snapshot?.attendance ?? "..."} />
				<Row label="Reports" value={snapshot?.reports ?? "..."} />
				<Row label="Photos on disk" value={`${Math.round((snapshot?.photoBytes ?? 0) / 1024)} KB`} />
			</Card>

			<Card>
				<Text style={styles.heading}>Sync</Text>
				<Row label="Status" value={sync.status} />
				<Row label="Connection" value={sync.online ? "online" : "offline"} />
				<Row label="Consecutive failures" value={String(sync.failures)} />
				<Row label="Last error" value={sync.lastError ?? "none"} />
				<View style={styles.actions}>
					<Button
						label="Sync now"
						size="sm"
						onPress={() => {
							void syncEngine.sync("diagnostics").then(refresh);
						}}
					/>
					<Button label="Refresh" size="sm" variant="ghost" onPress={refresh} />
				</View>
			</Card>
		</Screen>
	);
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.row}>
			<Text style={styles.label}>{label}</Text>
			<Text style={styles.value} numberOfLines={2}>
				{value}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	heading: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.plateMuted },
	row: { flexDirection: "row", justifyContent: "space-between", gap: space.s4 },
	label: { fontFamily: fonts.body, fontSize: 14, color: colors.plateMuted },
	value: { fontFamily: fonts.mono, fontSize: 13, color: colors.plateInk, flexShrink: 1, textAlign: "right" },
	actions: { flexDirection: "row", gap: space.s2, marginTop: space.s2 },
});
