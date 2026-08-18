// "Is this visit the one I was handed off into, and how do I get back?"
//
// Asked by the wizard's terminal screens. Kept as a hook rather than read
// inline because the answer lives in async storage: a screen that read it
// synchronously would flash the wrong affordance on first paint, and the wrong
// affordance here is a dead end.

import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import { endHandoff, isHandoffFor } from "./handoff";

export interface HandoffView {
	/** True once we know this visit came from the cleaner app. Starts false, so
	 *  nothing is offered until the answer is in. */
	fromCleaner: boolean;
	/** Go back, and say whether the checks were submitted on the way. */
	goBack: (submitted: boolean) => void;
}

export function useHandoff(token: string): HandoffView {
	const [fromCleaner, setFromCleaner] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void isHandoffFor(token).then((hit) => {
			if (!cancelled) setFromCleaner(hit);
		});
		return () => {
			cancelled = true;
		};
	}, [token]);

	const goBack = useCallback((submitted: boolean) => {
		// The catch matters: being stranded in the wizard is the failure worth
		// avoiding, and a marker we could not clear is scoped to one token and
		// harmless. Without it the rejection escapes through .finally().
		void endHandoff(submitted)
			.catch(() => undefined)
			.finally(() => {
				// Replace, not push: the visit behind us is finished or abandoned,
				// and swiping back into it would be a dead end either way.
				router.replace("/(app)");
			});
	}, []);

	return { fromCleaner, goBack };
}
