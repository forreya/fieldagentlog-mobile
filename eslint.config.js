// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const prettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
	expoConfig,
	prettierRecommended,
	{
		ignores: ["dist/*", ".expo/*"],
	},
	{
		// Working-rule 6 size budgets: crossing one means splitting the file in
		// the same PR, not a TODO. Screens get 300; everything else 250.
		rules: {
			"max-lines": ["error", { max: 250, skipBlankLines: true, skipComments: true }],
			"max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
		},
	},
	{
		files: ["src/app/**/*.tsx", "src/screens/**/*.tsx"],
		rules: {
			"max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
		},
	},
]);
