// The cleaner's half of the broker.
//
// A cleaner has no database access at all, the same as an agent, but the
// scoping rule is different and worth stating: assignments belong to the
// cleaning COMPANY, not the person. Everyone at Example Cleaning Co sees the
// same sites. Nothing here filters by user, and adding such a filter would
// quietly diverge from how BalanceBuddy actually models the relationship.

import { callBroker } from "./broker";

export interface CleanerSite {
	id: string;
	name: string;
	/** Composed server-side from the structured address columns. */
	address: string | null;
	/** Fire checks this site's cleaners are responsible for and that are due
	 *  now. Not every check is a cleaner's job, and a check due next month is
	 *  not a duty yet, so this is smaller than the block's total. */
	duties_due: number;
}

export async function loadCleanerSites(): Promise<CleanerSite[]> {
	const res = await callBroker<{ sites?: CleanerSite[] }>("cleaner", { action: "my-sites" });
	return res.sites ?? [];
}
