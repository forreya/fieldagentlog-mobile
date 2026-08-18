import type { VisitRecord } from "@/db/types";
import { useSubmit } from "@/visit/useSubmit";
import { useWizard } from "@/visit/useWizard";
import { blockNameOf } from "@/visit/wizard";

import { CheckStep } from "./CheckStep";
import { SuccessScreen } from "./SuccessScreen";
import { VisitIntro } from "./VisitIntro";
import { VisitSummary } from "./VisitSummary";

/**
 * The wizard once a visit has loaded. Owns the step state and the submit; the
 * route above owns loading and the terminal screens.
 *
 * The submit lives here rather than on the summary so that walking back into
 * the checks mid-send does not abandon it - the success screen still arrives
 * when the pass lands, wherever the inspector happens to be.
 */
export function VisitWizard({ record, fromCache }: { record: VisitRecord; fromCache: boolean }) {
	const { state, dispatch } = useWizard(record);
	const { phase, submitted, submit } = useSubmit(state.record, dispatch);

	if (submitted) return <SuccessScreen blockName={blockNameOf(state.record)} submitted={submitted} token={record.token} />;

	switch (state.step) {
		case "intro":
			return (
				<VisitIntro
					record={state.record}
					fromCache={fromCache}
					onStart={(name, email) => {
						dispatch({ type: "SET_INSPECTOR", name, email });
						dispatch({ type: "START_CHECKS" });
					}}
				/>
			);
		case "checks":
			return <CheckStep state={state} dispatch={dispatch} />;
		case "summary":
			return <VisitSummary state={state} dispatch={dispatch} phase={phase} onSubmit={() => void submit()} />;
	}
}
