// What has been reported: the ones still on this phone, then the ones the
// server has.
//
// Both halves matter and they answer different questions. "Did my report go?"
// is answered by the local queue; "what did I report last week?" by the server.
// Showing only the second would make a queued report look lost.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { loadMyReports, type SentReport } from "@/api/report";
import { useAuth } from "@/auth/AuthProvider";
import { allReports } from "@/db/reports";
import type { PendingReport } from "@/db/types";
import { syncEngine } from "@/sync/engine";
import { visibleToUser } from "@/sync/owner";

import { failureMessage } from "./failureMessage";

/** Keyed by user as well as name: the sent list is that account's data, and a
 *  cached copy must never hydrate under whoever signs in next. */
export const reportsKey = (userId: string) => ["my-reports", userId] as const;

export interface ReportsView {
	/** Still on the device, newest first. */
	pending: PendingReport[];
	/** Accepted by the server, newest first. */
	sent: SentReport[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	refresh: () => void;
}

/**
 * The device's own queue, re-read whenever the engine reports anything. A
 * report that just landed should leave this list without a pull-to-refresh.
 *
 * Exported for the entry-point button, which shows how many are waiting. That
 * count must NOT drag the server request along with it - the button sits on
 * screens a cleaner opens in a basement.
 */
export function usePendingReports(): PendingReport[] {
	const [pending, setPending] = useState<PendingReport[]>([]);
	const { state } = useAuth();
	const userId = state.status === "signed_in" ? state.user.id : null;

	useEffect(() => {
		// Another account's queued reports are held by the sync layer and hidden
		// here: their words and photos are theirs. Ownerless rows predate
		// ownership and stay visible, as they always were.
		const read = () =>
			void allReports().then((reports) =>
				setPending(reports.filter((report) => visibleToUser(report.owner_user_id, userId)).sort((a, b) => b.at - a.at)),
			);
		read();
		return syncEngine.subscribe(read);
	}, [userId]);

	return pending;
}

export function useReports(): ReportsView {
	const pending = usePendingReports();
	const { state } = useAuth();
	const userId = state.status === "signed_in" ? state.user.id : "anon";
	const query = useQuery({ queryKey: reportsKey(userId), queryFn: () => loadMyReports() });

	return {
		pending,
		sent: query.data ?? [],
		loading: query.isPending,
		refreshing: query.isFetching && query.data !== undefined,
		error: query.error ? failureMessage(query.error, "Something went wrong loading your reports.") : null,
		refresh: useCallback(() => void query.refetch(), [query]),
	};
}
