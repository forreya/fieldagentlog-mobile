import { StyleSheet, Text, View } from "react-native";

import { DueChip, FrequencyBadge, RefTag } from "@/components/Badges";
import { Button } from "@/components/Button";
import { PhotoCapture } from "@/components/PhotoCapture";
import { Card, Screen } from "@/components/Screen";
import { LeaveInspection } from "@/components/LeaveInspection";
import { StatusPill } from "@/components/StatusPill";
import { TextField } from "@/components/TextField";
import { SeveritySelect, VerdictControl } from "@/components/VerdictControl";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";
import { discardPhoto } from "@/visit/photos";
import { blockNameOf, checksOf, currentCheck, failIsComplete, resultFor, type WizardAction, type WizardState } from "@/visit/wizard";

/**
 * One check, one screen.
 *
 * Advancing is blocked until the verdict is complete: a failure needs a
 * severity and a note, because a logbook entry saying only "failed" tells
 * whoever has to fix it nothing. The photo stays optional - not everything
 * worth failing is photographable.
 */
export function CheckStep({ state, dispatch }: { state: WizardState; dispatch: (a: WizardAction) => void }) {
	const check = currentCheck(state);
	const checks = checksOf(state.record);
	const sync = useSyncStatus();
	if (!check) return null;

	const result = resultFor(state, check.id);
	const isFail = result.verdict === "fail";
	const canAdvance = result.verdict !== null && failIsComplete(result);
	const isLast = state.checkIndex === checks.length - 1;
	const answered = checks.filter((c) => state.record.results[c.id]?.verdict).length;

	return (
		<Screen
			title={blockNameOf(state.record)}
			sub={`Check ${state.checkIndex + 1} of ${checks.length} · ${answered} answered`}
			action={
				<View style={styles.bar}>
					<StatusPill {...sync} />
					<LeaveInspection onLeave={() => dispatch({ type: "GO_INTRO" })} />
				</View>
			}
			footer={
				<>
					<Button label="Back" variant="ghostDark" onPress={() => dispatch({ type: "BACK" })} />
					<Button label={isLast ? "Review" : "Next"} disabled={!canAdvance} block onPress={() => dispatch({ type: "NEXT" })} style={styles.grow} />
				</>
			}
		>
			<Card>
				<View style={styles.meta}>
					<FrequencyBadge label={check.freq_label} />
					<DueChip status={check.status} label={check.status_label} />
				</View>
				{check.standard_ref ? <RefTag>{check.standard_ref}</RefTag> : null}
				{check.code ? <Text style={styles.code}>{check.code}</Text> : null}
				<Text style={styles.title}>{check.title}</Text>
				{check.todo ? <Text style={styles.todo}>{check.todo}</Text> : null}
				{check.responsibility ? <Text style={styles.resp}>Responsible: {check.responsibility}</Text> : null}
			</Card>

			<VerdictControl
				value={result.verdict}
				onChange={(verdict) => {
					// The reducer clears the answer's photo reference on leaving Fail;
					// the queued file and row must go with it, or the bytes upload for
					// a check that no longer cites them (FIND-013).
					if (verdict !== "fail" && result.photo_local_id) void discardPhoto(result.photo_local_id);
					dispatch({ type: "SET_VERDICT", checkId: check.id, verdict });
				}}
			/>

			{isFail ? <FailDetail state={state} dispatch={dispatch} checkId={check.id} /> : null}
		</Screen>
	);
}

/** Everything a failure needs before it can be recorded: severity, a note
 *  saying what is wrong, and optionally a photo. Split out because the check
 *  screen is otherwise doing two jobs. */
function FailDetail({ state, dispatch, checkId }: { state: WizardState; dispatch: (a: WizardAction) => void; checkId: string }) {
	const result = resultFor(state, checkId);
	return (
		<Card>
			<Text style={styles.label}>
				Severity <Text style={styles.required}>- required</Text>
			</Text>
			<SeveritySelect value={result.severity} onChange={(severity) => dispatch({ type: "SET_SEVERITY", checkId, severity })} />

			<TextField
				label="What's wrong?"
				requirement="required"
				value={result.note}
				onChange={(note) => dispatch({ type: "SET_NOTE", checkId, note })}
				placeholder="Describe the fault so it can be fixed."
				multiline
			/>

			<Text style={styles.label}>
				Photo <Text style={styles.optional}>- optional</Text>
			</Text>
			<PhotoCapture
				token={state.record.token}
				checkId={checkId}
				result={result}
				onCaptured={(localId) => dispatch({ type: "SET_PHOTO", checkId, localId })}
				onCleared={() => dispatch({ type: "CLEAR_PHOTO", checkId })}
			/>
		</Card>
	);
}

const styles = StyleSheet.create({
	bar: { flexDirection: "row", alignItems: "center", gap: space.s2 },
	meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s2 },
	code: { fontFamily: fonts.mono, fontSize: 12, color: colors.plateMuted },
	title: { fontFamily: fonts.displayHeavy, fontSize: 21, color: colors.plateInk, lineHeight: 27 },
	todo: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.plateInk },
	resp: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	label: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", color: colors.plateMuted },
	required: { color: colors.fail, letterSpacing: 0 },
	optional: { color: colors.plateMuted, letterSpacing: 0 },
	grow: { flex: 1 },
});
