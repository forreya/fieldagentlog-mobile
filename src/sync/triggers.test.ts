import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { SyncEngine } from "./engine";
import { startSyncTriggers } from "./triggers";

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn(() => jest.fn()), configure: jest.fn() }));

type NetState = { isConnected: boolean | null; isInternetReachable: boolean | null };

const netInfo = NetInfo as jest.Mocked<typeof NetInfo>;
let engine: SyncEngine;
let emitNet: (state: NetState) => void;

beforeEach(() => {
	jest.clearAllMocks();
	engine = new SyncEngine();
	netInfo.addEventListener.mockImplementation((listener) => {
		emitNet = listener as unknown as (state: NetState) => void;
		return jest.fn();
	});
});
afterEach(() => engine.reset());

describe("connectivity", () => {
	test("losing the network marks the engine offline", () => {
		startSyncTriggers(engine);
		emitNet({ isConnected: false, isInternetReachable: false });
		expect(engine.isOnline()).toBe(false);
	});

	test("connected-but-unreachable still counts as online, so we try immediately", () => {
		// Measured on a device: NetInfo only re-probes reachability every 60s
		// once it thinks there is no internet, so trusting it left the app
		// offline a full minute after signal returned. Our own request is the
		// better probe; a wasted attempt costs one jittered backoff step.
		startSyncTriggers(engine);
		emitNet({ isConnected: true, isInternetReachable: false });
		expect(engine.isOnline()).toBe(true);
	});

	test("an undetermined state is treated as online rather than blocking", () => {
		startSyncTriggers(engine);
		emitNet({ isConnected: null, isInternetReachable: null });
		expect(engine.isOnline()).toBe(true);
	});

	test("regaining a route flushes the queue", async () => {
		const run = jest.fn();
		engine.register({ name: "s", pending: async () => [{ id: "t", run }] });
		startSyncTriggers(engine);

		emitNet({ isConnected: false, isInternetReachable: false });
		emitNet({ isConnected: true, isInternetReachable: true });
		await new Promise((r) => setImmediate(r));

		expect(run).toHaveBeenCalled();
	});
});

describe("app lifecycle", () => {
	test("returning to the foreground syncs - iOS suspends a backgrounded app", async () => {
		const run = jest.fn();
		engine.register({ name: "s", pending: async () => [{ id: "t", run }] });
		const spy = jest.spyOn(AppState, "addEventListener");
		startSyncTriggers(engine);
		const handler = spy.mock.calls[0][1];

		handler("background");
		handler("active");
		await new Promise((r) => setImmediate(r));

		expect(run).toHaveBeenCalled();
	});

	test("going to the background does not sync", async () => {
		const run = jest.fn();
		engine.register({ name: "s", pending: async () => [{ id: "t", run }] });
		const spy = jest.spyOn(AppState, "addEventListener");
		startSyncTriggers(engine);
		const handler = spy.mock.calls[0][1];

		handler("background");
		await new Promise((r) => setImmediate(r));

		expect(run).not.toHaveBeenCalled();
	});
});

test("teardown detaches both listeners", () => {
	const removeNet = jest.fn();
	netInfo.addEventListener.mockReturnValue(removeNet);
	const remove = jest.fn();
	jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove } as never);

	startSyncTriggers(engine)();

	expect(removeNet).toHaveBeenCalled();
	expect(remove).toHaveBeenCalled();
});
