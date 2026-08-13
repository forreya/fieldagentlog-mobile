import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

type Variant = "primary" | "ghost" | "ghostDark";
type Size = "md" | "lg" | "sm";

interface Props {
	label: string;
	onPress: () => void;
	variant?: Variant;
	size?: Size;
	disabled?: boolean;
	busy?: boolean;
	/** Fill the available width - the default for the bottom-bar actions. */
	block?: boolean;
	style?: StyleProp<ViewStyle>;
}

/**
 * The one button. Targets are >=56pt (gloves, daylight, one hand) and the
 * pressed state is a scale nudge rather than a colour change, which stays
 * legible in sunlight.
 */
export function Button({ label, onPress, variant = "primary", size = "md", disabled, busy, block, style }: Props) {
	const inactive = disabled || busy;
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(busy) }}
			disabled={inactive}
			onPress={onPress}
			style={({ pressed }) => [
				styles.base,
				sizes[size],
				variants[variant],
				block && styles.block,
				inactive && styles.inactive,
				pressed && !inactive && styles.pressed,
				style,
			]}
		>
			{/* The label stays mounted while busy, just invisible, so the button
			    keeps its width instead of collapsing to a square around the
			    spinner - a jump that lands exactly when someone taps Submit. */}
			<Text style={[styles.label, textSizes[size], { color: labelColors[variant] }, busy && styles.hidden]}>{label}</Text>
			{busy ? <ActivityIndicator style={styles.spinner} size="small" color={labelColors[variant]} /> : null}
		</Pressable>
	);
}

const labelColors: Record<Variant, string> = {
	primary: colors.ink,
	ghost: colors.plateInk,
	ghostDark: colors.textOnDark,
};

const styles = StyleSheet.create({
	base: {
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: space.s2,
		borderRadius: radii.md,
		borderWidth: 2,
		borderColor: "transparent",
		paddingHorizontal: space.s5,
		// Intrinsic width by default, mirroring the web app's inline-flex .fa-btn.
		// Without this a button inside any column container silently fills it and
		// `block` means nothing.
		alignSelf: "flex-start",
	},
	block: { alignSelf: "stretch" },
	hidden: { opacity: 0 },
	spinner: { position: "absolute" },
	pressed: { transform: [{ scale: 0.98 }] },
	inactive: { opacity: 0.45 },
	label: { fontFamily: fonts.displayHeavy, letterSpacing: 0.5 },
});

const sizes = StyleSheet.create({
	sm: { minHeight: 38, paddingHorizontal: space.s3, borderRadius: radii.sm },
	md: { minHeight: TAP },
	lg: { minHeight: 60 },
});

const textSizes = StyleSheet.create({
	sm: { fontSize: 13 },
	md: { fontSize: 16 },
	lg: { fontSize: 17 },
});

const variants = StyleSheet.create({
	primary: { backgroundColor: colors.signal },
	ghost: { backgroundColor: "transparent", borderColor: colors.plateEdgeStrong },
	ghostDark: { backgroundColor: "transparent", borderColor: colors.lineOnDark },
});
