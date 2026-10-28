import { describe, expect, it, vi } from "vitest";
import { UserFacingError } from "../src/sql";
import { executeSqlReadonlyTool, listDatabasesTool } from "../src/tools";

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
