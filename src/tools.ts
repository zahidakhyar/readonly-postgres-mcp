import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { type BindingEnv, getConnectionString, listDatabases } from "./registry";
import { DESCRIBE_TABLE_SQL, LIST_TABLES_SQL } from "./schema";
import { type QueryResult, UserFacingError, runReadonly } from "./sql";

export type ToolResult = {
	content: { type: "text"; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};
type Runner = (database: string, connectionString: string, sql: string, values?: unknown[]) => Promise<QueryResult>;

// structuredContent lets the Artifact dashboard read `rows` directly; the text copy is for clients without it.
const ok = (data: Record<string, unknown>): ToolResult => ({
	content: [{ type: "text", text: JSON.stringify(data) }],
	structuredContent: data,
});
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

export function listDatabasesTool(env: BindingEnv): ToolResult {
	return ok({ databases: listDatabases(env) });
}

export async function executeSqlReadonlyTool(
	env: BindingEnv,
	input: { database: string; sql: string },
	run: Runner = runReadonly,
): Promise<ToolResult> {
	const connectionString = getConnectionString(env, input.database);
	if (!connectionString) {
		const available = listDatabases(env).join(", ") || "none";
		return fail(`Unknown database "${input.database}". Available: ${available}`);
	}
	try {
		return ok(await run(input.database.toLowerCase(), connectionString, input.sql));
	} catch (error) {
		if (error instanceof UserFacingError) return fail(error.message);
		throw error;
	}
}

export async function describeSchemaTool(
	env: BindingEnv,
	input: { database: string; schema?: string; table?: string },
	run: Runner = runReadonly,
): Promise<ToolResult> {
	const connectionString = getConnectionString(env, input.database);
	if (!connectionString) {
		const available = listDatabases(env).join(", ") || "none";
		return fail(`Unknown database "${input.database}". Available: ${available}`);
	}
	const database = input.database.toLowerCase();
	try {
		if (input.table === undefined) {
			const { rows } = await run(database, connectionString, LIST_TABLES_SQL, [input.schema ?? null]);
			return ok({ tables: rows });
		}
		const { rows } = await run(database, connectionString, DESCRIBE_TABLE_SQL, [input.table]);
		return rows[0] ? ok(rows[0]) : fail(`Table "${input.table}" not found or not readable`);
	} catch (error) {
		if (error instanceof UserFacingError) return fail(error.message);
		throw error;
	}
}

export function registerTools(server: McpServer, env: BindingEnv): void {
	server.registerTool(
		"list_databases",
		{ description: "List the databases this connector can query.", annotations: { readOnlyHint: true } },
		async () => listDatabasesTool(env),
	);
	server.registerTool(
		"execute_sql_readonly",
		{
			description:
				"Run one read-only SQL statement on a database from list_databases. Returns {rows, rowCount}. Max 5000 rows, 10s timeout; aggregate in SQL.",
			inputSchema: z.object({
				database: z.string().describe("Name from list_databases"),
				sql: z.string().describe("One SQL statement"),
			}),
			annotations: { readOnlyHint: true },
		},
		async (input) => executeSqlReadonlyTool(env, input),
	);
	server.registerTool(
		"describe_schema",
		{
			description:
				"List the tables and views this connector can read (optionally in one schema), or pass table (schema.table or table) to get its readable columns, primary key and foreign keys.",
			inputSchema: z.object({
				database: z.string().describe("Name from list_databases"),
				schema: z.string().optional(),
				table: z.string().optional(),
			}),
			annotations: { readOnlyHint: true },
		},
		async (input) => describeSchemaTool(env, input),
	);
}
