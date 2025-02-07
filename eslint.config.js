// eslint.config.js
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2020,
    },
    environment: {
      browser: true,
      node: true,
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn",
    },
  },
];
