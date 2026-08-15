import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { agentStartVisit } from "@/api/agent";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { VisitHistory } from "@/components/VisitHistory";
import { useBlockVisits } from "@/data/useBlockVisits";
import { useDashboard, type DashboardView } from "@/data/useDashboard";
import { dueLabel, frequencyLabel, type BlockWithJobs, type Job } from "@/shared/fireData";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * One block: what is due on it, what has already been done, and the button that
 * starts a checklist.
 *
 * The block comes from the dashboard's cache rather than its own request. It is
 * the same data, it is already on the device, and an agent who can see a block
 * in the list should never be told it is loading when they tap it.
 */
export function BlockDetail({ blockId }: { blockId: string }) {
	const sync = useSyncStatus();
	const dashboard = useDashboard();
	const block = dashboard.data?.blocks.find((b) => b.id === blockId);

	if (!block) {
		return (
			<Screen
				title="Block"
				sub="Fire-safety checks"
				action={<StatusPill {...sync} />}
				footer={<Button label="Back" variant="ghostDark" block onPress={() => router.back()} />}
			>
				<Card>
					<Text style={styles.h}>{dashboard.loading ? "Loading" : "That block isn't in your list"}</Text>
					<Text style={styles.p}>
						{dashboard.loading ? "One moment." : "It may have been unassigned. Pull down on your blocks list to refresh it."}
					</Text>
				</Card>
			</Screen>
		);
	}

	return <Detail block={block} dashboard={dashboard} />;
}

function Detail({ block, dashboard }: { block: BlockWithJobs; dashboard: DashboardView }) {
	const sync = useSyncStatus();
	const history = useBlockVisits(block.id);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const due = block.jobs.filter((job) => job.level !== "upcoming");
	const upcoming = block.jobs.filter((job) => job.level === "upcoming");

	async function start() {
		if (busy) return;
		setBusy(true);
		setError(null);
		try {
			const token = await agentStartVisit(block.id);
			// Replaced, not pushed: the checklist is the task now, and Back from
			// it should return to this block rather than to a stale mid-visit.
			router.replace({ pathname: "/v/[token]", params: { token } });
		} catch (err) {
			setBusy(false);
			setError(err instanceof Error ? err.message : "Couldn't start the checklist.");
		}
	}

	return (
		<Screen
			title={block.name}
			sub={block.address ?? "Fire-safety checks"}
			action={<StatusPill {...sync} />}
			scroll={false}
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => router.back()} />
					<Button label="Start checklist" busy={busy} onPress={() => void start()} style={styles.grow} />
				</>
			}
		>
			<Body block={block} due={due} upcoming={upcoming} error={error} history={history} dashboard={dashboard} />
		</Screen>
	);
}

function Body({
	block,
	due,
	upcoming,
	error,
	history,
	dashboard,
}: {
	block: BlockWithJobs;
	due: Job[];
	upcoming: Job[];
	error: string | null;
	history: ReturnType<typeof useBlockVisits>;
	dashboard: DashboardView;
}) {
	// Refreshes both halves: what is due comes from the dashboard, what has been
	// done comes from the history, and someone pulling down means "all of it".
	const refresh = () => {
		dashboard.refresh();
		history.refresh();
	};
	return (
		<ScrollView
			contentContainerStyle={styles.body}
			refreshControl={<RefreshControl refreshing={dashboard.refreshing || history.loading} onRefresh={refresh} tintColor={colors.signal} />}
		>
			<Text style={styles.lead}>Opens the on-site checklist for this block and records the visit against your name.</Text>
			{error ? (
				<Text accessibilityRole="alert" style={styles.error}>
					{error}
				</Text>
			) : null}

			<Section title={`Due now (${due.length})`}>
				{due.length === 0 ? <Text style={styles.empty}>Nothing due right now.</Text> : due.map((job) => <JobRow key={job.id} job={job} />)}
			</Section>

			{upcoming.length > 0 ? (
				<Section title={`Not due yet (${upcoming.length})`}>
					{upcoming.map((job) => (
						<JobRow key={job.id} job={job} muted />
					))}
				</Section>
			) : null}

			{block.specialist > 0 ? (
				<Text style={styles.note}>
					{block.specialist} specialist {block.specialist === 1 ? "check is" : "checks are"} handled by contractors and stay in BalanceBuddy.
				</Text>
			) : null}

			<Section title="Past visits">
				<PastVisits history={history} />
			</Section>
		</ScrollView>
	);
}

/** History never blocks the checklist: a failure here is a line of text, not a
 *  screen, because the agent came to do a visit rather than read about one. */
function PastVisits({ history }: { history: ReturnType<typeof useBlockVisits> }) {
	if (history.loading) return <Text style={styles.empty}>Loading past visits...</Text>;
	if (history.error) return <Text style={styles.empty}>Couldn&apos;t load past visits. {history.error}</Text>;
	if (history.visits.length === 0) return <Text style={styles.empty}>No visits recorded yet.</Text>;
	return <VisitHistory visits={history.visits} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{title}</Text>
			{children}
		</View>
	);
}

function JobRow({ job, muted }: { job: Job; muted?: boolean }) {
	return (
		<View style={styles.job}>
			<View style={styles.jobMain}>
				<Text style={styles.jobTitle}>{job.title}</Text>
				<Text style={styles.jobMeta}>{frequencyLabel(job.frequency)}</Text>
			</View>
			<Text style={[styles.jobDue, muted && styles.jobDueMuted, job.level === "overdue" && styles.jobDueBad]}>{dueLabel(job.daysUntil)}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	body: { gap: space.s5, paddingBottom: space.s6 },
	lead: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateMuted },
	error: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 21, color: colors.fail },
	section: { gap: space.s2 },
	sectionTitle: { fontFamily: fonts.displayHeavy, fontSize: 16, color: colors.plateInk },
	empty: { fontFamily: fonts.body, fontSize: 14, color: colors.plateMuted },
	note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.plateMuted },
	job: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.s3,
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: 10,
		padding: space.s3,
		minHeight: 56,
	},
	jobMain: { flex: 1, gap: 1 },
	jobTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	jobMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	jobDue: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.sevHigh },
	jobDueMuted: { color: colors.plateMuted },
	jobDueBad: { color: colors.fail },
	h: { fontFamily: fonts.displayHeavy, fontSize: 18, color: colors.plateInk },
	p: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
