import { claimedRole, resolveRole } from "./roles";

describe("the cleaner claim wins outright", () => {
	test("app_metadata.role beats membership", () => {
		// Only staff can set app_metadata, so this is trustworthy - and a cleaner
		// who somehow also had a membership row must still land on the cleaner app.
		const user = { app_metadata: { role: "cleaner" } };
		expect(resolveRole(user, ["org1"])).toBe("cleaner");
	});

	test("user_metadata is accepted as a fallback location", () => {
		expect(claimedRole({ user_metadata: { role: "cleaner" } })).toBe("cleaner");
	});

	test("app_metadata takes precedence over user_metadata", () => {
		// user_metadata is user-writable; app_metadata is not. If they disagree,
		// the server-set one decides.
		expect(claimedRole({ app_metadata: { role: "cleaner" }, user_metadata: { role: "staff" } })).toBe("cleaner");
	});

	test("any other claim value is not a cleaner", () => {
		for (const role of ["staff", "admin", "", null, undefined, 1, true]) {
			expect(claimedRole({ app_metadata: { role } })).toBeNull();
		}
	});

	test("a user-set 'staff' claim grants nothing - only membership does", () => {
		// user_metadata is writable by the user themselves, so it must never be a
		// route to staff. This is the privilege-escalation case.
		expect(resolveRole({ user_metadata: { role: "staff" } }, [])).toBe("agent");
	});
});

describe("membership decides staff vs agent", () => {
	test("at least one organisation means staff", () => {
		expect(resolveRole({}, ["org1"])).toBe("staff");
	});

	test("no organisations means an external field agent", () => {
		expect(resolveRole({}, [])).toBe("agent");
	});

	test("missing metadata objects are handled", () => {
		expect(resolveRole({ app_metadata: null, user_metadata: null }, ["org1"])).toBe("staff");
		expect(resolveRole({}, [])).toBe("agent");
	});
});
