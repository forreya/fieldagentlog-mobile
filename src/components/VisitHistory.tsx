import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { BlockVisit, VisitFailure } from "@/api/agent";
import { colors, fonts, radii, space } from "@/theme/tokens";

/** Failures shown before the rest fold away. A visit that failed everything is
 *  a story for the block screen, not a wall of text on a phone. */
const FAILS_SHOWN = 4;

/** `critical` is the wire's top band; on screen it stays the word the wizard
 *  offers, so the two halves of the app agree. */
export function severityLabel(severity: string): string {
	return severity.toLowerCase() === "critical" ? "Intolerable" : severity;
}

/**
 * The text colour that is readable on that chip.
 *
 * Not a style choice: white on the amber measures 2.47:1, so a "medium" chip
 * was the least legible thing on the screen, and it is the one telling somebody
 * how bad a fire-safety defect is. Dark ink on amber and orange is 7.27 and
 * 5.03; white stays on the grey and the deep red, where it is 5.77 and 7.33.
 */
export function severityTextColour(severity: string): string {
	switch (severity.toLowerCase()) {
		case "medium":
		case "high":
			return colors.plateInk;
		default:
			return colors.plateRaised;
	}
}

export function severityColour(severity: string): string {
	switch (severity.toLowerCase()) {
		case "low":
			return colors.sevLow;
		case "medium":
			return colors.sevMedium;
		case "high":
			return colors.sevHigh;
		case "critical":
		case "intolerable":
			return colors.sevIntolerable;
		default:
			return colors.na;
	}
}

/** "12 Aug 2026" - the date identifies a visit on site; the clock time it was
 *  submitted at rarely does, and it crowds a phone row. */
export function visitDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "Unknown date";
	return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** How long ago, in the units somebody actually says out loud. */
export function howLongAgo(iso: string, now: number = Date.now()): string | null {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return null;
	const days = Math.floor((now - then) / 86_400_000);
	if (days < 0) return null;
	if (days === 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 31) return `${days} days ago`;
	const months = Math.round(days / 30.44);
	if (months < 24) return `${months} month${months === 1 ? "" : "s"} ago`;
	return `${Math.round(days / 365.25)} years ago`;
}

export function VisitHistory({ visits }: { visits: BlockVisit[] }) {
	return (
		<View style={styles.list}>
			{visits.map((visit) => (
				<VisitRow key={visit.id} visit={visit} />
			))}
		</View>
	);
}

function VisitRow({ visit }: { visit: BlockVisit }) {
	const [showAll, setShowAll] = useState(false);
	const recorded = visit.pass + visit.fail + visit.na;
	const ago = howLongAgo(visit.at);
	const fails = showAll ? visit.fails : visit.fails.slice(0, FAILS_SHOWN);
	const hidden = visit.fails.length - fails.length;

	return (
		<View style={styles.visit}>
			<View style={styles.head}>
				<View style={styles.id}>
					<Text style={styles.date}>
						{visitDate(visit.at)}
						{ago ? <Text style={styles.ago}> · {ago}</Text> : null}
					</Text>
					<Text style={styles.who} numberOfLines={1}>
						{visit.inspector_name || "Not recorded"}
						{visit.scope === "cleaner" ? " · cleaner's checks" : ""}
					</Text>
				</View>
				<View style={[styles.chip, visit.fail > 0 ? styles.chipFail : styles.chipOk]}>
					<Text style={[styles.chipText, { color: visit.fail > 0 ? colors.fail : colors.pass }]}>
						{visit.fail > 0 ? `${visit.fail} failed` : "All passed"}
					</Text>
				</View>
			</View>

			{recorded === 0 ? (
				<Text style={styles.none}>No checks were recorded on this visit.</Text>
			) : (
				<View style={styles.tally}>
					<Tally n={visit.pass} label="pass" colour={colors.pass} />
					<Tally n={visit.fail} label="fail" colour={colors.fail} />
					<Tally n={visit.na} label="N/A" colour={colors.na} />
				</View>
			)}

			{fails.map((fail, index) => (
				<FailureRow key={`${visit.id}-${index}`} fail={fail} />
			))}
			{hidden > 0 ? (
				<Pressable accessibilityRole="button" onPress={() => setShowAll(true)} style={styles.more}>
					<Text style={styles.moreText}>
						Show {hidden} more failure{hidden === 1 ? "" : "s"}
					</Text>
				</Pressable>
			) : null}

			{visit.logbook_url ? (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={`Open the logbook for ${visitDate(visit.at)}`}
					onPress={() => void Linking.openURL(visit.logbook_url as string).catch(() => undefined)}
					style={styles.more}
				>
					<Text style={styles.moreText}>Logbook PDF</Text>
				</Pressable>
			) : null}
		</View>
	);
}

function Tally({ n, label, colour }: { n: number; label: string; colour: string }) {
	return (
		<Text style={styles.tallyCell}>
			<Text style={[styles.tallyNumber, { color: colour }]}>{n}</Text> {label}
		</Text>
	);
}

function FailureRow({ fail }: { fail: VisitFailure }) {
	return (
		<View style={styles.fail}>
			<View style={styles.failHead}>
				{fail.severity ? (
					<View style={[styles.sev, { backgroundColor: severityColour(fail.severity) }]}>
						<Text style={[styles.sevText, { color: severityTextColour(fail.severity) }]}>{severityLabel(fail.severity)}</Text>
					</View>
				) : null}
				<Text style={styles.failTitle}>{fail.title}</Text>
			</View>
			{fail.note ? <Text style={styles.failNote}>{fail.note}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: space.s3 },
	visit: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.plateEdge,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s3,
	},
	head: { flexDirection: "row", alignItems: "flex-start", gap: space.s3 },
	id: { flex: 1, gap: 2 },
	date: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.plateInk },
	ago: { fontFamily: fonts.body, color: colors.plateMuted },
	who: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	chip: { paddingVertical: 4, paddingHorizontal: space.s2, borderRadius: radii.sm },
	chipOk: { backgroundColor: colors.passTint },
	chipFail: { backgroundColor: colors.failTint },
	chipText: { fontFamily: fonts.displayHeavy, fontSize: 12 },
	tally: { flexDirection: "row", gap: space.s4 },
	tallyCell: { fontFamily: fonts.body, fontSize: 14, color: colors.plateMuted },
	tallyNumber: { fontFamily: fonts.displayHeavy, fontSize: 15 },
	none: { fontFamily: fonts.body, fontSize: 14, color: colors.plateMuted },
	fail: { gap: 2, borderLeftWidth: 3, borderLeftColor: colors.plateEdgeStrong, paddingLeft: space.s3 },
	failHead: { flexDirection: "row", alignItems: "center", gap: space.s2, flexWrap: "wrap" },
	sev: { paddingVertical: 2, paddingHorizontal: 7, borderRadius: radii.sm },
	sevText: { fontFamily: fonts.displayHeavy, fontSize: 11, textTransform: "capitalize" },
	failTitle: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.plateInk },
	failNote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.plateMuted },
	more: { minHeight: 40, justifyContent: "center" },
	moreText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.signalDeep },
});
