import { render, screen } from "@testing-library/react-native";

import { pillFor, StatusPill } from "./StatusPill";

describe("pillFor", () => {
	test("offline beats every other state - it is the one that changes behaviour", () => {
		expect(pillFor({ online: false, syncing: true, pending: 3 })).toEqual({ label: "Offline", tone: "offline" });
	});

	test("syncing outranks a pending count", () => {
		expect(pillFor({ online: true, syncing: true, pending: 3 }).label).toBe("Syncing");
	});

	test("a pending count is shown when idle", () => {
		expect(pillFor({ online: true, pending: 3 })).toEqual({ label: "3 to sync", tone: "busy" });
	});

	test("nothing queued reads simply as Online", () => {
		expect(pillFor({ online: true, pending: 0 })).toEqual({ label: "Online", tone: "online" });
	});
});

test("renders the state as live-announced text", async () => {
	await render(<StatusPill online={false} />);
	expect(screen.getByText("Offline")).toBeTruthy();
});
