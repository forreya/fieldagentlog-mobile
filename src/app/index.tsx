import { StyleSheet, Text, View } from "react-native";

import { backendSummary } from "@/lib/config";
import { APP_NAME } from "@/lib/constants";

export default function Index() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>{APP_NAME}</Text>
			<Text style={styles.sub}>A2 skeleton - backend: {backendSummary()}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
	title: { fontSize: 24, fontWeight: "700" },
	sub: { fontSize: 14, opacity: 0.6 },
});
