import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import type { CleanerSite } from "@/api/cleaner";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { FindBar } from "@/components/FindBar";
import { Note } from "@/components/Note";
import { Screen } from "@/components/Screen";
import { SiteCard } from "@/components/SiteCard";
import { StatusPill } from "@/components/StatusPill";
import { freshnessLabel } from "@/data/useDashboard";
import { useFind } from "@/data/useFind";
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
 * Checking in, the duties themselves and reporting an issue arrive in E2 and
 * E3. Until then a site opens nothing, which is why the cards do not pretend to
 * be links to somewhere.
 */
export function CleanerHome() {
	const { state, signOut } = useAuth();
	const sync = useSyncStatus();
	const sites = useSites();
	const email = state.status === "signed_in" ? (state.user.email ?? undefined) : undefined;

	return (
		<Screen
			title="Site visits"
			sub="Your cleaning sites"
			action={<StatusPill {...sync} />}
			signedInAs={email}
			scroll={false}
			footer={<Button label="Sign out" variant="ghostDark" block onPress={() => void signOut()} />}
		>
			<Body sites={sites} />
		</Screen>
	);
}

/** Stable empty list, so the finder does not re-run while the sites load. */
const NO_SITES: CleanerSite[] = [];

function Body({ sites }: { sites: SitesView }) {
	const { sites: data, loading, refreshing, error, updatedAt, refresh } = sites;
	const find = useFind(data ?? NO_SITES);

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

	return (
		<ScrollView
			contentContainerStyle={styles.list}
			refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.signal} />}
		>
			<Summary sites={data} showStamp={!error} updatedAt={updatedAt} />
			{error ? <Stale message={error} updatedAt={updatedAt} /> : null}

			{data.length === 0 ? (
				<Note
					title="No sites yet"
					body="When your cleaning company is assigned to a building, it appears here. Ask your managing agent if you expected one."
				/>
			) : (
				<>
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
						find.results.map((site) => <SiteCard key={site.id} site={site} distanceKm={find.distances.get(site.id)} onOpen={() => undefined} />)
					)}
				</>
			)}
		</ScrollView>
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

/** The refresh failed but there is still a usable list underneath. */
function Stale({ message, updatedAt }: { message: string; updatedAt: number | null }) {
	return (
		<View style={styles.stale}>
			<Text style={styles.staleTitle}>Showing what was saved here</Text>
			<Text style={styles.staleBody}>
				{message} {freshnessLabel(updatedAt)}.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	list: { gap: space.s3, paddingBottom: space.s6 },
	summary: { gap: 2 },
	counts: { fontFamily: fonts.body, fontSize: 15, color: colors.plateInk },
	strong: { fontFamily: fonts.displayHeavy },
	due: { fontFamily: fonts.bodyMedium, color: colors.signalDeep },
	stamp: { fontFamily: fonts.body, fontSize: 13, color: colors.plateMuted },
	stale: { backgroundColor: colors.naTint, borderLeftWidth: 4, borderLeftColor: colors.sevMedium, borderRadius: 8, padding: space.s3, gap: 2 },
	staleTitle: { fontFamily: fonts.displayHeavy, fontSize: 15, color: colors.plateInk },
	staleBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.plateInk },
});
