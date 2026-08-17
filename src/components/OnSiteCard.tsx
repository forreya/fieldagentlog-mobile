import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import type { AttendanceSession } from "@/db/types";
import { colors, fonts, radii, space } from "@/theme/tokens";

/** "1h 04m" / "12m 30s". Seconds only matter in the first hour; after that they
 *  are noise on a card someone glances at. */
export function formatDuration(totalSeconds: number): string {
	const seconds = Math.max(0, totalSeconds);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
	return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Ticks once a second while mounted. Stops when the card unmounts, so a phone
 *  in a pocket is not re-rendering a screen nobody is looking at. */
function useNow(): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	return now;
}

/**
 * The card that says "you are here now".
 *
 * The timer is a comfort, not a record: the duration that counts is the one the
 * server computes from the two stamps. A phone whose clock is wrong should not
 * be able to shorten or lengthen a shift.
 */
export function OnSiteCard({ session, busy, onCheckOut }: { session: AttendanceSession; busy: boolean; onCheckOut: () => void }) {
	const now = useNow();
	const elapsed = Math.round((now - session.check_in.at) / 1000);

	return (
		<View style={styles.card} accessibilityRole="summary" accessibilityLabel={`On site at ${session.site_name}, ${formatDuration(elapsed)} so far`}>
			<View style={styles.head}>
				<View style={styles.id}>
					<Text style={styles.label}>ON SITE</Text>
					<Text style={styles.name}>{session.site_name}</Text>
				</View>
				<Text style={styles.timer}>{formatDuration(elapsed)}</Text>
			</View>

			{/* Said plainly rather than hidden behind a sync icon. Someone who
			    checked in underground should know the record is on the phone. */}
			{session.synced_in ? null : <Text style={styles.pending}>Saved on this phone. It goes up when you have signal.</Text>}

			<Button label="Check out" busy={busy} block onPress={onCheckOut} />
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: colors.plateRaised,
		borderWidth: 1,
		borderColor: colors.signal,
		borderLeftWidth: 4,
		borderRadius: radii.lg,
		padding: space.s4,
		gap: space.s3,
	},
	head: { flexDirection: "row", alignItems: "center", gap: space.s3 },
	id: { flex: 1, gap: 2 },
	label: { fontFamily: fonts.displayHeavy, fontSize: 11, letterSpacing: 1.2, color: colors.signalDeep },
	name: { fontFamily: fonts.displayHeavy, fontSize: 20, color: colors.plateInk },
	timer: { fontFamily: fonts.mono, fontSize: 22, color: colors.plateInk },
	pending: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.plateMuted },
});
