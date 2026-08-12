import { APP_NAME } from "./constants";

// A1: one trivial test proving the jest harness runs. Real suites arrive with
// the modules they test (working rule 3).
test("the app knows its own name", () => {
	expect(APP_NAME).toBe("FieldAgentLog");
});
