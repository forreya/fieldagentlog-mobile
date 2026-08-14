import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import { Card, Screen } from "@/components/Screen";
import { StatusPill } from "@/components/StatusPill";
import { TextField } from "@/components/TextField";
import type { VisitRecord } from "@/db/types";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";
import { blockNameOf, packetOf } from "@/visit/wizard";

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
interface Props {
	record: VisitRecord;
	/** The packet came from this device, so it may be out of date. */
	fromCache: boolean;
	onStart: (name: string, email: string) => void;
}

export function VisitIntro({ record, fromCache, onStart }: Props) {
	const packet = packetOf(record);
	const { visit } = packet;
	const total = packet.checks?.length ?? 0;
	const sync = useSyncStatus();

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
			title={blockNameOf(record)}
			sub="Fire-safety inspection"
			action={<StatusPill {...sync} />}
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

			{fromCache || !sync.online ? <OfflineNotice /> : null}

			<Card>
				<TextField
					label="Your name"
					value={name}
					onChange={setName}
					placeholder="e.g. Sam Okonkwo"
					error={tried && !nameOk ? "Please enter your name." : null}
					autoCapitalize="words"
				/>
				<TextField
					label="Your email"
					value={email}
					onChange={setEmail}
					placeholder="you@company.co.uk"
					error={tried && !emailOk ? "Please enter a valid email address." : null}
					keyboardType="email-address"
					inputMode="email"
					autoCapitalize="none"
				/>
				<Text style={styles.hint}>We use this to sign the inspection record. It goes on the report - nowhere else.</Text>
			</Card>
		</Screen>
	);
}

/** Said whenever the packet came from this device or the signal has gone. It
 *  is the difference between "this app is broken" and "carry on, it will send
 *  itself" - the web app shows it in the same two cases. */
function OfflineNotice() {
	return (
		<Card>
			<Text style={styles.noticeTitle}>You&apos;re working offline</Text>
			<Text style={styles.hint}>Your answers are saved on this device and will send themselves when you&apos;re back online.</Text>
		</Card>
	);
}

const styles = StyleSheet.create({
	eyebrow: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", color: colors.plateMuted },
	blockName: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.plateInk },
	addr: { fontFamily: fonts.body, fontSize: 15, color: colors.plateMuted },
	due: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.signalDeep, marginTop: space.s2 },
	noticeTitle: { fontFamily: fonts.displayHeavy, fontSize: 16, color: colors.plateInk },
	hint: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
