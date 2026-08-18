import { useHandoff } from "@/cleaner/useHandoff";
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
export function ConnectionErrorScreen({ mode, onRetry, token }: { mode: "offline" | "error"; onRetry: () => void; token?: string }) {
	const offline = mode === "offline";
	const handoff = useHandoff(token ?? "");
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
			{/* A cleaner who cannot load the checks is still on site with a session
			    running. Retry is the first offer; not being stranded is the second. */}
			{handoff.fromCleaner ? <Button label="Back to your site visit" variant="ghostDark" block onPress={() => handoff.goBack(false)} /> : null}
		</StatusScreen>
	);
}
