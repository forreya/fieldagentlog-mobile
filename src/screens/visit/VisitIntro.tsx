import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import type { VisitPacket } from "@/api/contract";
import type { VisitRecord } from "@/db/types";
import { colors, fonts, space, TAP } from "@/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDue(raw: string): string {
	if (!raw) return "";
	const [y, m, d] = raw.split("-").map(Number);
	if (!y || !m || !d) return raw;
	return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Who is doing this inspection, before anything is recorded.
 *
 * Name and email are required because they go on the logbook: a compliance
 * record that cannot say who signed it is worth very little. Validation shows
 * only after the first attempt, so nobody is scolded for a form they have not
 * filled in yet.
 */
export function VisitIntro({ record, onStart }: { record: VisitRecord; onStart: (name: string, email: string) => void }) {
	const packet = record.packet as VisitPacket;
	const { visit } = packet;
	const total = packet.checks?.length ?? 0;

	const [name, setName] = useState(record.inspector.name);
	const [email, setEmail] = useState(record.inspector.email);
	const [tried, setTried] = useState(false);

	const nameOk = name.trim().length > 0;
	const emailOk = EMAIL_RE.test(email.trim());

	function start() {
		setTried(true);
		if (!nameOk || !emailOk) return;
		onStart(name.trim(), email.trim());
	}

	const due = formatDue(visit.due_date);

	return (
		<Screen
			title={visit.block_name || "Inspection"}
			sub="Fire-safety inspection"
			footer={<Button label="Start inspection" size="lg" block onPress={start} />}
		>
			<Card>
				<Text style={styles.eyebrow}>On-site visit</Text>
				<Text style={styles.blockName}>{visit.block_name}</Text>
				{visit.block_address ? <Text style={styles.addr}>{visit.block_address}</Text> : null}
				<Text style={styles.due}>
					{total} {total === 1 ? "check" : "checks"} due{due ? ` · due ${due}` : ""}
				</Text>
			</Card>

			<Card>
				<Field
					label="Your name"
					value={name}
					onChange={setName}
					placeholder="First and last name"
					error={tried && !nameOk ? "Please enter your name." : null}
					autoCapitalize="words"
				/>
				<Field
					label="Your email"
					value={email}
					onChange={setEmail}
					placeholder="you@example.com"
					error={tried && !emailOk ? "Please enter a valid email address." : null}
					keyboardType="email-address"
					autoCapitalize="none"
				/>
				<Text style={styles.hint}>Both go on the logbook entry for this visit.</Text>
			</Card>
		</Screen>
	);
}

function Field({
	label,
	value,
	onChange,
	placeholder,
	error,
	keyboardType,
	autoCapitalize,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder: string;
	error: string | null;
	keyboardType?: "email-address";
	autoCapitalize?: "none" | "words";
}) {
	return (
		<View style={styles.field}>
			<Text style={styles.label}>{label}</Text>
			<TextInput
				accessibilityLabel={label}
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={colors.plateMuted}
				keyboardType={keyboardType}
				autoCapitalize={autoCapitalize}
				autoCorrect={false}
				style={[styles.input, error ? styles.inputBad : null]}
			/>
			{error ? <Text style={styles.error}>{error}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	eyebrow: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.plateMuted },
	blockName: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.plateInk },
	addr: { fontFamily: fonts.body, fontSize: 15, color: colors.plateMuted },
	due: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.signalDeep, marginTop: space.s2 },
	field: { gap: space.s2 },
	label: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", color: colors.plateMuted },
	input: {
		minHeight: TAP,
		borderWidth: 1,
		borderColor: colors.plateEdgeStrong,
		borderRadius: 10,
		paddingHorizontal: space.s3,
		fontFamily: fonts.body,
		fontSize: 16,
		color: colors.plateInk,
		backgroundColor: colors.plate,
	},
	inputBad: { borderColor: colors.fail, borderWidth: 2 },
	error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fail },
	hint: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
