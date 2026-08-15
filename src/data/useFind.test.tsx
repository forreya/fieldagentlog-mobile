// The rule this file protects: opening the app never asks for location.
//
// A permission dialog nobody asked for is how people learn to say no, and an
// inspector opening a visit link has no reason to be asked where they are.

import { act, renderHook, waitFor } from "@testing-library/react-native";

import * as position from "@/lib/position";
import type { Findable } from "@/lib/nearby";

import { useFind } from "./useFind";

jest.mock("@/lib/position");
jest.mock("@/lib/geocode", () => ({
	normalizePostcode: (p: string) => p.trim().toUpperCase(),
	geocodePostcodes: jest.fn(
		async () =>
			new Map([
				["SE1 2AB", { lat: 51.5, lng: -0.1 }],
				["SE5 9QQ", { lat: 51.47, lng: -0.09 }],
			]),
	),
}));

const pos = position as jest.Mocked<typeof position>;

const blocks: Findable[] = [
	{ id: "far", name: "Beech House", address: "22 Beech Lane", postcode: "SE5 9QQ" },
	{ id: "near", name: "Elm Court", address: "1 Elm Road", postcode: "SE1 2AB" },
];

beforeEach(() => {
	jest.clearAllMocks();
	pos.positionMessage.mockImplementation((o) => (o.status === "denied" ? "Location is off for this app." : "Couldn't get your location."));
});

test("opening the list asks for nothing when permission has not been given", async () => {
	pos.locationAlreadyGranted.mockResolvedValue(false);
	const { result } = await renderHook(() => useFind(blocks));

	await waitFor(() => expect(pos.locationAlreadyGranted).toHaveBeenCalled());
	expect(pos.capturePosition).not.toHaveBeenCalled();
	expect(result.current.near).toBe("off");
});

test("with permission already given, it orders itself with no prompt", async () => {
	pos.locationAlreadyGranted.mockResolvedValue(true);
	pos.capturePosition.mockResolvedValue({ status: "ok", point: { lat: 51.5, lng: -0.1 } });

	const { result } = await renderHook(() => useFind(blocks));

	await waitFor(() => expect(result.current.near).toBe("on"));
	expect(result.current.results.map((b) => b.id)).toEqual(["near", "far"]);
});

test("tapping Nearest asks, and sorts when it gets an answer", async () => {
	pos.locationAlreadyGranted.mockResolvedValue(false);
	pos.capturePosition.mockResolvedValue({ status: "ok", point: { lat: 51.5, lng: -0.1 } });
	const { result } = await renderHook(() => useFind(blocks));

	await act(async () => result.current.toggleNear());

	await waitFor(() => expect(result.current.near).toBe("on"));
	expect(result.current.distances.get("near")).toBeCloseTo(0, 2);
});

test("a refused permission leaves the list alone and says why", async () => {
	// The list in its own order still beats no list.
	pos.locationAlreadyGranted.mockResolvedValue(false);
	pos.capturePosition.mockResolvedValue({ status: "denied" });
	const { result } = await renderHook(() => useFind(blocks));

	await act(async () => result.current.toggleNear());

	await waitFor(() => expect(result.current.near).toBe("error"));
	expect(result.current.error).toBe("Location is off for this app.");
	expect(result.current.results.map((b) => b.id)).toEqual(["far", "near"]);
});

test("Nearest turns back off from an error, clearing the message", async () => {
	pos.locationAlreadyGranted.mockResolvedValue(false);
	pos.capturePosition.mockResolvedValue({ status: "denied" });
	const { result } = await renderHook(() => useFind(blocks));
	await act(async () => result.current.toggleNear());
	await waitFor(() => expect(result.current.near).toBe("error"));

	await act(async () => result.current.toggleNear());

	// Retrying an OS-refused permission just fails again; the way back is
	// Settings, so the toggle must at least be dismissible.
	await waitFor(() => expect(result.current.near).toBe("off"));
	expect(result.current.error).toBeNull();
});

test("searching filters without needing a location at all", async () => {
	pos.locationAlreadyGranted.mockResolvedValue(false);
	const { result } = await renderHook(() => useFind(blocks));

	await act(async () => result.current.setQuery("beech"));

	await waitFor(() => expect(result.current.results.map((b) => b.id)).toEqual(["far"]));
	expect(pos.capturePosition).not.toHaveBeenCalled();
});
