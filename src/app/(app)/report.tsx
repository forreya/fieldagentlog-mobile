// Route only; the screen lives in src/screens so its test can sit beside it.

import { Redirect, useLocalSearchParams } from "expo-router";

import { useAuth } from "@/auth/AuthProvider";
import { ReportIssue } from "@/screens/report/ReportIssue";

export default function ReportRoute() {
	// useLocalSearchParams types these as strings whether or not they were
	// passed, so a route reached without them hands the screen `undefined`.
	const { siteId, siteName, attendance } = useLocalSearchParams<{ siteId?: string; siteName?: string; attendance?: string }>();
	const { state } = useAuth();
	const cleaner = state.status === "signed_in" && state.role === "cleaner";

	// A report has to name a block: the broker refuses one naming a block the
	// reporter is not assigned to, and with no block at all the queue ends up
	// holding a row nobody can clear. Seen on a device before the guard existed.
	//
	// A cleaner is the exception, and the screen has a picker for them - their
	// entry point is a list of sites, not one site. Staff and agents always
	// report from a block they already have open, so arriving without one means
	// a hand-typed or stale link.
	if (!siteId && !cleaner) return <Redirect href="/(app)" />;

	const site = siteId ? { id: siteId, name: siteName ?? "this block" } : null;
	return <ReportIssue site={site} attendanceClientId={attendance ?? null} />;
}
