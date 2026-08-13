// One place that hears "the session is no longer good", so the reaction is
// written once instead of at every call site.
//
// gena-mobile's lesson: it calls handleSessionExpired() by hand from about four
// of the many places that can see a 401, so everywhere else a dead session
// looks like a generic loading failure. Here the broker client raises it
// automatically and the auth layer (phase B6) subscribes.
//
// Direction of dependency matters: api/ knows nothing about auth, storage or
// navigation - it only announces. Whoever cares, listens.
//
// What a listener must NOT do is clear the offline queue. A cleaner whose
// session expired mid-shift still has un-synced attendance on the device; it
// is keyed for idempotent replay and must survive signing back in.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Subscribe to session expiry. Returns an unsubscribe function. */
export function onSessionExpired(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Announce that the session is dead. Called by the broker client on a 401.
 *
 * Listener failures are swallowed deliberately: this fires from inside a failed
 * request, and a throwing listener would replace a clear "please sign in again"
 * with an unrelated crash.
 */
export function notifySessionExpired(): void {
	for (const listener of [...listeners]) {
		try {
			listener();
		} catch {
			/* a broken listener must not mask the original auth failure */
		}
	}
}

/** Test seam: drop every listener. */
export function resetSessionListeners(): void {
	listeners.clear();
}
