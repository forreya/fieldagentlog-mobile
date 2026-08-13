// The device database: four offline queues that must survive a no-signal site,
// an app kill, and a phone reboot.
//
// Storage strategy, per table:
//   - Rows that are only ever fetched whole are stored as JSON in one column.
//     Adding a field to a record then needs no migration, which matters because
//     the alternative is a schema change shipped to phones already holding
//     un-synced work.
//   - Columns are used where we actually query: photos are filtered by token
//     and by "not yet uploaded", so those are real, indexed columns.
//
// Migrations run from PRAGMA user_version, forwards only. A phone can be on any
// older build, so every migration must apply to a database with real data in
// it - never assume an empty one.

import * as SQLite from "expo-sqlite";

const DB_NAME = "fieldagentlog.db";

/**
 * Ordered, append-only. Never edit a shipped migration: a phone that already
 * ran it will not run it again, and the two devices would diverge.
 */
export const MIGRATIONS: { version: number; sql: string }[] = [
	{
		version: 1,
		sql: `
			CREATE TABLE IF NOT EXISTS visits (
				token      TEXT PRIMARY KEY NOT NULL,
				record     TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS photos (
				local_id     TEXT PRIMARY KEY NOT NULL,
				token        TEXT NOT NULL,
				check_id     TEXT NOT NULL,
				file_uri     TEXT NOT NULL,
				file_name    TEXT NOT NULL,
				content_type TEXT NOT NULL,
				ref          TEXT,
				created_at   INTEGER NOT NULL
			);
			-- The hot read: "what still needs uploading for this visit?"
			CREATE INDEX IF NOT EXISTS photos_pending_idx ON photos (token) WHERE ref IS NULL;

			CREATE TABLE IF NOT EXISTS attendance (
				local_id   TEXT PRIMARY KEY NOT NULL,
				record     TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);

			CREATE TABLE IF NOT EXISTS reports (
				local_id   TEXT PRIMARY KEY NOT NULL,
				record     TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`,
	},
];

export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

type Database = SQLite.SQLiteDatabase;

let connection: Promise<Database> | null = null;

/** Apply every migration newer than the database's current version. */
export async function migrate(db: Database): Promise<number> {
	const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
	let version = row?.user_version ?? 0;

	for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
		if (migration.version <= version) continue;
		await db.execAsync(migration.sql);
		// PRAGMA will not take a bound parameter, and the value is ours, not input.
		await db.execAsync(`PRAGMA user_version = ${migration.version}`);
		version = migration.version;
	}
	return version;
}

/** The shared connection, opened and migrated once. */
export function getDatabase(): Promise<Database> {
	if (!connection) {
		connection = (async () => {
			const db = await SQLite.openDatabaseAsync(DB_NAME);
			// Write-ahead logging: a crash mid-write must not cost the queue.
			await db.execAsync("PRAGMA journal_mode = WAL");
			await migrate(db);
			return db;
		})().catch((err) => {
			// Do not cache a failed open, or the app is broken until it restarts.
			connection = null;
			throw err;
		});
	}
	return connection;
}

/** Test seam: drop the cached connection so the next call opens afresh. */
export function resetDatabase(): void {
	connection = null;
}
