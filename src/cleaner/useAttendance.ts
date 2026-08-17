// Being on site: starting a visit, ending it, and what to show while it runs.
//
// The order is persist, then sync, never the other way round. A cleaner
// standing in a basement taps "Check in" and the timer starts immediately; the
// network is a later problem the queue owns. Nothing here awaits a request
// before updating the screen.
//
// The one thing that does block is the GPS fix. A check-in with no position is
// not an attendance record - it is a claim - so a failed fix stops the check-in
// and says why, rather than recording something the managing agent cannot rely
// on.

import { useCallback, useEffect, useState } from "react";

import { allAttendance, saveAttendance } from "@/db/attendance";
import type { AttendanceSession, GeoPoint } from "@/db/types";
import { uuid } from "@/lib/id";
import { captureFix, fixMessage } from "@/lib/position";
import { syncEngine } from "@/sync/engine";

export interface AttendanceView {
	/** The session in progress, or null when not on site. */
	active: AttendanceSession | null;
	/** The last one closed on this device, for the "checked out" banner. */
	justClosed: AttendanceSession | null;
	busy: boolean;
	/** A fix that could not be taken, or a write that failed. */
	error: string | null;
	checkIn: (siteId: string, siteName: string) => Promise<void>;
	checkOut: () => Promise<void>;
	dismissError: () => void;
	dismissClosed: () => void;
}

/** The open session among what the device holds, if any. */
export function openSession(sessions: AttendanceSession[]): AttendanceSession | null {
	return sessions.find((s) => s.check_out === null) ?? null;
}

/**
 * A session survives a force-stop, so the screen asks the database rather than
 * assuming it starts empty. Someone who checked in this morning and then killed
 * the app is still on site, and the phone is the only thing that knows.
 */
function useRestoreOpenSession(setActive: (session: AttendanceSession | null) => void): void {
	useEffect(() => {
		let cancelled = false;
		void allAttendance().then((sessions) => {
			if (!cancelled) setActive(openSession(sessions));
		});
		return () => {
			cancelled = true;
		};
	}, [setActive]);
}

/**
 * Re-read the device's own record whenever the queue reports anything.
 *
 * Without this the on-site card keeps saying "Saved on this phone" long after
 * the check-in reached the server: the queue updates the database row, and the
 * screen is holding a copy from before that happened. Telling a cleaner their
 * attendance is stuck when it is not is exactly the wrong way round - they are
 * the one person who would act on it.
 *
 * Every notification, rather than only on a syncing→idle edge. The read is a
 * single indexed SQLite query and the engine is not chatty; tracking edges
 * bought nothing except a state machine that could get stuck on the wrong side.
 */
function useFollowSync(
	setActive: (session: AttendanceSession | null) => void,
	setJustClosed: (update: (previous: AttendanceSession | null) => AttendanceSession | null) => void,
): void {
	useEffect(
		() =>
			syncEngine.subscribe(() => {
				void allAttendance().then((sessions) => {
					setActive(openSession(sessions));
					// The closed one is deleted by the queue once both ends land, so
					// its absence is what proves it is fully up.
					setJustClosed((previous) => {
						if (!previous) return previous;
						return sessions.find((s) => s.local_id === previous.local_id) ?? { ...previous, synced_in: true, synced_out: true };
					});
				});
			}),
		[setActive, setJustClosed],
	);
}

function newSession(siteId: string, siteName: string, email: string | null, point: GeoPoint): AttendanceSession {
	return {
		local_id: uuid(),
		site_id: siteId,
		site_name: siteName,
		cleaner_email: email,
		check_in: point,
		check_out: null,
		server_id: null,
		synced_in: false,
		synced_out: false,
	};
}

export function useAttendance(email: string | null): AttendanceView {
	const [active, setActive] = useState<AttendanceSession | null>(null);
	const [justClosed, setJustClosed] = useState<AttendanceSession | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useRestoreOpenSession(setActive);
	useFollowSync(setActive, setJustClosed);

	const fix = useCallback(async (): Promise<GeoPoint | null> => {
		const outcome = await captureFix();
		if (outcome.status === "ok") return outcome.fix;
		setError(fixMessage(outcome));
		return null;
	}, []);

	const startVisit = useCallback(
		async (siteId: string, siteName: string) => {
			if (busy || active) return;
			setBusy(true);
			setError(null);
			try {
				const point = await fix();
				if (!point) return;

				const session = newSession(siteId, siteName, email, point);
				await saveAttendance(session);
				setActive(session);
				// Fire and forget: the timer is already running on screen and the
				// engine retries on its own triggers if this pass finds no signal.
				void syncEngine.sync("check-in");
			} finally {
				setBusy(false);
			}
		},
		[active, busy, email, fix],
	);

	const endVisit = useCallback(async () => {
		if (busy || !active) return;
		setBusy(true);
		setError(null);
		try {
			const point = await fix();
			if (!point) return;

			const closed: AttendanceSession = { ...active, check_out: point };
			await saveAttendance(closed);
			setActive(null);
			setJustClosed(closed);
			void syncEngine.sync("check-out");
		} finally {
			setBusy(false);
		}
	}, [active, busy, fix]);

	return {
		active,
		justClosed,
		busy,
		error,
		checkIn: startVisit,
		checkOut: endVisit,
		dismissError: useCallback(() => setError(null), []),
		dismissClosed: useCallback(() => setJustClosed(null), []),
	};
}
