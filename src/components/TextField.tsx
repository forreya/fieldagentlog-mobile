import { StyleSheet, Text, TextInput, View, type KeyboardTypeOptions, type ReturnKeyTypeOptions } from "react-native";

import { colors, fonts, radii, space, TAP } from "@/theme/tokens";

interface Props {
	label?: string;
	/** Rendered after the label, in its own colour. Say it once, consistently. */
	requirement?: "required" | "optional";
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	/** Shown under the field, in red, and outlines the input. */
	error?: string | null;
	multiline?: boolean;
	/** For codes and links, where letter shapes have to be distinguishable. */
	mono?: boolean;
	/** Masks the value. Also turns off the suggestion strip, which on Android
	 *  will otherwise offer a password back to the next field it sees. */
	secure?: boolean;
	keyboardType?: KeyboardTypeOptions;
	inputMode?: "url" | "email";
	autoCapitalize?: "none" | "words" | "sentences";
	returnKeyType?: ReturnKeyTypeOptions;
	onSubmit?: () => void;
	/** Falls back to the label; required when there is no visible label. */
	accessibilityLabel?: string;
}

/**
 * Every text input in the app.
 *
 * Four screens had grown their own copy of this box - same border, radius,
 * padding and 16pt type (below that, iOS zooms the page on focus) - and had
 * started to drift. Autocorrect is off everywhere by choice: the things typed
 * into this app are names, fault descriptions and hex codes, none of which a
 * dictionary improves.
 */
export function TextField({
	label,
	requirement,
	value,
	onChange,
	placeholder,
	error,
	multiline,
	mono,
	secure,
	keyboardType,
	inputMode,
	autoCapitalize = "sentences",
	returnKeyType,
	onSubmit,
	accessibilityLabel,
}: Props) {
	return (
		<View style={styles.field}>
			{label ? (
				<Text style={styles.label}>
					{label}
					{requirement ? <Text style={requirement === "required" ? styles.required : styles.optional}> - {requirement}</Text> : null}
				</Text>
			) : null}
			<TextInput
				accessibilityLabel={accessibilityLabel ?? label}
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={colors.plateMuted}
				keyboardType={keyboardType}
				inputMode={inputMode}
				autoCapitalize={autoCapitalize}
				autoCorrect={false}
				spellCheck={false}
				multiline={multiline}
				secureTextEntry={secure}
				textContentType={secure ? "password" : undefined}
				returnKeyType={returnKeyType}
				onSubmitEditing={onSubmit}
				style={[styles.input, multiline && styles.multiline, mono && styles.mono, error ? styles.bad : null]}
			/>
			{error ? (
				<Text accessibilityRole="alert" style={styles.error}>
					{error}
				</Text>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	field: { gap: space.s2 },
	label: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.6, textTransform: "uppercase", color: colors.plateMuted },
	required: { color: colors.fail, letterSpacing: 0 },
	optional: { color: colors.plateMuted, letterSpacing: 0 },
	input: {
		minHeight: TAP,
		borderWidth: 1,
		borderColor: colors.plateEdgeStrong,
		borderRadius: radii.sm,
		paddingHorizontal: space.s3,
		// 16pt or larger, or iOS zooms the whole page when the field takes focus.
		fontFamily: fonts.body,
		fontSize: 16,
		color: colors.plateInk,
		backgroundColor: colors.plate,
	},
	multiline: { minHeight: 96, paddingVertical: space.s3, textAlignVertical: "top" },
	mono: { fontFamily: fonts.mono, fontSize: 15 },
	bad: { borderColor: colors.fail, borderWidth: 2 },
	error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.fail },
});
