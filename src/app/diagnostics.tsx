// What the app thinks is true, on one screen.
//
// This replaces the throwaway probe screens used to verify each phase against a
// real device. Those proved a point and were deleted; this one stays, because
// the questions it answers - which backend, what is queued, is the database the
// version we expect - are exactly what gets asked down a phone when something
// is wrong on site. Phase D2 builds the user-facing About screen on top of it.

import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { allAttendance } from "@/db/attendance";
import { getDatabase, LATEST_VERSION } from "@/db/database";
import { storeUsageBytes } from "@/db/photoStore";
import { allReports } from "@/db/reports";
import { backendSummary } from "@/lib/config";
import { syncEngine, type SyncState } from "@/sync/engine";
import { pillState } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

interface Snapshot {
	backend: string;
	dbVersion: string;
	journalMode: string;
	attendance: number;
	reports: number;
	photoBytes: number;
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
		attendance: (await allAttendance()).length,
		reports: (await allReports()).length,
		photoBytes: storeUsageBytes(),
	};
}

export default function Diagnostics() {
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
			footer={<Button label="Back" variant="ghostDark" onPress={() => router.back()} />}
		>
			<Card>
				<Text style={styles.heading}>Backend</Text>
				<Row label="Supabase" value={snapshot?.backend ?? "..."} />
				<Row label="Database version" value={`${snapshot?.dbVersion ?? "..."} (expected ${LATEST_VERSION})`} />
				<Row label="Journal mode" value={snapshot?.journalMode ?? "..."} />
			</Card>

			<Card>
				<Text style={styles.heading}>Queues</Text>
				<Row label="Waiting to sync" value={String(sync.pending)} />
				<Row label="Attendance held" value={String(snapshot?.attendance ?? 0)} />
				<Row label="Reports held" value={String(snapshot?.reports ?? 0)} />
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
