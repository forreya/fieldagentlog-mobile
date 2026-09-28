// Where a tapped link wanted to go, held across the sign-in screen.
//
// A block poster's QR opens fieldagentlog.com/b/<id>. Signed out, the route
// sends you to /login, and the login screen used to send you on to the bare
// signed-in home - the block you scanned was forgotten in between. This holds
// the id for that one hop.
//
// In memory on purpose. A tapped link starts the app, the process stays alive
// through sign-in, and the login screen consumes it straight after. Persisting
// it would mean a scan from last week opening a block on whoever signs in next.

let pendingBlockId: string | null = null;

/** Remember the block a link asked for, to be opened after sign-in. */
export function setPendingBlockId(id: string): void {
	pendingBlockId = id;
}

/** The remembered block id, or null. Clears it - it is honoured once. */
export function takePendingBlockId(): string | null {
	const id = pendingBlockId;
	pendingBlockId = null;
	return id;
}
