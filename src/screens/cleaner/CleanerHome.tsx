import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { CleanerSite } from "@/api/cleaner";
import { useAuth } from "@/auth/AuthProvider";
import { Banner } from "@/components/Banner";
import { Button } from "@/components/Button";
import { DutiesCard } from "@/components/DutiesCard";
import { FindBar } from "@/components/FindBar";
import { Note } from "@/components/Note";
import { AppMenu } from "@/components/AppMenu";
import { OnSiteCard, formatDuration } from "@/components/OnSiteCard";
import { ReportButton } from "@/components/ReportButton";
import { Screen } from "@/components/Screen";
import { StaleNote } from "@/components/StaleNote";
import { SiteCard } from "@/components/SiteCard";
import { StatusPill } from "@/components/StatusPill";
import { freshnessLabel } from "@/data/useDashboard";
import { useFind } from "@/data/useFind";
import { useAttendance, type AttendanceView } from "@/cleaner/useAttendance";
import { useChecksSubmitted } from "@/cleaner/useChecksSubmitted";
import { useDuties, type DutiesView } from "@/data/useDuties";
import { useSites, type SitesView } from "@/data/useSites";
import { useSyncStatus } from "@/sync/useSyncStatus";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * The cleaner's home: the sites their company covers, and how many fire checks
 * are theirs to do at each.
 *
 * A cleaner's relationship with this app is different from an agent's. An agent
 * is sent to a block to inspect it; a cleaner attends the same handful of sites
 * every week and the fire checks are a small part of being there. So this lists
 * sites rather than work, and the duty count is a footnote on each rather than
 * the headline.
 *
 * Tapping a site checks in there.
 */
export function CleanerHome() {
	const { state } = useAuth();
	const sync = useSyncStatus();
	const sites = useSites();
	const email = state.status === "signed_in" ? (state.user.email ?? undefined) : undefined;
	const attendance = useAttendance(email ?? null);
	const duties = useDuties(attendance.active?.site_id ?? null);
	const checksSubmitted = useChecksSubmitted();

	return (
		<Screen
			title="Site visits"
			sub="Your cleaning sites"
			action={
				<View style={styles.bar}>
					<StatusPill {...sync} />
					<AppMenu />
				</View>
			}
			signedInAs={email}
			scroll={false}
		>
			<Body sites={sites} attendance={attendance} duties={duties} checksSubmitted={checksSubmitted} />
		</Screen>
	);
}

/** Stable empty list, so the finder does not re-run while the sites load. */
const NO_SITES: CleanerSite[] = [];

interface BodyProps {
	sites: SitesView;
	attendance: AttendanceView;
	duties: DutiesView;
	checksSubmitted: { hit: boolean; dismiss: () => void };
}

function Body({ sites, attendance, duties, checksSubmitted }: BodyProps) {
	const find = useFind(sites.sites ?? NO_SITES);

	return (
		<ScrollView
			contentContainerStyle={styles.list}
			refreshControl={<RefreshControl refreshing={sites.refreshing} onRefresh={sites.refresh} tintColor={colors.signal} />}
		>
			{/* Everything above the list is LOCAL state, so it renders whatever the
			    server is doing. This used to sit below an early return for a failed
			    sites load, which meant a cleaner who lost signal while checked in
			    could not see their timer or the button to check out - the one thing
			    they must always be able to do. */}
			{checksSubmitted.hit ? (
				<Banner
					tone="ok"
					text={`Fire-safety checks submitted - they're in the site's fire logbook.${
						attendance.active ? " You're still checked in here: check out below when you leave." : ""
					}`}
					onDismiss={checksSubmitted.dismiss}
				/>
			) : null}
			<AttendanceBanners attendance={attendance} />
			<OnSite attendance={attendance} duties={duties} />

			<SiteList sites={sites} find={find} attendance={attendance} />
		</ScrollView>
	);
}

/** The list of sites, and the three states it can be in. Separate from the
 *  attendance UI above it: one is the server's answer, the other is the
 *  device's own, and a failure in the first must not hide the second. */
function SiteList({ sites, find, attendance }: { sites: SitesView; find: ReturnType<typeof useFind<CleanerSite>>; attendance: AttendanceView }) {
	const { sites: data, loading, error, updatedAt, refresh } = sites;

	if (loading) return <Note title="Loading your sites" body="This only takes a moment." />;

	// Nothing cached and nothing came back. The broker's own refusal is the
	// message here - "Your account is not active. Ask your managing agent." is
	// the one thing a cleaner locked out on a doorstep needs to read.
	if (!data) {
		return (
			<Note title="Couldn't load your sites" body={error ?? "Something went wrong."}>
				<Button label="Try again" variant="ghost" onPress={refresh} />
			</Note>
		);
	}

	if (data.length === 0) {
		return (
			<Note
				title="No sites yet"
				body="When your cleaning company is assigned to a building, it appears here. Ask your managing agent if you expected one."
			/>
		);
	}

	return (
		<>
			{/* Not checked in anywhere, so the composer asks which site. Offered
			    only when there is at least one - a picker over nothing is a dead
			    end dressed up as an option. */}
			{attendance.active ? null : <ReportButton />}
			<Summary sites={data} showStamp={!error} updatedAt={updatedAt} />
			{error ? <StaleNote message={error} updatedAt={updatedAt} /> : null}
			{data.length > 3 ? (
				<FindBar
					query={find.query}
					onQuery={find.setQuery}
					near={find.near}
					onToggleNear={find.toggleNear}
					error={find.error}
					showing={{ shown: find.results.length, total: data.length }}
				/>
			) : null}
			{find.results.length === 0 ? (
				<Note title="Nothing matches that" body="Try part of the name, the street or the postcode." />
			) : (
				find.results.map((site) => (
					<SiteCard
						key={site.id}
						site={site}
						distanceKm={find.distances.get(site.id)}
						// One site at a time. Checking in somewhere else while already
						// on site would leave two open sessions and no honest answer
						// for where the person actually was.
						disabled={attendance.active !== null || attendance.busy || attendance.startingChecks}
						onOpen={() => void attendance.checkIn(site.id, site.name)}
					/>
				))
			)}
		</>
	);
}

/** What just happened: a fix that failed, or a visit that closed. */
function AttendanceBanners({ attendance }: { attendance: AttendanceView }) {
	const closed = attendance.justClosed;
	return (
		<>
			{attendance.error ? <Banner tone="bad" text={attendance.error} onDismiss={attendance.dismissError} /> : null}
			{closed ? (
				<Banner
					tone="ok"
					text={`Checked out of ${closed.site_name} - ${formatDuration(
						Math.round(((closed.check_out?.at ?? 0) - closed.check_in.at) / 1000),
					)} on site.${closed.synced_out ? "" : " It goes up when you have signal."}`}
					onDismiss={attendance.dismissClosed}
				/>
			) : null}
		</>
	);
}

/** Everything that only exists while somebody is standing in a building. */
function OnSite({ attendance, duties }: { attendance: AttendanceView; duties: DutiesView }) {
	const session = attendance.active;
	if (!session) return null;
	return (
		<>
			<OnSiteCard session={session} busy={attendance.busy} onCheckOut={() => void attendance.checkOut()} />
			<DutiesCard duties={duties.duties} busy={attendance.startingChecks} onStart={() => void attendance.startChecks()} />
			{/* The block is not in question here, and the report is tied to the
			    visit in progress - the local id, because a check-in still sitting
			    in the queue has no server id yet and the broker links it later. */}
			<ReportButton site={{ id: session.site_id, name: session.site_name }} attendanceClientId={session.local_id} />
		</>
	);
}

function Summary({ sites, showStamp, updatedAt }: { sites: CleanerSite[]; showStamp: boolean; updatedAt: number | null }) {
	const due = sites.reduce((total, site) => total + site.duties_due, 0);
	return (
		<View style={styles.summary}>
			<Text style={styles.counts}>
				<Text style={styles.strong}>{sites.length}</Text> {sites.length === 1 ? "site" : "sites"}
				{due > 0 ? (
					<Text style={styles.due}>
						{" "}
						· {due} fire {due === 1 ? "check" : "checks"} due
					</Text>
				) : null}
			</Text>
			{showStamp ? <Text style={styles.stamp}>{freshnessLabel(updatedAt)}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	bar: { flexDirection: "row", alignItems: "center", gap: space.s2 },
	list: { gap: space.s3, paddingBottom: space.s6 },
	summary: { gap: 2 },
	counts: { fontFamily: fonts.body, fontSize: 15, color: colors.plateInk },
	strong: { fontFamily: fonts.displayHeavy },
	due: { fontFamily: fonts.bodyMedium, color: colors.signalDeep },
	stamp: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
});
