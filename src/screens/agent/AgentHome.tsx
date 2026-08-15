import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { BlockCard } from "@/components/BlockCard";
import { FindBar } from "@/components/FindBar";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useFind } from "@/data/useFind";
import { freshnessLabel, useDashboard, type DashboardView } from "@/data/useDashboard";
import type { BlockWithJobs } from "@/shared/fireData";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * The external agent's home: only the blocks assigned to them, read through the
 * field-agent broker because they have no database access at all.
 *
 * Cached data is shown rather than a spinner whenever there is any, with a
 * stamp saying how old it is. Someone standing outside a building wants
 * yesterday's list and the truth about its age, not an empty screen.
 */
export function AgentHome() {
	const { state, signOut } = useAuth();
	const sync = useSyncStatus();
	const dashboard = useDashboard();
	const email = state.status === "signed_in" ? (state.user.email ?? undefined) : undefined;

	return (
		<Screen
			title="Your visits"
			sub="Fire-safety checks"
			action={<StatusPill {...sync} />}
			signedInAs={email}
			scroll={false}
			footer={<Button label="Sign out" variant="ghostDark" block onPress={() => void signOut()} />}
		>
			<Body dashboard={dashboard} />
		</Screen>
	);
}

/** Stable empty list, so the finder does not re-run while the blocks load. */
const NO_BLOCKS: BlockWithJobs[] = [];

function Body({ dashboard }: { dashboard: DashboardView }) {
	const { data, loading, refreshing, error, updatedAt, refresh } = dashboard;
	const find = useFind(data?.blocks ?? NO_BLOCKS);

	if (loading) return <Note title="Loading your blocks" body="This only takes a moment." />;

	// Nothing cached and nothing came back: the only case that is truly an error.
	if (!data) {
		return (
			<Note title="Couldn't load your blocks" body={error ?? "Something went wrong."}>
				<Button label="Try again" variant="ghost" onPress={refresh} />
			</Note>
		);
	}

	return (
		<ScrollView
			contentContainerStyle={styles.list}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.signal} />}
		>
			{/* One statement of freshness per screen: the stale notice carries it
			    when there is one, otherwise the summary does. */}
			<Summary dashboard={dashboard} showStamp={!error} />
			{error ? <Stale message={error} updatedAt={updatedAt} /> : null}
			{data.blocks.length === 0 ? (
				<Note title="No blocks assigned" body="When a managing agent assigns you blocks, they'll appear here." />
			) : (
				<>
					{/* Only worth the space once there is a list to search. */}
					{data.blocks.length > 3 ? (
						<FindBar
							query={find.query}
							onQuery={find.setQuery}
							near={find.near}
							onToggleNear={find.toggleNear}
							error={find.error}
							showing={{ shown: find.results.length, total: data.blocks.length }}
						/>
					) : null}
					{find.results.length === 0 ? (
						<Note title="Nothing matches that" body="Try part of the name, the street or the postcode." />
					) : (
						find.results.map((block) => (
							<BlockCard
								key={block.id}
								block={block}
								distanceKm={find.distances.get(block.id)}
								onOpen={() => router.push({ pathname: "/(app)/block/[id]", params: { id: block.id } })}
							/>
						))
					)}
				</>
			)}
		</ScrollView>
	);
}

function Summary({ dashboard, showStamp }: { dashboard: DashboardView; showStamp: boolean }) {
	const totals = dashboard.data?.totals;
	if (!totals) return null;
	return (
		<View style={styles.summary}>
			<Text style={styles.counts}>
				<Text style={styles.strong}>{totals.blocks}</Text> {totals.blocks === 1 ? "block" : "blocks"} ·{" "}
				<Text style={styles.strong}>{totals.jobsDue}</Text> {totals.jobsDue === 1 ? "job" : "jobs"} due
				{totals.overdue > 0 ? <Text style={styles.overdue}> · {totals.overdue} overdue</Text> : null}
			</Text>
			{showStamp ? <Text style={styles.stamp}>{freshnessLabel(dashboard.updatedAt)}</Text> : null}
		</View>
	);
}

/** The refresh failed but there is still a usable list underneath. */
function Stale({ message, updatedAt }: { message: string; updatedAt: number | null }) {
	return (
		<View style={styles.stale}>
			<Text style={styles.staleTitle}>Showing what was saved here</Text>
			<Text style={styles.staleBody}>
				{message} {freshnessLabel(updatedAt)}.
			</Text>
		</View>
	);
}

function Note({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
	return (
		<Card>
			<Text style={styles.noteTitle}>{title}</Text>
			<Text style={styles.noteBody}>{body}</Text>
			{children}
		</Card>
	);
}

const styles = StyleSheet.create({
	list: { gap: space.s3, paddingBottom: space.s6 },
	summary: { gap: 2 },
	counts: { fontFamily: fonts.body, fontSize: 15, color: colors.plateInk },
	strong: { fontFamily: fonts.displayHeavy },
	overdue: { fontFamily: fonts.bodyMedium, color: colors.fail },
	stamp: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	stale: { backgroundColor: colors.naTint, borderLeftWidth: 4, borderLeftColor: colors.sevMedium, borderRadius: 8, padding: space.s3, gap: 2 },
	staleTitle: { fontFamily: fonts.displayHeavy, fontSize: 15, color: colors.plateInk },
	staleBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateInk },
	noteTitle: { fontFamily: fonts.displayHeavy, fontSize: 18, color: colors.plateInk },
	noteBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateMuted },
});
