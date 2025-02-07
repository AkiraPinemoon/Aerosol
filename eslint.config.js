// eslint.config.js
export default {
    extends: ["eslint:recommended"],
    parserOptions: {
      ecmaVersion: 2020,
    },
    env: {
      browser: true,
      node: true,
    },
    rules: {
      "no-console": "warn",
      "no-unused-vars": "warn",
    },
  };