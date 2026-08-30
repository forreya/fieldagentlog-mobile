import { fireEvent, render, screen } from "@testing-library/react-native";

import type { CleanerDuty } from "@/api/cleaner";

import { DutiesCard } from "./DutiesCard";

const duty = (over: Partial<CleanerDuty> = {}): CleanerDuty => ({
	id: "d1",
	title: "Fire alarm - weekly test",
	freq_label: "Weekly",
	status: "overdue",
	status_label: "Overdue by 3 days",
	...over,
});

test("nothing due means no card at all, not an empty one", async () => {
	// A cleaner on a site with nothing to do should see the on-site card and
	// stop reading. An empty "0 checks" panel is noise on a phone.
	const view = await render(<DutiesCard duties={[]} busy={false} onStart={jest.fn()} />);
	expect(view.toJSON()).toBeNull();
});

test("lists what is due, with its cadence, and offers to start", async () => {
	const onStart = jest.fn();
	await render(
		<DutiesCard
			duties={[duty(), duty({ id: "d2", title: "Communal fire doors", freq_label: "Quarterly", status: "due" })]}
			busy={false}
			onStart={onStart}
		/>,
	);

	expect(screen.getByText("2 fire-safety checks due")).toBeTruthy();
	expect(screen.getByText("Fire alarm - weekly test")).toBeTruthy();
	expect(screen.getByText("Weekly")).toBeTruthy();
	expect(screen.getByText("Quarterly")).toBeTruthy();

	fireEvent.press(screen.getByRole("button", { name: "Start checks" }));
	expect(onStart).toHaveBeenCalled();
});

test("one check reads as a check, not 1 checks", async () => {
	await render(<DutiesCard duties={[duty()]} busy={false} onStart={jest.fn()} />);
	expect(screen.getByText("1 fire-safety check due")).toBeTruthy();
});

test("says where the results go, because that is what makes them worth doing", async () => {
	await render(<DutiesCard duties={[duty()]} busy={false} onStart={jest.fn()} />);
	expect(screen.getByText(/fire logbook under your name/)).toBeTruthy();
});
