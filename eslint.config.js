import globals from "globals";
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default defineConfig(
	js.configs.recommended,
	ts.configs.recommended,
	prettier,
	{
		languageOptions: { globals: globals.node },
		rules: {
			"no-undef": "off",
		},
	},
	{
		// Grindr workarounds stay removable: the app reaches them only through
		// the module's index (see src/grindr-workarounds/index.ts).
		files: ["src/**/*.{ts,tsx}"],
		ignores: ["src/grindr-workarounds/**"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/grindr-workarounds/*"],
							message: "Import Grindr workarounds only from the grindr-workarounds index.",
						},
					],
				},
			],
		},
	},
);
