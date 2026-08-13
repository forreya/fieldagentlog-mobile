// expo-sqlite backed by Node's own SQLite, so the DAO tests run against real
// SQL: real migrations, real PRAGMA user_version, real INSERT OR REPLACE, real
// partial indexes. A hand-written fake would pass whatever the DAO happened to
// do, including things SQLite would reject.
//
// Each openDatabaseAsync(name) returns a per-name in-memory database, so a test
// can reopen "the same database" to check migration-on-existing-data.

import { DatabaseSync } from "node:sqlite";

type Params = unknown[];

const open = new Map<string, DatabaseSync>();

/** Accepts expo's (sql, ...params) and (sql, paramsArray) call styles. */
function flatten(params: Params): unknown[] {
	if (params.length === 1 && Array.isArray(params[0])) return params[0] as unknown[];
	return params;
}

class MockDatabase {
	constructor(private readonly db: DatabaseSync) {}

	async execAsync(sql: string): Promise<void> {
		this.db.exec(sql);
	}

	async runAsync(sql: string, ...params: Params): Promise<{ lastInsertRowId: number; changes: number }> {
		const result = this.db.prepare(sql).run(...(flatten(params) as never[]));
		return { lastInsertRowId: Number(result.lastInsertRowid ?? 0), changes: Number(result.changes ?? 0) };
	}

	async getFirstAsync<T>(sql: string, ...params: Params): Promise<T | null> {
		return (this.db.prepare(sql).get(...(flatten(params) as never[])) as T) ?? null;
	}

	async getAllAsync<T>(sql: string, ...params: Params): Promise<T[]> {
		return this.db.prepare(sql).all(...(flatten(params) as never[])) as T[];
	}

	async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
		this.db.exec("BEGIN");
		try {
			await fn();
			this.db.exec("COMMIT");
		} catch (err) {
			this.db.exec("ROLLBACK");
			throw err;
		}
	}

	async closeAsync(): Promise<void> {
		/* left open so a test can reopen the same named database */
	}
}

export async function openDatabaseAsync(name: string): Promise<MockDatabase> {
	let db = open.get(name);
	if (!db) {
		db = new DatabaseSync(":memory:");
		open.set(name, db);
	}
	return new MockDatabase(db);
}

/** Test helper: throw away every database, so the next open starts empty. */
export function __resetAllDatabases(): void {
	for (const db of open.values()) db.close();
	open.clear();
}
