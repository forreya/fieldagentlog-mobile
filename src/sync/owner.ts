// Who queued work belongs to, and whether it may be pushed right now.
//
// The broker functions attribute every write to the JWT that carries it: a
// report queued by one account and pushed under another is FILED as the second
// account, and a check-out for another account's session is refused outright.
// Shared devices are normal here, so the queues carry the id of the user who
// captured each row, and a source only offers a row while that user's session
// is the live one. Anything else stays safely pending - not failed, not sent
// as somebody else - until its owner signs back in.
//
// The auth layer pushes the current owner in (the same direction as
// requestSync); sync never imports auth. Null means "no session, or not known
// yet" - on a cold start the app-start pass runs before the stored session is
// adopted, and holding owned work for that one pass costs nothing because
// adopting the session immediately triggers another.
//
// Visit records are deliberately NOT gated: the wizard authenticates with the
// per-visit token, not a session, and must keep working signed out.

let ownerId: string | null = null;

/** Wired by the auth layer whenever the session changes. */
export function setQueueOwner(id: string | null): void {
	ownerId = id;
}

/** The signed-in user id, or null when there is no session to push under. */
export function queueOwner(): string | null {
	return ownerId;
}

/**
 * Whether a queued row may be offered to the engine right now.
 *
 * A row with no recorded owner predates ownership (or was captured by a build
 * without it) and keeps the old behaviour: it goes up under whoever is signed
 * in. Holding those forever would be data loss; sending them is exactly what
 * every install did before this existed.
 */
export function ownedByQueueOwner(rowOwner: string | null | undefined): boolean {
	if (rowOwner == null) return true;
	return rowOwner === ownerId;
}

/** The same rule for screens, which know their own user. Kept beside the
 *  engine's version so the two can never drift. */
export function visibleToUser(rowOwner: string | null | undefined, userId: string | null): boolean {
	if (rowOwner == null) return true;
	return rowOwner === userId;
}
