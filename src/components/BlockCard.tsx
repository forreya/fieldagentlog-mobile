import { Pressable, StyleSheet, Text, View } from "react-native";

import { dueLabel, type BlockWithJobs, type DueLevel } from "@/shared/fireData";
import { colors, fonts, radii, space } from "@/theme/tokens";

const LEVEL: Record<DueLevel, { fg: string; bg: string }> = {
	overdue: { fg: colors.fail, bg: colors.failTint },
	soon: { fg: colors.sevHigh, bg: colors.plate },
	upcoming: { fg: colors.plateMuted, bg: colors.plate },
};

/** The one-line verdict on a block, which is what the list is scanned for. */
export function blockStatus(block: BlockWithJobs): { text: string; level: DueLevel | "ok" } {
	if (block.overdue > 0) return { text: `${block.overdue} overdue`, level: "overdue" };
	if (block.soon > 0) return { text: `${block.soon} due soon`, level: "soon" };
	return { text: "Up to date", level: "ok" };
}

/**
 * One block in the list. Shows the worst news first - overdue beats due-soon
 * beats up-to-date - then up to three of the jobs behind it, because an agent
 * deciding where to go next wants to know what is waiting, not just how much.
 */
export function BlockCard({ block, onOpen }: { block: BlockWithJobs; onOpen: () => void }) {
	const status = blockStatus(block);
	const preview = block.jobs.filter((job) => job.level !== "upcoming").slice(0, 3);
	const more = block.overdue + block.soon - preview.length;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${block.name}. ${status.text}`}
			onPress={onOpen}
			style={({ pressed }) => [styles.card, pressed && styles.pressed]}
		>
			<View style={styles.head}>
				<View style={styles.id}>
					<Text style={styles.name}>{block.name}</Text>
					{block.address ? (
						<Text style={styles.address} numberOfLines={2}>
							{block.address}
						</Text>
					) : null}
				</View>
				<StatusTag text={status.text} level={status.level} />
			</View>

			{preview.length > 0 ? (
				<View style={styles.jobs}>
					{preview.map((job) => (
						<View key={job.id} style={styles.job}>
							<View style={[styles.dot, { backgroundColor: LEVEL[job.level].fg }]} />
							<Text style={styles.jobTitle} numberOfLines={1}>
								{job.title}
							</Text>
							<Text style={[styles.jobDue, { color: LEVEL[job.level].fg }]}>{dueLabel(job.daysUntil)}</Text>
						</View>
					))}
					{more > 0 ? <Text style={styles.more}>and {more} more</Text> : null}
				</View>
			) : null}
		</Pressable>
	);
}

function StatusTag({ text, level }: { text: string; level: DueLevel | "ok" }) {
	const tone = level === "ok" ? { fg: colors.pass, bg: colors.passTint } : LEVEL[level];
	return (
		<View style={[styles.tag, { backgroundColor: tone.bg }]}>
			<Text style={[styles.tagText, { color: tone.fg }]}>{text}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s3,
	},
	pressed: { transform: [{ scale: 0.995 }], borderColor: colors.plateEdgeStrong },
	head: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
	id: { flex: 1, gap: 2 },
	name: { fontFamily: fonts.displayHeavy, fontSize: 17, color: colors.plateInk },
	address: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.plateMuted },
	tag: { paddingVertical: 5, paddingHorizontal: space.s3, borderRadius: radii.sm },
	tagText: { fontFamily: fonts.displayHeavy, fontSize: 12, letterSpacing: 0.4 },
	jobs: { gap: space.s2, borderTopWidth: 1, borderTopColor: colors.plateEdge, paddingTop: space.s3 },
	job: { flexDirection: "row", alignItems: "center", gap: space.s2 },
	dot: { width: 7, height: 7, borderRadius: 4 },
	jobTitle: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.plateInk },
	jobDue: { fontFamily: fonts.bodyMedium, fontSize: 13 },
	more: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted, marginLeft: 15 },
});
