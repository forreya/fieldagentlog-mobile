import { Pressable, StyleSheet, Text, View } from "react-native";

import type { FraAction, Verdict, VisitPacket } from "@/api/contract";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { VerdictMark } from "@/components/VerdictMark";
import type { VisitRecord } from "@/db/types";
import { colors, fonts, radii, space } from "@/theme/tokens";
import type { SubmitPhase } from "@/visit/useSubmit";
import { answeredCount, checksOf, incompleteFailures, type WizardAction, type WizardState } from "@/visit/wizard";

import { FraReview } from "./FraReview";

const TAG: Record<Verdict | "none", { label: string; fg: string; bg: string }> = {
	pass: { label: "Pass", fg: colors.pass, bg: colors.passTint },
	fail: { label: "Fail", fg: colors.fail, bg: colors.failTint },
	na: { label: "N/A", fg: colors.na, bg: colors.naTint },
	none: { label: "Not answered", fg: colors.plateMuted, bg: colors.naTint },
};

/** What the submit button should say and do. Pure, so it can be tested alone. */
export function submitAction(phase: SubmitPhase, ready: boolean): { label: string; busy: boolean; disabled: boolean } {
	if (phase.kind === "submitting") return { label: "Submitting", busy: true, disabled: true };
	// Offline is the one state with nothing useful to press: the engine is
	// already watching for signal and will send it without being asked.
	if (phase.kind === "queued" && !phase.online) return { label: "Waiting for signal", busy: false, disabled: true };
	if (phase.kind === "queued" || phase.kind === "blocked") return { label: "Try again", busy: false, disabled: !ready };
	return { label: "Submit inspection", busy: false, disabled: !ready };
}

export interface SummaryProps {
	state: WizardState;
	dispatch: (action: WizardAction) => void;
	phase: SubmitPhase;
	onSubmit: () => void;
}

/**
 * Review before submitting, and the only place the whole visit is visible.
 *
 * Every row jumps back to its check: an inspector spotting a mistake here
 * should be two taps from fixing it, not walking back through the wizard.
 *
 * Submitting is held until every check has a verdict and every failure has its
 * severity and note. The server would accept a partial visit - it simply leaves
 * unanswered checks due - but a half-finished inspection quietly becoming the
 * compliance record is exactly the outcome worth preventing.
 */
export function VisitSummary({ state, dispatch, phase, onSubmit }: SummaryProps) {
	const { record } = state;
	const checks = checksOf(record);
	const answered = answeredCount(record);
	const unanswered = checks.length - answered;
	const incomplete = incompleteFailures(record);
	const ready = unanswered === 0 && incomplete.length === 0;
	const action = submitAction(phase, ready);

	// Judging open fire-risk-assessment actions is the responsible person's
	// call, not a cleaner's, so a visit handed over from the cleaner app skips
	// that review. It is optional anyway - untouched actions submit nothing.
	const packet = record.packet as VisitPacket;
	const fraActions: FraAction[] = record.cleaner_handoff ? [] : (packet.fra_actions ?? []);

	return (
		<Screen
			title={packet.visit?.block_name || "Inspection"}
			sub="Review and submit"
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => dispatch({ type: "BACK" })} />
					<Button label={action.label} busy={action.busy} disabled={action.disabled} onPress={onSubmit} style={styles.grow} />
				</>
			}
		>
			<Tally record={record} />
			<Notices unanswered={unanswered} incomplete={incomplete.length} phase={phase} />

			<View style={styles.section}>
				<Text style={styles.heading}>Checks</Text>
				<Card>
					{checks.map((check, index) => (
						<CheckRow
							key={check.id}
							title={check.title}
							result={record.results[check.id]}
							divided={index > 0}
							onPress={() => dispatch({ type: "GO_CHECK", index })}
						/>
					))}
				</Card>
			</View>

			{fraActions.length > 0 ? <FraReview actions={fraActions} updates={record.fra_updates} dispatch={dispatch} /> : null}
		</Screen>
	);
}

function Tally({ record }: { record: VisitRecord }) {
	const counts = { pass: 0, fail: 0, na: 0 };
	for (const check of checksOf(record)) {
		const verdict = record.results[check.id]?.verdict;
		if (verdict) counts[verdict] += 1;
	}
	return (
		<View style={styles.tally}>
			{(["pass", "fail", "na"] as const).map((verdict) => (
				<View key={verdict} style={[styles.cell, { backgroundColor: TAG[verdict].bg }]}>
					<Text style={[styles.cellNumber, { color: TAG[verdict].fg }]}>{counts[verdict]}</Text>
					<Text style={[styles.cellLabel, { color: TAG[verdict].fg }]}>{TAG[verdict].label}</Text>
				</View>
			))}
		</View>
	);
}

function Notices({ unanswered, incomplete, phase }: { unanswered: number; incomplete: number; phase: SubmitPhase }) {
	return (
		<>
			{unanswered > 0 ? (
				<Notice
					title="Not finished yet"
					body={`${unanswered} ${unanswered === 1 ? "check still needs" : "checks still need"} a verdict. Tap one below to finish it.`}
				/>
			) : null}
			{incomplete > 0 ? (
				<Notice
					title="A failure is missing detail"
					body={`${incomplete} failed ${incomplete === 1 ? "check needs" : "checks need"} a severity and a note before this can be sent.`}
				/>
			) : null}
			{phase.kind === "queued" ? (
				<Notice
					title={phase.online ? "Couldn't send it just yet" : "Saved on this phone"}
					body={
						phase.online
							? "It's saved here and the app will keep trying. Nothing is lost."
							: "There's no signal. This inspection is stored on the device and sends itself as soon as you have a connection - you can close the app."
					}
				/>
			) : null}
			{phase.kind === "blocked" ? <Notice tone="bad" title="This inspection couldn't be sent" body={phase.message} /> : null}
		</>
	);
}

function Notice({ tone = "warn", title, body }: { tone?: "warn" | "bad"; title: string; body: string }) {
	return (
		<View style={[styles.notice, tone === "bad" && styles.noticeBad]}>
			<Text style={styles.noticeTitle}>{title}</Text>
			<Text style={styles.noticeBody}>{body}</Text>
		</View>
	);
}

function CheckRow({
	title,
	result,
	divided,
	onPress,
}: {
	title: string;
	result: VisitRecord["results"][string] | undefined;
	divided: boolean;
	onPress: () => void;
}) {
	const verdict = result?.verdict ?? null;
	const tag = TAG[verdict ?? "none"];
	const sub = verdict === "fail" && result?.severity ? `${tag.label} - ${result.severity}` : tag.label;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={`${title}: ${sub}. Edit`}
			onPress={onPress}
			style={[styles.row, divided && styles.divided]}
		>
			<View style={[styles.mark, { backgroundColor: tag.bg }]}>
				<VerdictMark verdict={verdict ?? "na"} color={tag.fg} size={16} />
			</View>
			<View style={styles.rowBody}>
				<Text style={styles.rowTitle}>{title}</Text>
				<Text style={[styles.rowSub, { color: tag.fg }]}>{sub}</Text>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	grow: { flex: 1 },
	section: { gap: space.s3 },
	heading: { fontFamily: fonts.bodyMedium, fontSize: 13, letterSpacing: 0.4, textTransform: "uppercase", color: colors.plateMuted },
	tally: { flexDirection: "row", gap: space.s2 },
	cell: { flex: 1, alignItems: "center", paddingVertical: space.s3, borderRadius: radii.md, gap: 2 },
	cellNumber: { fontFamily: fonts.displayHeavy, fontSize: 26 },
	cellLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 0.4, textTransform: "uppercase" },
	notice: {
		backgroundColor: colors.naTint,
		borderLeftWidth: 4,
		borderLeftColor: colors.sevMedium,
		borderRadius: radii.sm,
		padding: space.s3,
		gap: 2,
	},
	noticeBad: { backgroundColor: colors.failTint, borderLeftColor: colors.fail },
	noticeTitle: { fontFamily: fonts.displayHeavy, fontSize: 15, color: colors.plateInk },
	noticeBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateInk },
	row: { flexDirection: "row", alignItems: "center", gap: space.s3, paddingVertical: space.s3, minHeight: 60 },
	divided: { borderTopWidth: 1, borderTopColor: colors.plateEdge },
	mark: { width: 34, height: 34, borderRadius: radii.sm, alignItems: "center", justifyContent: "center" },
	rowBody: { flex: 1, gap: 1 },
	rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	rowSub: { fontFamily: fonts.body, fontSize: 13, textTransform: "capitalize" },
});
