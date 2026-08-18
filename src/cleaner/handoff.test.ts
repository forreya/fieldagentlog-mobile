// The marker that joins the cleaner app to the wizard.
//
// The requirement that shapes it: this must survive the app being killed
// mid-visit. The web equivalent uses sessionStorage and does not - here a
// cleaner in a stairwell whose phone dies must still find the way back.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearHandoff, consumeChecksSubmitted, endHandoff, isHandoffFor, markHandoff, readHandoff } from "./handoff";

beforeEach(async () => {
	await AsyncStorage.clear();
});

test("a handoff is remembered with the site it came from", async () => {
	await markHandoff({ token: "tok-1", siteName: "Elm Court" });

	expect(await readHandoff()).toEqual({ token: "tok-1", siteName: "Elm Court" });
});

test("it lives in storage, not in memory - which is what survives a force-stop", async () => {
	// The E3 requirement is that a cleaner whose phone dies mid-visit still
	// finds the way back. That cannot be proven by reloading the module here
	// (jest.resetModules swaps the AsyncStorage mock too, so the "restarted"
	// module reads an empty store), so assert the property that makes it true:
	// nothing is held in module scope, and the value is on disk under its key.
	await markHandoff({ token: "tok-1", siteName: "Elm Court" });

	expect(JSON.parse((await AsyncStorage.getItem("fa.cleaner.handoff")) as string)).toEqual({ token: "tok-1", siteName: "Elm Court" });
});

test("a value written by something else is still read - no in-memory cache", async () => {
	// The other half of the same property: readHandoff always asks storage.
	await AsyncStorage.setItem("fa.cleaner.handoff", JSON.stringify({ token: "tok-9", siteName: "Cedar Point" }));

	expect(await readHandoff()).toEqual({ token: "tok-9", siteName: "Cedar Point" });
});

describe("scoping", () => {
	test("only the visit that was handed off gets a way back", async () => {
		await markHandoff({ token: "tok-1", siteName: "Elm Court" });

		expect(await isHandoffFor("tok-1")).toBe(true);
		// A link opened cold, or an abandoned handoff from earlier, must behave
		// exactly as it does for an external inspector.
		expect(await isHandoffFor("tok-other")).toBe(false);
	});

	test("no handoff at all means no way back", async () => {
		expect(await isHandoffFor("tok-1")).toBe(false);
		expect(await readHandoff()).toBeNull();
	});
});

test("clearing it removes the offer", async () => {
	await markHandoff({ token: "tok-1", siteName: "Elm Court" });
	await clearHandoff();

	expect(await isHandoffFor("tok-1")).toBe(false);
});

describe("coming back", () => {
	test("a submitted return leaves a confirmation, readable exactly once", async () => {
		await markHandoff({ token: "tok-1", siteName: "Elm Court" });
		await endHandoff(true);

		expect(await isHandoffFor("tok-1")).toBe(false);
		expect(await consumeChecksSubmitted()).toBe(true);
		// Consumed: a banner that reappears on every remount stops meaning
		// anything.
		expect(await consumeChecksSubmitted()).toBe(false);
	});

	test("an abandoned return leaves no confirmation", async () => {
		// Backing out of a visit that never submitted must not claim it did.
		await markHandoff({ token: "tok-1", siteName: "Elm Court" });
		await endHandoff(false);

		expect(await isHandoffFor("tok-1")).toBe(false);
		expect(await consumeChecksSubmitted()).toBe(false);
	});
});

describe("when storage misbehaves", () => {
	test("a write that throws degrades to the plain inspector flow", async () => {
		// Swapped and put back by hand. jest.spyOn(...).mockRestore() does not
		// reliably restore a method on an already-mocked module, and the leaked
		// rejection then poisoned every later test that writes - silently, because
		// the tests either side of it assert null and pass either way.
		const store = AsyncStorage as unknown as { setItem: unknown };
		const original = store.setItem;
		store.setItem = jest.fn().mockRejectedValue(new Error("no storage"));
		try {
			// Must not throw: the checks matter more than the convenience of a
			// labelled way back.
			await expect(markHandoff({ token: "tok-1", siteName: "Elm Court" })).resolves.toBeUndefined();
			expect(await isHandoffFor("tok-1")).toBe(false);
		} finally {
			store.setItem = original;
		}
	});

	test("junk in storage reads as no handoff, not as a crash", async () => {
		await AsyncStorage.setItem("fa.cleaner.handoff", "{not json");
		expect(await readHandoff()).toBeNull();
	});

	test("a marker with no token is not a handoff", async () => {
		await AsyncStorage.setItem("fa.cleaner.handoff", JSON.stringify({ siteName: "Elm Court" }));
		expect(await readHandoff()).toBeNull();
	});

	test("a marker with no site name still gets someone home", async () => {
		await AsyncStorage.setItem("fa.cleaner.handoff", JSON.stringify({ token: "tok-1" }));
		expect(await readHandoff()).toEqual({ token: "tok-1", siteName: "your site visit" });
	});
});
