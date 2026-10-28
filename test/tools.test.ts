import { describe, expect, it, vi } from "vitest";
import { DESCRIBE_TABLE_SQL, LIST_TABLES_SQL } from "../src/schema";
import { UserFacingError } from "../src/sql";
import { describeSchemaTool, executeSqlReadonlyTool, listDatabasesTool } from "../src/tools";

const env = { HD_ANALYTICS: { connectionString: "postgres://e" }, HD_SHOP: { connectionString: "postgres://t" } };

describe("listDatabasesTool", () => {
	it("returns database names only", () => {
		const result = listDatabasesTool(env);
		expect(result.isError).toBeUndefined();
		expect(JSON.parse(result.content[0].text)).toEqual({ databases: ["analytics", "shop"] });
	});
});

describe("executeSqlReadonlyTool", () => {
	it("runs the query on the named database and returns rows", async () => {
		const run = vi.fn().mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
		const result = await executeSqlReadonlyTool(env, { database: "Analytics", sql: "select 1 as n" }, run);
		expect(run).toHaveBeenCalledWith("analytics", "postgres://e", "select 1 as n");
		expect(JSON.parse(result.content[0].text)).toEqual({ rows: [{ n: 1 }], rowCount: 1 });
		expect(result.structuredContent).toEqual({ rows: [{ n: 1 }], rowCount: 1 });
	});

	it("names the available databases for an unknown one", async () => {
		const run = vi.fn();
		const result = await executeSqlReadonlyTool(env, { database: "nope", sql: "select 1" }, run);
		expect(result).toEqual({
			content: [{ type: "text", text: 'Unknown database "nope". Available: analytics, shop' }],
			isError: true,
		});
		expect(run).not.toHaveBeenCalled();
	});

	it("turns a UserFacingError into a tool error", async () => {
		const run = vi.fn().mockRejectedValue(new UserFacingError("Query failed: boom"));
		const result = await executeSqlReadonlyTool(env, { database: "analytics", sql: "x" }, run);
		expect(result).toEqual({ content: [{ type: "text", text: "Query failed: boom" }], isError: true });
	});

	it("does not leak unexpected errors into the result", async () => {
		const run = vi.fn().mockRejectedValue(new Error("postgres://u:secretpw@host"));
		await expect(executeSqlReadonlyTool(env, { database: "analytics", sql: "x" }, run)).rejects.toThrow();
	});
});

describe("describeSchemaTool", () => {
	it("lists tables with the schema filter bound as a parameter", async () => {
		const rows = [{ schema: "sales", name: "orders", kind: "table", estimatedRows: 10, comment: null }];
		const run = vi.fn().mockResolvedValue({ rows, rowCount: 1 });
		const result = await describeSchemaTool(env, { database: "Analytics", schema: "sales" }, run);
		expect(run).toHaveBeenCalledWith("analytics", "postgres://e", LIST_TABLES_SQL, ["sales"]);
		expect(result.structuredContent).toEqual({ tables: rows });
		expect(JSON.parse(result.content[0].text)).toEqual({ tables: rows });
	});

	it("lists all schemas when none is given", async () => {
		const run = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
		await describeSchemaTool(env, { database: "analytics" }, run);
		expect(run).toHaveBeenCalledWith("analytics", "postgres://e", LIST_TABLES_SQL, [null]);
	});

	it("describes one table", async () => {
		const row = { schema: "sales", name: "orders", kind: "table", comment: null, columns: [], primaryKey: [], foreignKeys: [] };
		const run = vi.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
		const result = await describeSchemaTool(env, { database: "analytics", schema: "other", table: "sales.orders" }, run);
		expect(run).toHaveBeenCalledWith("analytics", "postgres://e", DESCRIBE_TABLE_SQL, ["sales.orders"]);
		expect(result.structuredContent).toEqual(row);
	});

	it("reports a missing or unreadable table", async () => {
		const run = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
		const result = await describeSchemaTool(env, { database: "analytics", table: "sales.orders" }, run);
		expect(result).toEqual({
			content: [{ type: "text", text: 'Table "sales.orders" not found or not readable' }],
			isError: true,
		});
	});

	it("names the available databases for an unknown one", async () => {
		const run = vi.fn();
		const result = await describeSchemaTool(env, { database: "nope" }, run);
		expect(result).toEqual({
			content: [{ type: "text", text: 'Unknown database "nope". Available: analytics, shop' }],
			isError: true,
		});
		expect(run).not.toHaveBeenCalled();
	});

	it("turns a UserFacingError into a tool error", async () => {
		const run = vi.fn().mockRejectedValue(new UserFacingError("Query failed: boom"));
		const result = await describeSchemaTool(env, { database: "analytics" }, run);
		expect(result).toEqual({ content: [{ type: "text", text: "Query failed: boom" }], isError: true });
	});
});
