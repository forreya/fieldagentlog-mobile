import { router } from "expo-router";

import { goBack } from "@/lib/nav";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { Note } from "@/components/Note";
import { Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { useDashboard } from "@/data/useDashboard";
import { usePlan } from "@/data/usePlan";
import type { PlanGroup } from "@/lib/plan";
import type { BlockWithJobs } from "@/shared/fireData";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, radii, space } from "@/theme/tokens";

/**
 * Suggested rounds: nearby blocks that need a visit, grouped into trips and
 * put in drive order, worst first.
 *
 * Staff only - an agent's handful of assigned blocks does not need planning,
 * and the web app draws the same line. The list is a suggestion, not a rota:
 * every row is just a way into the block, and nothing here is persisted.
 */
export function PlanVisits() {
	const { state } = useAuth();
	const sync = useSyncStatus();
	const dashboard = useDashboard();
	const plan = usePlan(dashboard.data?.blocks ?? []);

	const staff = state.status === "signed_in" && state.role === "staff";

	return (
		<Screen
			title="Plan visits"
			sub="Nearby blocks, grouped into rounds"
			action={<StatusPill {...sync} />}
			scroll={false}
			footer={<Button label="Back" variant="ghostDark" block onPress={() => goBack()} />}
		>
			{!staff ? (
				<Note title="A staff tool" body="Planning rounds needs the whole portfolio, so it is only available to staff accounts." />
			) : (
				<Body dashboardLoading={dashboard.loading} plan={plan} />
			)}
		</Screen>
	);
}

function Body({ dashboardLoading, plan }: { dashboardLoading: boolean; plan: ReturnType<typeof usePlan> }) {
	if (dashboardLoading || plan.loading) {
		return <Note title="Grouping nearby blocks" body="Working out which visits sit well together." />;
	}
	if (!plan.plan) {
		return (
			<Note title="Couldn't plan visits" body={plan.error ?? "Something went wrong."}>
				<Button label="Try again" variant="ghost" onPress={plan.refresh} />
			</Note>
		);
	}

	const { groups, ungrouped } = plan.plan;
	if (groups.length === 0 && ungrouped.length === 0) {
		return <Note title="Nothing to plan" body="No blocks need a visit right now." />;
	}

	return (
		<ScrollView contentContainerStyle={styles.list}>
			<Text style={styles.summary}>
				{groups.length} suggested {groups.length === 1 ? "round" : "rounds"} - nearby blocks in drive order.
			</Text>
			{groups.map((group, index) => (
				<Round key={group.id} group={group} index={index} />
			))}
			{ungrouped.length > 0 ? <Ungrouped blocks={ungrouped} /> : null}
		</ScrollView>
	);
}

function Round({ group, index }: { group: PlanGroup; index: number }) {
	return (
		<View style={styles.group}>
			<View style={styles.groupHead}>
				<Text style={styles.groupTitle}>
					Round {index + 1} · {group.label}
				</Text>
				<Text style={styles.groupMeta}>
					{group.blocks.length} {group.blocks.length === 1 ? "block" : "blocks"} · {group.jobs} jobs
					{group.overdue > 0 ? ` · ${group.overdue} overdue` : ""}
					{group.distanceKm >= 1 ? ` · ~${Math.round(group.distanceKm)} km` : ""}
				</Text>
			</View>
			{group.blocks.map((block, sequence) => (
				<PlanRow key={block.id} block={block} sequence={sequence + 1} />
			))}
		</View>
	);
}

/** Blocks that need a visit but could not be placed on the map. Still shown -
 *  a block with an unknown postcode still has overdue checks. */
function Ungrouped({ blocks }: { blocks: BlockWithJobs[] }) {
	return (
		<View style={styles.group}>
			<View style={styles.groupHead}>
				<Text style={styles.groupTitle}>Location unknown</Text>
				<Text style={styles.groupMeta}>
					{blocks.length} {blocks.length === 1 ? "block" : "blocks"} · no usable postcode
				</Text>
			</View>
			{blocks.map((block) => (
				<PlanRow key={block.id} block={block} />
			))}
		</View>
	);
}

function PlanRow({ block, sequence }: { block: BlockWithJobs; sequence?: number }) {
	const status = block.overdue > 0 ? `${block.overdue} overdue` : `${block.soon} due soon`;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${sequence ? `Stop ${sequence}: ` : ""}${block.name}. ${status}`}
			onPress={() => router.push({ pathname: "/(app)/block/[id]", params: { id: block.id } })}
			style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
		>
			{sequence ? <Text style={styles.sequence}>{sequence}</Text> : <View style={styles.sequenceGap} />}
			<View style={styles.rowMain}>
				<Text style={styles.rowName}>{block.name}</Text>
				{block.address ? (
					<Text style={styles.rowAddress} numberOfLines={1}>
						{block.address}
					</Text>
				) : null}
			</View>
			<Text style={[styles.rowStatus, block.overdue > 0 && styles.rowStatusBad]}>{status}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	list: { gap: space.s4, paddingBottom: space.s6 },
	summary: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateMuted },
	group: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s2,
	},
	groupHead: { gap: 2, paddingBottom: space.s2, borderBottomWidth: 1, borderBottomColor: colors.plateEdge },
	groupTitle: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.plateInk },
	groupMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	row: { flexDirection: "row", alignItems: "center", gap: space.s3, minHeight: 52 },
	rowPressed: { opacity: 0.7 },
	sequence: {
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: colors.signalDeep,
		color: colors.plateRaised,
		fontFamily: fonts.displayHeavy,
		fontSize: 13,
		textAlign: "center",
		lineHeight: 26,
		overflow: "hidden",
	},
	sequenceGap: { width: 26 },
	rowMain: { flex: 1, gap: 1 },
	rowName: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	rowAddress: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	rowStatus: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.sevHigh },
	rowStatusBad: { color: colors.fail },
});
