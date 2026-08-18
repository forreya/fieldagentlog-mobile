// The way back out of the wizard, for the one person who has somewhere to be.

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import * as handoff from "./handoff";
import { useHandoff } from "./useHandoff";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("./handoff");

const marker = handoff as jest.Mocked<typeof handoff>;

beforeEach(() => {
	jest.clearAllMocks();
	marker.isHandoffFor.mockResolvedValue(false);
	marker.endHandoff.mockResolvedValue(undefined);
});

test("offers nothing until the answer is in", async () => {
	// Starts false on purpose: flashing a "back" button that then vanishes is
	// worse than a beat of nothing, and the wrong affordance here is a dead end.
	marker.isHandoffFor.mockReturnValue(new Promise(() => undefined));

	const { result } = await renderHook(() => useHandoff("tok-1"));

	expect(result.current.fromCleaner).toBe(false);
});

test("recognises the visit it was handed off into", async () => {
	marker.isHandoffFor.mockResolvedValue(true);

	const { result } = await renderHook(() => useHandoff("tok-1"));

	await waitFor(() => expect(result.current.fromCleaner).toBe(true));
	expect(marker.isHandoffFor).toHaveBeenCalledWith("tok-1");
});

test("a link opened cold is just an inspector visit", async () => {
	const { result } = await renderHook(() => useHandoff("tok-other"));

	await waitFor(() => expect(marker.isHandoffFor).toHaveBeenCalled());
	expect(result.current.fromCleaner).toBe(false);
});

test("going back after submitting leaves the confirmation and replaces the route", async () => {
	marker.isHandoffFor.mockResolvedValue(true);
	const { result } = await renderHook(() => useHandoff("tok-1"));
	await waitFor(() => expect(result.current.fromCleaner).toBe(true));

	await act(async () => result.current.goBack(true));

	expect(marker.endHandoff).toHaveBeenCalledWith(true);
	// Replace: the finished visit must not sit under the cleaner home waiting
	// to be swiped back into.
	await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/(app)"));
});

test("backing out without submitting says so", async () => {
	marker.isHandoffFor.mockResolvedValue(true);
	const { result } = await renderHook(() => useHandoff("tok-1"));
	await waitFor(() => expect(result.current.fromCleaner).toBe(true));

	await act(async () => result.current.goBack(false));

	expect(marker.endHandoff).toHaveBeenCalledWith(false);
});

test("a storage failure on the way out still gets the cleaner home", async () => {
	// Being stranded in the wizard is the failure that matters; a stale marker
	// is scoped to one token and harmless.
	marker.isHandoffFor.mockResolvedValue(true);
	marker.endHandoff.mockRejectedValue(new Error("no storage"));
	const { result } = await renderHook(() => useHandoff("tok-1"));
	await waitFor(() => expect(result.current.fromCleaner).toBe(true));

	await act(async () => result.current.goBack(true));

	await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/(app)"));
});
