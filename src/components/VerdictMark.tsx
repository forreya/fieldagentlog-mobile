import { StyleSheet, View } from "react-native";

import type { Verdict } from "@/api/contract";

/**
 * The tick, cross and dash on the verdict control.
 *
 * Drawn from plain Views rather than an icon font or an SVG runtime: three
 * shapes made of rotated rectangles need neither, they cannot fall back to a
 * missing glyph, and they render identically on both platforms at any size.
 *
 * They exist because colour alone must never carry the verdict - a red and a
 * green button are the same button to a colour-blind inspector in sunlight, so
 * every option pairs a shape with its word.
 */
export function VerdictMark({ verdict, color, size = 26 }: { verdict: Verdict; color: string; size?: number }) {
	const bar = Math.max(3, Math.round(size * 0.14));

	if (verdict === "na") {
		return <View style={{ width: size, height: bar, borderRadius: bar / 2, backgroundColor: color }} />;
	}

	if (verdict === "pass") {
		return (
			<View style={[styles.box, { width: size, height: size }]}>
				<View
					style={{
						position: "absolute",
						left: size * 0.06,
						top: size * 0.52,
						width: size * 0.4,
						height: bar,
						borderRadius: bar / 2,
						backgroundColor: color,
						transform: [{ rotate: "45deg" }],
					}}
				/>
				<View
					style={{
						position: "absolute",
						left: size * 0.28,
						top: size * 0.42,
						width: size * 0.72,
						height: bar,
						borderRadius: bar / 2,
						backgroundColor: color,
						transform: [{ rotate: "-52deg" }],
					}}
				/>
			</View>
		);
	}

	return (
		<View style={[styles.box, { width: size, height: size }]}>
			{["45deg", "-45deg"].map((rotate) => (
				<View
					key={rotate}
					style={{
						position: "absolute",
						top: (size - bar) / 2,
						width: size,
						height: bar,
						borderRadius: bar / 2,
						backgroundColor: color,
						transform: [{ rotate }],
					}}
				/>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	box: { alignItems: "center", justifyContent: "center" },
});
