import { fireEvent, render, screen } from "@testing-library/react-native";

import type { AttendanceSession } from "@/db/types";
import { TAP } from "@/theme/tokens";

import { OnSiteCard, formatDuration } from "./OnSiteCard";

const session = (over: Partial<AttendanceSession> = {}): AttendanceSession => ({
	local_id: "a",
	site_id: "s1",
	site_name: "Elm Court",
	cleaner_email: null,
	check_in: { lat: 51.5, lng: -0.1, accuracy: 8, at: Date.now() - 90_000 },
	check_out: null,
	server_id: null,
	synced_in: true,
	synced_out: false,
	...over,
});

describe("formatDuration", () => {
	test.each([
		[0, "0m 00s"],
		[9, "0m 09s"],
		[90, "1m 30s"],
		[3599, "59m 59s"],
		// Past the hour the seconds are noise on a card someone glances at.
		[3600, "1h 00m"],
		[3661, "1h 01m"],
		[28_800, "8h 00m"],
	])("%i seconds reads as %s", (seconds, expected) => {
		expect(formatDuration(seconds)).toBe(expected);
	});

	test("a clock that went backwards does not print a negative shift", () => {
		expect(formatDuration(-30)).toBe("0m 00s");
	});
});

test("names the site and offers the way out", async () => {
	const onCheckOut = jest.fn();
	await render(<OnSiteCard session={session()} busy={false} onCheckOut={onCheckOut} />);

	expect(screen.getByText("Elm Court")).toBeTruthy();
	expect(screen.getByText("ON SITE")).toBeTruthy();

	fireEvent.press(screen.getByRole("button", { name: "Check out" }));
	expect(onCheckOut).toHaveBeenCalled();
});

test("an unsent check-in says so, rather than hiding it behind a sync icon", async () => {
	// Someone who checked in underground should know where the record is.
	await render(<OnSiteCard session={session({ synced_in: false })} busy={false} onCheckOut={jest.fn()} />);
	expect(screen.getByText(/Saved on this phone/)).toBeTruthy();
});

test("once the check-in is up, the reassurance goes away", async () => {
	await render(<OnSiteCard session={session({ synced_in: true })} busy={false} onCheckOut={jest.fn()} />);
	expect(screen.queryByText(/Saved on this phone/)).toBeNull();
});

describe("a check-in that was refused", () => {
	const failed = () => session({ synced_in: false, sync_error: { message: "Your account is not active. Ask your managing agent.", at: 1 } });

	test("says so honestly instead of promising it will send itself", async () => {
		await render(<OnSiteCard session={failed()} busy={false} onCheckOut={jest.fn()} onRetrySync={jest.fn()} />);

		expect(screen.getByText(/This visit couldn't be recorded - Your account is not active/)).toBeTruthy();
		expect(screen.getByText(/It stays saved on this phone/)).toBeTruthy();
		// The old reassurance would be a lie here: nothing sends this by itself.
		expect(screen.queryByText(/It goes up when you have signal/)).toBeNull();
	});

	test("every action on the card meets the glove-friendly tap target", async () => {
		// Try again is a recovery action tapped on a doorstep - it must not be
		// the one button in the flow below the 56pt minimum.
		await render(<OnSiteCard session={failed()} busy={false} onCheckOut={jest.fn()} onRetrySync={jest.fn()} />);

		const buttons = screen.getAllByRole("button");
		expect(buttons).toHaveLength(2); // Try again, Check out
		for (const button of buttons) expect(button).toHaveStyle({ minHeight: TAP });
	});

	test("offers Try again, and checking out still works", async () => {
		const onRetrySync = jest.fn();
		const onCheckOut = jest.fn();
		await render(<OnSiteCard session={failed()} busy={false} onCheckOut={onCheckOut} onRetrySync={onRetrySync} />);

		fireEvent.press(screen.getByText("Try again"));
		expect(onRetrySync).toHaveBeenCalledTimes(1);
		fireEvent.press(screen.getByText("Check out"));
		expect(onCheckOut).toHaveBeenCalledTimes(1);
	});
});
