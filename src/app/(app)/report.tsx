// Route only; the screen lives in src/screens so its test can sit beside it.

import { Redirect, useLocalSearchParams } from "expo-router";

import { ReportIssue } from "@/screens/report/ReportIssue";

export default function ReportRoute() {
	// useLocalSearchParams types these as strings whether or not they were
	// passed, so a route reached without them hands the screen `undefined`.
	const { siteId, siteName, attendance } = useLocalSearchParams<{ siteId?: string; siteName?: string; attendance?: string }>();

	// A report has to belong to a block: the broker refuses one that names a
	// block the reporter is not assigned to, and with no block at all the queue
	// ends up holding a row that can never be sent. Seen on a device - the
	// composer accepted it, the server said "Block not assigned to you.", and it
	// landed in Your reports as a permanent failure the person could not fix.
	//
	// Every real entry point passes the block, so arriving without one means a
	// hand-typed or stale link. Home, rather than an error nobody can act on.
	if (!siteId) return <Redirect href="/(app)" />;

	return <ReportIssue site={{ id: siteId, name: siteName ?? "this block" }} attendanceClientId={attendance ?? null} />;
}
