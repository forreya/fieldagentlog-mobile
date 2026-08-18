import { goBack } from "@/lib/nav";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DueChip, FrequencyBadge, RefTag } from "@/components/Badges";
import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { SeveritySelect, VerdictControl } from "@/components/VerdictControl";
import { StatusPill } from "@/components/StatusPill";
import type { Severity, Verdict } from "@/api/contract";
import { colors, fonts, space, TAP_VERDICT } from "@/theme/tokens";

/**
 * Every token and primitive on one screen, so styling is settled once and
 * checked on both platforms rather than argued about per feature. Dev-only:
 * nothing links here from the shipped flows.
 */
export function Gallery() {
	const [verdict, setVerdict] = useState<Verdict | null>(null);
	const [severity, setSeverity] = useState<Severity | null>(null);

	return (
		<Screen
			title="Gallery"
			sub="Tokens and primitives"
			action={<StatusPill online syncing />}
			footer={<Button label="Back" variant="ghostDark" onPress={() => goBack("/")} block />}
		>
			<Section title="Buttons">
				<Button label="Primary action" onPress={noop} />
				<Button label="Ghost" variant="ghost" onPress={noop} />
				<Button label="Large" size="lg" onPress={noop} />
				<Button label="Small" size="sm" onPress={noop} />
				<Button label="Busy" busy onPress={noop} />
				<Button label="Disabled" disabled onPress={noop} />
			</Section>

			<Section title="Badges and chips">
				<View style={styles.row}>
					<FrequencyBadge label="Monthly" />
					<DueChip status="overdue" label="Overdue by 12 days" />
				</View>
				<View style={styles.row}>
					<DueChip status="due_now" label="Due today" />
					<DueChip status="ok" label="Scheduled" />
				</View>
				<RefTag>BS 5266-1</RefTag>
			</Section>

			<Section title="Verdict control">
				<VerdictControl value={verdict} onChange={setVerdict} />
				<Text style={styles.note}>Tap targets {TAP_VERDICT}pt. Shape + word, never colour alone.</Text>
			</Section>

			<Section title="Severity ramp (shown on a failure)">
				<SeveritySelect value={severity} onChange={setSeverity} />
			</Section>

			<Section title="Verdict colours">
				<View style={styles.row}>
					<Swatch label="PASS" bg={colors.passTint} fg={colors.pass} />
					<Swatch label="FAIL" bg={colors.failTint} fg={colors.fail} />
					<Swatch label="N/A" bg={colors.naTint} fg={colors.na} />
				</View>
				<Text style={styles.note}>Always icon + word, never colour alone. Targets {TAP_VERDICT}pt.</Text>
			</Section>

			<Section title="Severity ramp">
				<View style={styles.row}>
					<Swatch label="Low" bg={colors.sevLow} fg={colors.textOnDark} />
					<Swatch label="Medium" bg={colors.sevMedium} fg={colors.ink} />
					<Swatch label="High" bg={colors.sevHigh} fg={colors.ink} />
					<Swatch label="Intolerable" bg={colors.sevIntolerable} fg={colors.textOnDark} />
				</View>
			</Section>

			<Section title="Type">
				<Text style={styles.display}>Archivo display 800</Text>
				<Text style={styles.body}>Archivo body 400 - the working text size for on-site reading.</Text>
				<Text style={styles.mono}>IBMPlexMono 500 / EL_MONTHLY</Text>
			</Section>
		</Screen>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<Card>
			<Text style={styles.sectionTitle}>{title}</Text>
			{children}
		</Card>
	);
}

function Swatch({ label, bg, fg }: { label: string; bg: string; fg: string }) {
	return (
		<View style={[styles.swatch, { backgroundColor: bg }]}>
			<Text style={[styles.swatchText, { color: fg }]}>{label}</Text>
		</View>
	);
}

const noop = () => {};

const styles = StyleSheet.create({
	row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.s2 },
	sectionTitle: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.plateMuted },
	swatch: { paddingVertical: space.s3, paddingHorizontal: space.s4, borderRadius: 8 },
	swatchText: { fontFamily: fonts.displayHeavy, fontSize: 13, letterSpacing: 0.6 },
	note: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	display: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.plateInk },
	body: { fontFamily: fonts.body, fontSize: 15, color: colors.plateInk, lineHeight: 22 },
	mono: { fontFamily: fonts.mono, fontSize: 14, color: colors.plateInk },
});
