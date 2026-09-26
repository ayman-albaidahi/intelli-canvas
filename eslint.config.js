// ESLint flat config — conservative starting point.
//
// The rules below describe style the project already follows. They start as
// hard errors because the codebase is already clean; adding a rule means
// fixing the (few) existing violations first. JS is plain ES Modules, so no
// parser plugin is needed.

import globals from "globals";

const rules = {
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "no-undef": "error",
  "no-console": ["error", { allow: ["warn", "error"] }],
  "prefer-const": "error",
  eqeqeq: ["error", "always"],
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "test-results/**",
      ".venv/**",
    ],
  },
  {
    files: ["frontend/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: rules,
  },
  {
    files: ["frontend/**/*.test.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
    rules: rules,
  },
];
