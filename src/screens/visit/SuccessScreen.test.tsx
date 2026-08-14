import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { SuccessScreen } from "./SuccessScreen";

const submitted = { visit_id: "v1", logbook_pdf_url: "https://example.test/logbook.pdf", completed_at: "2026-08-14T10:00:00Z" };

beforeEach(() => jest.restoreAllMocks());

test("names the block and says the visit is locked", async () => {
	await render(<SuccessScreen blockName="Elm Court" submitted={submitted} />);

	expect(screen.getByText(/Elm Court is done/)).toBeTruthy();
	expect(screen.getByText("This visit is now locked.")).toBeTruthy();
});

test("the logbook opens in the system browser, not in the app", async () => {
	// A signed PDF people forward, print and file - every phone already has a
	// viewer that does all three, and an in-app one would do none of them.
	const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
	await render(<SuccessScreen submitted={submitted} />);

	fireEvent.press(screen.getByRole("button", { name: "Open the logbook (PDF)" }));

	expect(open).toHaveBeenCalledWith("https://example.test/logbook.pdf");
});

test("a link that will not open says so, rather than doing nothing", async () => {
	jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no handler"));
	await render(<SuccessScreen submitted={submitted} />);

	fireEvent.press(screen.getByRole("button", { name: "Open the logbook (PDF)" }));

	expect(await screen.findByText(/inspection itself is safely recorded/)).toBeTruthy();
});

test("no PDF yet is a wait, not a failure - the inspection is already in", async () => {
	await render(<SuccessScreen submitted={{ ...submitted, logbook_pdf_url: "" }} />);

	expect(screen.getByText("The logbook PDF will be available shortly.")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Open the logbook (PDF)" })).toBeNull();
});
