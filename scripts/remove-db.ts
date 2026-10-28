import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { removeHyperdriveBinding } from "./wrangler-config";

const CONFIG = "wrangler.jsonc";
const [name] = process.argv.slice(2);

if (!name) {
	console.error("Usage: npm run remove-db -- <name>");
	process.exit(1);
}

try {
	const { text, id } = removeHyperdriveBinding(readFileSync(CONFIG, "utf8"), name);
	writeFileSync(CONFIG, text);
	// Deploy without the binding first; deleting a config that is still bound fails.
	execFileSync("npx", ["wrangler", "deploy"], { stdio: "inherit" });
	execFileSync("npx", ["wrangler", "hyperdrive", "delete", id], { stdio: "inherit" });
	console.log(`Removed database "${name}".`);
} catch (error) {
	console.error((error as Error).message);
	process.exit(1);
}
