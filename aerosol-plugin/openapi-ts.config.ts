import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
	input: "../openapi3_1.yaml",
	output: "src/api",
	plugins: ["@hey-api/client-fetch"],
});
