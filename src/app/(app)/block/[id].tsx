// Route only; the screen lives in src/screens so its test can sit beside it.

import { useLocalSearchParams } from "expo-router";

import { BlockDetail } from "@/screens/blocks/BlockDetail";

export default function BlockRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return <BlockDetail blockId={id ?? ""} />;
}
