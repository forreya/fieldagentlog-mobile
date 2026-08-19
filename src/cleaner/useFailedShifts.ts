// Shifts whose record could not be sent and will not retry by itself.
//
// Attendance is evidence, so there is no discard here and never will be: a
// failed session stays on the phone until it goes through or some explicit
// support mechanism reconciles it. What a cleaner CAN do is try again - the
// failures that land here are account and assignment state ("your account is
// not active", "site not assigned to you") that a managing agent can put
// right, and the identical payload then succeeds, idempotent on its client
// id.
//
// Owner-scoped like everything else that renders queue contents: another
// account's failed shift is theirs to see and retry, not this user's.

import { useCallback, useEffect, useState } from "react";

import { allAttendance } from "@/db/attendance";
import type { AttendanceSession } from "@/db/types";
import { clearAttendanceFailure } from "@/sync/attendanceSync";
import { syncEngine } from "@/sync/engine";
import { visibleToUser } from "@/sync/owner";

export interface FailedShiftsView {
	/** Closed sessions whose send failed - the ones with no live card to say
	 *  so. A failed OPEN session speaks through the on-site card instead. */
	failed: AttendanceSession[];
	/** Clear the recorded failure and ask for a pass. Safe to tap repeatedly:
	 *  clearing an already-clear session is a no-op and the engine is
	 *  single-flight. Works for open sessions too, which is what the on-site
	 *  card's Try again calls. */
	retry: (localId: string) => void;
}

export function useFailedShifts(ownerId: string | null): FailedShiftsView {
	const [failed, setFailed] = useState<AttendanceSession[]>([]);

	useEffect(() => {
		const read = () =>
			void allAttendance().then((sessions) =>
				setFailed(sessions.filter((s) => s.sync_error && s.check_out !== null && visibleToUser(s.owner_user_id, ownerId))),
			);
		read();
		// Every engine notification, like the attendance hook: a retry that
		// succeeds deletes the row, and this list is how the banner learns.
		return syncEngine.subscribe(read);
	}, [ownerId]);

	const retry = useCallback((localId: string) => {
		void clearAttendanceFailure(localId).then(() => syncEngine.sync("attendance retry"));
	}, []);

	return { failed, retry };
}
