# Aerosol Plugin

## Releasing new releases

> You can simplify the version bump process by running `pnpm version patch`, `pnpm version minor` or `pnpm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`


## How to use

- Make sure your NodeJS is at least v16 (`node --version`).
- `pnpm i` to install dependencies.
- `pnpm run dev <VAULT_PATH>` where <VAULT_PATH> is the root of the Vault you want to test on to start compilation and copy the result to the defined Vault.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Obsidian API Documentation

See https://github.com/obsidianmd/obsidian-api
