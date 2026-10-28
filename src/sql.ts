import { Client, Query, type QueryConfig } from "pg";

export const MAX_SQL_LENGTH = 16000;
export const MAX_ROWS = 5000;
const STATEMENT_TIMEOUT = "10s";
const CONNECT_TIMEOUT_MS = 5000;

export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number };

type Row = Record<string, unknown>;
// Not in @types/pg: pg's Query reads queryMode, and Client keeps its socket on connection.stream.
type ExtendedQueryConfig = QueryConfig & { queryMode: "extended" };
type ClientWithStream = Client & { connection: { stream: { destroy(): void } } };

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
	values?: unknown[],
): Promise<QueryResult> {
	validateSql(sql);
	const client = new Client({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
	// The socket is destroyed on purpose at the row cap, and Hyperdrive can drop it too; an unhandled error event crashes the isolate.
	client.on("error", () => undefined);
	try {
		await client.connect();
	} catch {
		throw new UserFacingError(`Database "${database}" is unreachable`);
	}
	try {
		await client.query("BEGIN READ ONLY");
		await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
		// Extended protocol makes Postgres reject more than one statement.
		// No portal row limit or cursor: Hyperdrive drops the connection on PortalSuspended and on named portals.
		const config: ExtendedQueryConfig = { text: sql, values, queryMode: "extended" };
		const query = client.query(new Query<Row>(config));
		const rows = await new Promise<Row[]>((resolve, reject) => {
			const collected: Row[] = [];
			let settled = false;
			query.on("row", (row) => {
				if (settled) return;
				collected.push(row);
				// One row past the cap is enough for shapeResult to reject; reading further would buffer it all.
				if (collected.length > MAX_ROWS) {
					settled = true;
					(client as ClientWithStream).connection.stream.destroy();
					resolve(collected);
				}
			});
			query.on("end", () => {
				if (settled) return;
				settled = true;
				resolve(collected);
			});
			query.on("error", (error) => {
				if (settled) return;
				settled = true;
				reject(error);
			});
		});
		return shapeResult(rows);
	} catch (error) {
		if (error instanceof UserFacingError) throw error;
		throw new UserFacingError(`Query failed: ${(error as Error).message}`);
	} finally {
		await client.query("ROLLBACK").catch(() => undefined);
		await client.end().catch(() => undefined);
	}
}
