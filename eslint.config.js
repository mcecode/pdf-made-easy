import { defineConfig } from "eslint/config";
import globals from "globals";
import jsdocPlugin from "eslint-plugin-jsdoc";
import jsPlugin from "@eslint/js";
import prettierConfig from "eslint-config-prettier/flat";
// @ts-expect-error - This package doesn't support TypeScript yet, see:
// https://github.com/eslint-community/eslint-plugin-promise/issues/488
import promisePlugin from "eslint-plugin-promise";
import tsPlugin from "typescript-eslint";
import unicornPlugin from "eslint-plugin-unicorn";

export default defineConfig([
	jsPlugin.configs.all,
	tsPlugin.configs.all,
	jsdocPlugin.configs["flat/contents-typescript-flavor-error"],
	jsdocPlugin.configs["flat/logical-typescript-flavor-error"],
	jsdocPlugin.configs["flat/requirements-typescript-flavor-error"],
	jsdocPlugin.configs["flat/stylistic-typescript-flavor-error"],
	unicornPlugin.configs.all,
	prettierConfig,
	{
		files: ["**/*.{js,ts}"],
		languageOptions: {
			globals: globals.node,
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		linterOptions: {
			reportUnusedDisableDirectives: "error",
			reportUnusedInlineConfigs: "error",
		},
		plugins: {
			// This is fine, `promisePlugin` is just not explicitly typed.
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			promise: promisePlugin,
		},
		rules: {
			// ESLint
			"capitalized-comments": [
				"error",
				"always",
				{ ignoreConsecutiveComments: true },
			],
			curly: "error",
			"func-style": ["error", "declaration"],
			"id-length": "off",
			"max-classes-per-file": "off",
			"max-lines": "off",
			"max-lines-per-function": "off",
			"max-statements": "off",
			"no-console": "off",
			"no-continue": "off",
			"no-else-return": ["error", { allowElseIf: false }],
			"no-plusplus": "off",
			"no-ternary": "off",
			"no-undefined": "off",
			"no-unexpected-multiline": "error",
			"no-warning-comments": "off",
			"one-var": ["error", "never"],
			"prefer-template": "off",
			"sort-imports": [
				"error",
				{
					allowSeparatedGroups: true,
					ignoreCase: true,
					memberSyntaxSortOrder: ["all", "single", "multiple", "none"],
				},
			],
			"sort-keys": [
				"error",
				"asc",
				{ allowLineSeparatedGroups: true, caseSensitive: false, natural: true },
			],

			// TypeScript
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/init-declarations": "off",
			"@typescript-eslint/max-params": "off",
			"@typescript-eslint/naming-convention": "off",
			"@typescript-eslint/no-use-before-define": [
				"error",
				{ classes: false, functions: false, ignoreTypeReferences: false },
			],
			"@typescript-eslint/parameter-properties": "off",
			"@typescript-eslint/prefer-readonly-parameter-types": "off",
			"@typescript-eslint/typedef": "off",

			// Promise
			"promise/avoid-new": "error",
			"promise/no-new-statics": "error",
			"promise/param-names": [
				"error",
				{ rejectPattern: "^_|reject$", resolvePattern: "^_|resolve$" },
			],
			"promise/prefer-await-to-callbacks": "error",
			"promise/prefer-await-to-then": ["error", { strict: true }],
			"promise/spec-only": "error",

			// JSDoc
			"jsdoc/check-line-alignment": ["error", "never", { wrapIndent: "  " }],
			"jsdoc/no-types": "off",
			"jsdoc/require-example": "off",
			"jsdoc/require-param-description": "off",
			"jsdoc/require-returns-description": "off",
			"jsdoc/tag-lines": [
				"error",
				"always",
				{
					applyToEndTag: false,
					startLines: 1,
					tags: { property: { lines: "never" }, typedef: { lines: "any" } },
				},
			],

			// Unicorn
			"unicorn/import-style": "off",
			"unicorn/prevent-abbreviations": "off",
			// I actually want the opposite, always use `utf-8`.
			"unicorn/text-encoding-identifier-case": "off",
		},
	},
	{
		files: ["**/*.ts"],
		rules: {
			// TypeScript
			"@typescript-eslint/explicit-function-return-type": "error",
			"@typescript-eslint/explicit-module-boundary-types": "error",
			"@typescript-eslint/parameter-properties": "error",

			// JSDoc
			"jsdoc/no-types": "error",
			"jsdoc/require-description": "error",
			"jsdoc/require-jsdoc": "off",
			"jsdoc/require-param": "off",
			"jsdoc/require-param-description": "error",
			"jsdoc/require-param-type": "off",
			"jsdoc/require-property-type": "off",
			"jsdoc/require-returns": "off",
			"jsdoc/require-returns-description": "error",
			"jsdoc/require-returns-type": "off",
			"jsdoc/require-template": "off",
		},
	},
]);
