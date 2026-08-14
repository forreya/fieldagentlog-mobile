import { Button } from "@/components/Button";
import { StatusScreen } from "@/components/StatusScreen";

/**
 * The load failed and there is nothing cached to fall back on.
 *
 * Both variants are retryable, which is the difference between this and the
 * dead end: the link is probably fine, the moment is not. `offline` names the
 * likely cause so the reader knows to walk somewhere with signal rather than
 * keep tapping.
 */
export function ConnectionErrorScreen({ mode, onRetry }: { mode: "offline" | "error"; onRetry: () => void }) {
	const offline = mode === "offline";
	return (
		<StatusScreen
			tone="bad"
			title={offline ? "You're offline" : "We couldn't load this visit"}
			body={
				offline
					? "There's no signal and nothing saved on this device yet. Reconnect and try again."
					: "Something went wrong loading this visit. Check your connection and try again."
			}
		>
			<Button label="Try again" size="lg" block onPress={onRetry} />
		</StatusScreen>
	);
}
