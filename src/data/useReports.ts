// What has been reported: the ones still on this phone, then the ones the
// server has.
//
// Both halves matter and they answer different questions. "Did my report go?"
// is answered by the local queue; "what did I report last week?" by the server.
// Showing only the second would make a queued report look lost.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { loadMyReports, type SentReport } from "@/api/report";
import { allReports } from "@/db/reports";
import type { PendingReport } from "@/db/types";
import { syncEngine } from "@/sync/engine";

import { failureMessage } from "./failureMessage";

export const reportsKey = ["my-reports"] as const;

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

/** The device's own queue, re-read whenever the engine reports anything. A
 *  report that just landed should leave this list without a pull-to-refresh. */
function usePendingReports(): PendingReport[] {
	const [pending, setPending] = useState<PendingReport[]>([]);

	useEffect(() => {
		const read = () => void allReports().then((reports) => setPending([...reports].sort((a, b) => b.at - a.at)));
		read();
		return syncEngine.subscribe(read);
	}, []);

	return pending;
}

export function useReports(): ReportsView {
	const pending = usePendingReports();
	const query = useQuery({ queryKey: reportsKey, queryFn: () => loadMyReports() });

	return {
		pending,
		sent: query.data ?? [],
		loading: query.isPending,
		refreshing: query.isFetching && query.data !== undefined,
		error: query.error ? failureMessage(query.error, "Something went wrong loading your reports.") : null,
		refresh: useCallback(() => void query.refetch(), [query]),
	};
}
