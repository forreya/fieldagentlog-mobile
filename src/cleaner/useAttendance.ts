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

import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { startFireChecks } from "@/api/cleaner";
import { failureMessage } from "@/data/failureMessage";
import { allAttendance, saveAttendance } from "@/db/attendance";
import type { AttendanceSession, GeoPoint } from "@/db/types";
import { uuid } from "@/lib/id";
import { captureFix, fixMessage } from "@/lib/position";
import { syncEngine } from "@/sync/engine";
import { visibleToUser } from "@/sync/owner";

import { markHandoff } from "./handoff";

/** Who the screen is working for. The id goes on every session it creates. */
export interface AttendanceOwner {
	id: string;
	email: string | null;
}

export interface AttendanceView {
	/** The session in progress, or null when not on site. */
	active: AttendanceSession | null;
	/** The last one closed on this device, for the "checked out" banner. */
	justClosed: AttendanceSession | null;
	/** Checking in or out is in flight. */
	busy: boolean;
	/** Handing off to the wizard is in flight. Separate from `busy` on purpose:
	 *  minting a visit needs the server, so with no signal it sits there for the
	 *  full request timeout. Sharing one flag meant a cleaner who tapped "Start
	 *  checks" underground could not check out and leave for twenty seconds. */
	startingChecks: boolean;
	/** A fix that could not be taken, or a write that failed. */
	error: string | null;
	checkIn: (siteId: string, siteName: string) => Promise<void>;
	checkOut: () => Promise<void>;
	/** Hand off into the inspection wizard for this site's due checks. */
	startChecks: () => Promise<void>;
	dismissError: () => void;
	dismissClosed: () => void;
}

/** The open session among what the device holds, if any.
 *
 *  Another account's open session is invisible here: showing it would leak
 *  their whereabouts, and "checking out" of it would send a check-out the
 *  broker refuses as not-your-session. A session with no recorded owner
 *  predates ownership and stays visible, as it always was. */
export function openSession(sessions: AttendanceSession[], ownerId: string | null): AttendanceSession | null {
	return sessions.find((s) => s.check_out === null && visibleToUser(s.owner_user_id, ownerId)) ?? null;
}

/**
 * A session survives a force-stop, so the screen asks the database rather than
 * assuming it starts empty. Someone who checked in this morning and then killed
 * the app is still on site, and the phone is the only thing that knows.
 */
function useRestoreOpenSession(setActive: (session: AttendanceSession | null) => void, ownerId: string | null): void {
	useEffect(() => {
		let cancelled = false;
		void allAttendance().then((sessions) => {
			if (!cancelled) setActive(openSession(sessions, ownerId));
		});
		return () => {
			cancelled = true;
		};
	}, [setActive, ownerId]);
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
	ownerId: string | null,
): void {
	useEffect(
		() =>
			syncEngine.subscribe(() => {
				void allAttendance().then((sessions) => {
					setActive(openSession(sessions, ownerId));
					// The closed one is deleted by the queue once both ends land, so
					// its absence is what proves it is fully up.
					setJustClosed((previous) => {
						if (!previous) return previous;
						return sessions.find((s) => s.local_id === previous.local_id) ?? { ...previous, synced_in: true, synced_out: true };
					});
				});
			}),
		[setActive, setJustClosed, ownerId],
	);
}

function newSession(siteId: string, siteName: string, owner: AttendanceOwner, point: GeoPoint): AttendanceSession {
	return {
		local_id: uuid(),
		site_id: siteId,
		site_name: siteName,
		cleaner_email: owner.email,
		check_in: point,
		check_out: null,
		server_id: null,
		synced_in: false,
		synced_out: false,
		// Stamped at capture: this shift may outlive the session that started
		// it, and it must only ever go up as this person.
		owner_user_id: owner.id,
	};
}

/**
 * Mint the checks visit and go there.
 *
 * The attendance id links the fire visit to the cleaning visit it happened
 * during. Passed best-effort: a check-in still sitting in the queue has no
 * server row to link to yet, and the broker leaves it unlinked rather than
 * refusing - the checks matter more than the link.
 */
async function handOffToWizard(session: AttendanceSession): Promise<void> {
	const token = await startFireChecks(session.site_id, session.local_id);
	// Marked BEFORE navigating. If the app dies on the way, the wizard still
	// knows where this person came from when it comes back up.
	await markHandoff({ token, siteName: session.site_name });
	// Pushed, not replaced: the session is still running underneath, and coming
	// back to it is the expected end of this trip.
	router.push({ pathname: "/v/[token]", params: { token } });
}

/** Handing off is its own small state machine, and lifting it keeps the hook
 *  below the size budget without hiding anything. */
function useStartChecks(
	active: AttendanceSession | null,
	setError: (value: string | null) => void,
): { startChecks: () => Promise<void>; startingChecks: boolean } {
	const [startingChecks, setStarting] = useState(false);

	const startChecks = useCallback(async () => {
		if (startingChecks || !active) return;
		setStarting(true);
		setError(null);
		try {
			await handOffToWizard(active);
		} catch (err) {
			setError(failureMessage(err, "Couldn't start the checks. Try again in a moment."));
		} finally {
			setStarting(false);
		}
	}, [active, startingChecks, setError]);

	return { startChecks, startingChecks };
}

interface EndVisitDeps {
	active: AttendanceSession | null;
	busy: boolean;
	fix: () => Promise<GeoPoint | null>;
	setActive: (session: AttendanceSession | null) => void;
	setBusy: (value: boolean) => void;
	setError: (value: string | null) => void;
	setJustClosed: (session: AttendanceSession | null) => void;
}

/** Leaving site. Lifted out of the hook for the size budget; the shape mirrors
 *  useStartChecks so the three actions read alike. */
function useEndVisit({ active, busy, fix, setActive, setBusy, setError, setJustClosed }: EndVisitDeps): () => Promise<void> {
	return useCallback(async () => {
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
	}, [active, busy, fix, setActive, setBusy, setError, setJustClosed]);
}

export function useAttendance(owner: AttendanceOwner | null): AttendanceView {
	const [active, setActive] = useState<AttendanceSession | null>(null);
	const [justClosed, setJustClosed] = useState<AttendanceSession | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ownerId = owner?.id ?? null;

	useRestoreOpenSession(setActive, ownerId);
	useFollowSync(setActive, setJustClosed, ownerId);

	const fix = useCallback(async (): Promise<GeoPoint | null> => {
		const outcome = await captureFix();
		if (outcome.status === "ok") return outcome.fix;
		setError(fixMessage(outcome));
		return null;
	}, []);

	const startVisit = useCallback(
		async (siteId: string, siteName: string) => {
			// No signed-in owner, no check-in: a session with nobody's name on it
			// could later go up as whoever signs in next.
			if (busy || active || !owner) return;
			setBusy(true);
			setError(null);
			try {
				const point = await fix();
				if (!point) return;

				const session = newSession(siteId, siteName, owner, point);
				await saveAttendance(session);
				setActive(session);
				// Fire and forget: the timer is already running on screen and the
				// engine retries on its own triggers if this pass finds no signal.
				void syncEngine.sync("check-in");
			} finally {
				setBusy(false);
			}
		},
		[active, busy, owner, fix],
	);

	const endVisit = useEndVisit({ active, busy, fix, setActive, setBusy, setError, setJustClosed });
	const { startChecks, startingChecks } = useStartChecks(active, setError);
	const clearError = useCallback(() => setError(null), []);
	const clearClosed = useCallback(() => setJustClosed(null), []);

	return {
		active,
		justClosed,
		busy,
		startingChecks,
		error,
		checkIn: startVisit,
		checkOut: endVisit,
		startChecks,
		dismissError: clearError,
		dismissClosed: clearClosed,
	};
}
