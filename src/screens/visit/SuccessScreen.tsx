import { useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";

import { Button } from "@/components/Button";
import { StatusScreen } from "@/components/StatusScreen";
import type { VisitRecord } from "@/db/types";
import { colors, fonts } from "@/theme/tokens";

type Submitted = NonNullable<VisitRecord["submitted"]>;

/**
 * The end of a visit, and the last thing an inspector sees.
 *
 * Terminal by design: there is no way back into the wizard from here, because
 * the visit is locked server-side the moment it is accepted. Reopening the same
 * link later lands on this same screen from the cached record.
 *
 * The logbook opens in the system browser rather than in the app. It is a
 * signed URL to a PDF that people forward, print and file, and every phone
 * already has a viewer that can do all three.
 */
export function SuccessScreen({ blockName, submitted }: { blockName?: string; submitted: Submitted }) {
	const [failed, setFailed] = useState(false);

	async function openLogbook() {
		try {
			await Linking.openURL(submitted.logbook_pdf_url);
		} catch {
			// No handler, or the signed link has aged out. Saying so beats a
			// button that silently does nothing.
			setFailed(true);
		}
	}

	return (
		<StatusScreen
			title="Inspection submitted"
			body={`${blockName ? `${blockName} is done.` : "All done."} The record has been sent and signed. There's nothing else you need to do.`}
		>
			{submitted.logbook_pdf_url ? (
				<Button label="Open the logbook (PDF)" size="lg" block onPress={() => void openLogbook()} />
			) : (
				<Text style={styles.note}>The logbook PDF will be available shortly.</Text>
			)}
			{failed ? <Text style={styles.note}>The logbook wouldn&apos;t open on this phone. The inspection itself is safely recorded.</Text> : null}
			<Text style={styles.note}>This visit is now locked.</Text>
		</StatusScreen>
	);
}

const styles = StyleSheet.create({
	note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.mutedOnDark, textAlign: "center" },
});
