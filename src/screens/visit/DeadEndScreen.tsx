import type { DeadEndReason } from "@/api/errors";
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

export function DeadEndScreen({ reason }: { reason: DeadEndReason }) {
	const { title, body } = COPY[reason] ?? COPY.unknown;
	return <StatusScreen tone="bad" title={title} body={body} />;
}
