import { Text } from "react-native";

import { Card, Screen } from "@/components/Screen";
import type { VisitRecord } from "@/db/types";
import { useWizard } from "@/visit/useWizard";

import { CheckStep } from "./CheckStep";
import { VisitIntro } from "./VisitIntro";

/**
 * The wizard once a visit has loaded. Owns the step state; the route above owns
 * loading and the terminal screens.
 */
export function VisitWizard({ record }: { record: VisitRecord }) {
	const { state, dispatch } = useWizard(record);

	switch (state.step) {
		case "intro":
			return (
				<VisitIntro
					record={state.record}
					onStart={(name, email) => {
						dispatch({ type: "SET_INSPECTOR", name, email });
						dispatch({ type: "START_CHECKS" });
					}}
				/>
			);
		case "checks":
			return <CheckStep state={state} dispatch={dispatch} />;
		case "summary":
			// Review and submit arrive in C5.
			return (
				<Screen title="Review" sub="Coming in the next phase">
					<Card>
						<Text>Summary and submit are not built yet.</Text>
					</Card>
				</Screen>
			);
	}
}
