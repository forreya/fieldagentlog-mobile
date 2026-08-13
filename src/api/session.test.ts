import { notifySessionExpired, onSessionExpired, resetSessionListeners } from "./session";

beforeEach(resetSessionListeners);

test("notifies every listener", () => {
	const a = jest.fn();
	const b = jest.fn();
	onSessionExpired(a);
	onSessionExpired(b);

	notifySessionExpired();

	expect(a).toHaveBeenCalledTimes(1);
	expect(b).toHaveBeenCalledTimes(1);
});

test("unsubscribing stops delivery, so an unmounted screen is not called", () => {
	const listener = jest.fn();
	const off = onSessionExpired(listener);

	off();
	notifySessionExpired();

	expect(listener).not.toHaveBeenCalled();
});

test("one throwing listener does not stop the others", () => {
	const after = jest.fn();
	onSessionExpired(() => {
		throw new Error("boom");
	});
	onSessionExpired(after);

	expect(() => notifySessionExpired()).not.toThrow();
	expect(after).toHaveBeenCalledTimes(1);
});

test("a listener that unsubscribes itself mid-notify does not corrupt the pass", () => {
	// The real shape of this: a sign-out handler that tears down its own
	// subscription while being notified.
	const other = jest.fn();
	const off: (() => void)[] = [];
	off.push(
		onSessionExpired(() => {
			off[0]();
		}),
	);
	onSessionExpired(other);

	expect(() => notifySessionExpired()).not.toThrow();
	expect(other).toHaveBeenCalledTimes(1);
});
