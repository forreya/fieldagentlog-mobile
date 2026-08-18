// "Did the checks land while I was away?"
//
// Read once when the cleaner home mounts, and cleared as it is read: this
// announces an event, and a banner that reappears every time the screen
// remounts stops meaning anything.

import { useCallback, useEffect, useState } from "react";

import { consumeChecksSubmitted } from "./handoff";

export function useChecksSubmitted(): { hit: boolean; dismiss: () => void } {
	const [hit, setHit] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void consumeChecksSubmitted().then((value) => {
			if (!cancelled && value) setHit(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return { hit, dismiss: useCallback(() => setHit(false), []) };
}
