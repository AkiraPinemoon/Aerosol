import globals from "globals";
import fg from 'fast-glob';
import { includeIgnoreFile } from "@eslint/compat";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pluginJs from "@eslint/js";
import * as regexpPlugin from "eslint-plugin-regexp";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gitignorePaths = fg.sync('**/.gitignore').map(file => path.join(__dirname, file));
const config = gitignorePaths.map((gitignorePath) => includeIgnoreFile(gitignorePath));

export default [
  ...config,
  {
    files: ["**/*.{js,mjs,cjs,ts}"]
  },
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  regexpPlugin.configs["flat/recommended"],
  ...tseslint.configs.recommended,
];