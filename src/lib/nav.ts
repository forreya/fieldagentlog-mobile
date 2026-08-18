// Going back, when there may be nothing to go back to.
//
// `router.back()` assumes this screen was pushed onto something. That holds
// when you tapped your way here, and fails the moment a screen is entered
// directly - a deep link, a notification tap (Milestone G), or the app being
// resumed onto a restored route. Expo Router answers a back() with no history
// by logging "The action 'GO_BACK' was not handled", and the button does
// nothing at all.
//
// A dead Back button is a small bug on the screens people push into, and a trap
// on the ones a notification can open cold.

import { router, type Href } from "expo-router";

/** Back if there is a back; otherwise the signed-in home. */
export function goBack(fallback: Href = "/(app)"): void {
	if (router.canGoBack()) {
		router.back();
		return;
	}
	router.replace(fallback);
}
