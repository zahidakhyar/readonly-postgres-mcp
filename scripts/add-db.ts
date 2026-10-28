import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
	addHyperdriveBinding,
	assertValidDbName,
	bindingName,
	findBinding,
	hyperdriveConfigName,
	parseHyperdriveId,
	redact,
} from "./wrangler-config";

const CONFIG = "wrangler.jsonc";
const [name, connectionString] = process.argv.slice(2);

if (!name || !connectionString) {
	console.error('Usage: npm run add-db -- <name> "<postgres connection string>"');
	process.exit(1);
}

try {
	assertValidDbName(name);
	const text = readFileSync(CONFIG, "utf8");
	// Check before creating anything so a duplicate never leaves an orphan Hyperdrive config.
	if (findBinding(text, name)) throw new Error(`Database "${name}" already exists`);
	const configName = hyperdriveConfigName(text, name);

	let output: string;
	try {
		output = execFileSync(
			"npx",
			["wrangler", "hyperdrive", "create", configName, `--connection-string=${connectionString}`, "--caching-disabled"],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	} catch (error) {
		// execFileSync's error message embeds argv, which contains the connection string.
		const stderr = String((error as { stderr?: unknown }).stderr ?? "");
		throw new Error(`wrangler hyperdrive create failed:\n${redact(stderr, connectionString)}`);
	}

	writeFileSync(CONFIG, addHyperdriveBinding(text, name, parseHyperdriveId(output)));
	execFileSync("npx", ["wrangler", "deploy"], { stdio: "inherit" });
	console.log(`Added database "${name}" as ${bindingName(name)}.`);
} catch (error) {
	console.error(redact((error as Error).message, connectionString));
	process.exit(1);
}
