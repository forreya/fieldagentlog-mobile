import { router } from "expo-router";

import type { DeadEndReason } from "@/api/errors";
import { useAuth } from "@/auth/AuthProvider";
import { useHandoff } from "@/cleaner/useHandoff";
import { Button } from "@/components/Button";
import { StatusScreen } from "@/components/StatusScreen";

/**
 * The end of the road for a link. Copy ported verbatim from the web app: it is
 * field-tested, and every variant tells the reader the one thing they can
 * actually do about it - ask for a new link.
 *
 * No retry button. Retrying a spent link only produces the same screen, and
 * offering the option implies the problem might be theirs.
 */
const COPY: Record<DeadEndReason, { title: string; body: string }> = {
	expired: {
		title: "This link has expired",
		body: "Inspection links don't last forever. Ask whoever sent it for a fresh link.",
	},
	used: {
		title: "This visit is already done",
		body: "This link has already been submitted, and each one works only once. Ask for a new link if you need to inspect again.",
	},
	revoked: {
		title: "This link has been turned off",
		body: "It may have been cancelled or replaced. Ask whoever sent it for a new one.",
	},
	invalid: {
		title: "This link isn't valid",
		body: "Check you opened the whole link from your message, or ask for a new one.",
	},
	unknown: {
		title: "This link can't be used",
		body: "It has expired or has already been used. Ask whoever sent it for a new link.",
	},
};

export function DeadEndScreen({ reason, token }: { reason: DeadEndReason; token?: string }) {
	const { state } = useAuth();
	const handoff = useHandoff(token ?? "");
	const { title, body } = COPY[reason] ?? COPY.unknown;

	// Still no retry, for the reason above. But the "nowhere else to be"
	// assumption only held while every visitor arrived by link. Since D3 a
	// signed-in agent can reach this from Start checklist, and stranding them on
	// a screen with no navigation is a different failure from a spent link.
	const signedIn = state.status === "signed_in" || state.status === "role_unknown";

	// A cleaner who hit a dead link mid-visit is not going to "their blocks" -
	// their attendance timer is still running behind this screen, and the way
	// back is the visit they left. Same split as the web DeadEndScreen.
	return (
		<StatusScreen tone="bad" title={title} body={body}>
			{handoff.fromCleaner ? (
				<Button label="Back to your site visit" block onPress={() => handoff.goBack(false)} />
			) : signedIn ? (
				<Button label="Back to your blocks" block onPress={() => router.replace("/(app)")} />
			) : null}
		</StatusScreen>
	);
}
