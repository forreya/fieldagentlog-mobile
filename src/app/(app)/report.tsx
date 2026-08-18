// Route only; the screen lives in src/screens so its test can sit beside it.

import { useLocalSearchParams } from "expo-router";

import { ReportIssue } from "@/screens/report/ReportIssue";

export default function ReportRoute() {
	const { siteId, siteName, attendance } = useLocalSearchParams<{ siteId: string; siteName: string; attendance?: string }>();
	return <ReportIssue site={{ id: siteId, name: siteName }} attendanceClientId={attendance ?? null} />;
}
