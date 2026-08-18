// The way in to reporting an issue, wherever it is offered.
//
// One component rather than three call sites building the same route, because
// the difference between them is exactly one thing - whether the block is
// already known - and that is worth stating once.
//
// The pending line is not decoration. A cleaner who sent three reports from a
// bin store has no other way to tell whether they are still on the phone, and
// "nothing appeared to happen" is how people stop reporting things.

import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { usePendingReports } from "@/data/useReports";
import { colors, fonts, space } from "@/theme/tokens";

export interface ReportButtonProps {
	/** The block, when it is not in question. Omitted only for a cleaner who is
	 *  not checked in anywhere - the screen picks in that case. */
	site?: { id: string; name: string } | null;
	/** The cleaning visit in progress, so the report can be tied to it. */
	attendanceClientId?: string | null;
}

export function ReportButton({ site, attendanceClientId }: ReportButtonProps) {
	const pending = usePendingReports();

	function open() {
		router.push({
			pathname: "/(app)/report",
			params: {
				...(site ? { siteId: site.id, siteName: site.name } : {}),
				...(attendanceClientId ? { attendance: attendanceClientId } : {}),
			},
		});
	}

	return (
		<View style={styles.wrap}>
			<Button label="Report an issue" variant="ghost" block onPress={open} />
			{pending.length > 0 ? (
				<Text style={styles.hint}>
					{pending.length} {pending.length === 1 ? "report" : "reports"} waiting to send - they go when you have signal.
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: { gap: space.s2 },
	hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.plateMuted },
});
