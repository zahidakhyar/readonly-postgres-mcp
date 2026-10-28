export type BindingEnv = Record<string, unknown>;

const PREFIX = "HD_";

type HyperdriveLike = { connectionString: string };

function isHyperdrive(value: unknown): value is HyperdriveLike {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as HyperdriveLike).connectionString === "string"
	);
}

export function listDatabases(env: BindingEnv): string[] {
	return Object.keys(env)
		.filter((key) => key.startsWith(PREFIX) && isHyperdrive(env[key]))
		.map((key) => key.slice(PREFIX.length).toLowerCase())
		.sort();
}

export function getConnectionString(env: BindingEnv, database: string): string | undefined {
	const binding = env[PREFIX + database.toUpperCase()];
	return isHyperdrive(binding) ? binding.connectionString : undefined;
}
