import { render, screen } from "@testing-library/react-native";

import { DueChip, dueTone, FrequencyBadge } from "./Badges";

describe("dueTone", () => {
	test.each([
		["overdue", "overdue"],
		["OVERDUE_BY_12", "overdue"],
		["due_now", "due"],
		["due", "due"],
		["ok", "clear"],
		["", "clear"],
	])("%s -> %s", (status, tone) => {
		expect(dueTone(status)).toBe(tone);
	});

	test("overdue wins over the substring 'due' it contains", () => {
		expect(dueTone("overdue")).not.toBe("due");
	});
});

test("DueChip renders the server's label verbatim", async () => {
	await render(<DueChip status="overdue" label="Overdue by 12 days" />);
	expect(screen.getByText("Overdue by 12 days")).toBeTruthy();
});

test("DueChip falls back to the status when the server sends no label", async () => {
	await render(<DueChip status="due_now" />);
	expect(screen.getByText("due_now")).toBeTruthy();
});

test("FrequencyBadge renders nothing for an empty label", async () => {
	const { toJSON } = await render(<FrequencyBadge label="" />);
	expect(toJSON()).toBeNull();
});
