import { Client, type QueryConfig } from "pg";

export const MAX_SQL_LENGTH = 16000;
export const MAX_ROWS = 5000;
const STATEMENT_TIMEOUT = "10s";
const CONNECT_TIMEOUT_MS = 5000;

export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

export class UserFacingError extends Error {}

export function validateSql(sql: string): void {
	if (sql.trim().length === 0 || sql.length > MAX_SQL_LENGTH) {
		throw new UserFacingError(`SQL must be 1–${MAX_SQL_LENGTH} characters`);
	}
}

export function shapeResult(rows: Record<string, unknown>[]): QueryResult {
	if (rows.length > MAX_ROWS) {
		throw new UserFacingError(`Result has more than ${MAX_ROWS} rows; aggregate in SQL`);
	}
	return { rows, rowCount: rows.length };
}

export async function runReadonly(
	database: string,
	connectionString: string,
	sql: string,
): Promise<QueryResult> {
	validateSql(sql);
	const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
	try {
		await client.connect();
	} catch {
		throw new UserFacingError(`Database "${database}" is unreachable`);
	}
	try {
		await client.query("BEGIN READ ONLY");
		await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
		// Extended protocol makes Postgres reject more than one statement.
		const result = await client.query({ text: sql, queryMode: "extended" } as QueryConfig);
		return shapeResult(result.rows);
	} catch (error) {
		if (error instanceof UserFacingError) throw error;
		throw new UserFacingError(`Query failed: ${(error as Error).message}`);
	} finally {
		await client.query("ROLLBACK").catch(() => undefined);
		await client.end().catch(() => undefined);
	}
}
