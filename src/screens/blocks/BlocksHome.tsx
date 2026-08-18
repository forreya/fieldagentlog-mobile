import { router } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { BlockCard } from "@/components/BlockCard";
import { FindBar } from "@/components/FindBar";
import { Note } from "@/components/Note";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { StaleNote } from "@/components/StaleNote";
import { StatusPill } from "@/components/StatusPill";
import { useFind } from "@/data/useFind";
import { freshnessLabel, useDashboard, type DashboardView } from "@/data/useDashboard";
import type { BlockWithJobs } from "@/shared/fireData";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * The blocks home, for both signed-in personas that have one.
 *
 * An agent sees only the blocks assigned to them, read through the field-agent
 * broker because they have no database access at all. A staff member sees their
 * organisation's blocks, read directly under RLS. Same screen either way - the
 * source is chosen in useDashboard, not here.
 *
 * Cached data is shown rather than a spinner whenever there is any, with a
 * stamp saying how old it is. Someone standing outside a building wants
 * yesterday's list and the truth about its age, not an empty screen.
 */
export function BlocksHome() {
	const { state, signOut } = useAuth();
	const sync = useSyncStatus();
	const dashboard = useDashboard();
	const email = state.status === "signed_in" ? (state.user.email ?? undefined) : undefined;
	// An agent is sent to specific blocks; a staff member owns a portfolio.
	const staff = state.status === "signed_in" && state.role === "staff";

	return (
		<Screen
			title={staff ? "Your blocks" : "Your visits"}
			sub="Fire-safety checks"
			action={<StatusPill {...sync} />}
			signedInAs={email}
			scroll={false}
			footer={
				<>
					<Button label="Sign out" variant="ghostDark" onPress={() => void signOut()} />
					{staff ? <Button label="Plan visits" onPress={() => router.push("/(app)/plan")} style={styles.grow} /> : null}
				</>
			}
		>
			<Body dashboard={dashboard} staff={staff} />
		</Screen>
	);
}

/** Stable empty list, so the finder does not re-run while the blocks load. */
const NO_BLOCKS: BlockWithJobs[] = [];

function Body({ dashboard, staff }: { dashboard: DashboardView; staff: boolean }) {
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
			{error ? <StaleNote message={error} updatedAt={updatedAt} /> : null}
			{data.blocks.length === 0 ? (
				<Note
					title={staff ? "No blocks yet" : "No blocks assigned"}
					body={
						staff
							? "Blocks added in BalanceBuddy appear here once they have fire checks set up."
							: "When a managing agent assigns you blocks, they'll appear here."
					}
				/>
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

const styles = StyleSheet.create({
	grow: { flex: 1 },
	list: { gap: space.s3, paddingBottom: space.s6 },
	summary: { gap: 2 },
	counts: { fontFamily: fonts.body, fontSize: 15, color: colors.plateInk },
	strong: { fontFamily: fonts.displayHeavy },
	overdue: { fontFamily: fonts.bodyMedium, color: colors.fail },
	stamp: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
