import { applyEdits, modify, parse } from "jsonc-parser";

const DB_NAME_PATTERN = /^[a-z][a-z0-9_]{0,30}$/;
const FORMAT = { formattingOptions: { insertSpaces: true, tabSize: 2 } };

type HyperdriveBinding = { binding: string; id: string };

export function assertValidDbName(name: string): void {
	if (!DB_NAME_PATTERN.test(name)) {
		throw new Error(`Invalid database name "${name}": must match ${DB_NAME_PATTERN}`);
	}
}

export function bindingName(name: string): string {
	return `HD_${name.toUpperCase()}`;
}

function bindings(text: string): HyperdriveBinding[] {
	return parse(text)?.hyperdrive ?? [];
}

function withBindings(text: string, next: HyperdriveBinding[]): string {
	return applyEdits(text, modify(text, ["hyperdrive"], next, FORMAT));
}

// Hyperdrive config names are unique per account, so prefix with the worker
// name to let several deployments (or other projects) use the same db name.
export function hyperdriveConfigName(text: string, name: string): string {
	const worker = parse(text)?.name;
	if (!worker) throw new Error('wrangler.jsonc has no "name"');
	return `${worker}-${name}`;
}

export function findBinding(text: string, name: string): HyperdriveBinding | undefined {
	return bindings(text).find((b) => b.binding === bindingName(name));
}

export function addHyperdriveBinding(text: string, name: string, id: string): string {
	assertValidDbName(name);
	if (findBinding(text, name)) throw new Error(`Database "${name}" already exists`);
	return withBindings(text, [...bindings(text), { binding: bindingName(name), id }]);
}

export function removeHyperdriveBinding(text: string, name: string): { text: string; id: string } {
	const found = findBinding(text, name);
	if (!found) throw new Error(`Database "${name}" not found`);
	const next = bindings(text).filter((b) => b.binding !== found.binding);
	return { text: withBindings(text, next), id: found.id };
}

export function parseHyperdriveId(output: string): string {
	const match = output.match(/"id":\s*"([0-9a-f]{32})"/);
	if (!match) throw new Error("Could not find the Hyperdrive id in wrangler output");
	return match[1];
}

export function redact(text: string, secret: string): string {
	return text.split(secret).join("<redacted>");
}
