import { describe, expect, it } from "vitest";
import { runReadonly } from "../src/sql";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("runReadonly against Postgres", () => {
	const run = (sql: string) => runReadonly("test", url as string, sql);

	it("returns rows as plain objects", async () => {
		expect(await run("select 1::int as n, 'a' as s")).toEqual({ rows: [{ n: 1, s: "a" }], rowCount: 1 });
	});

	it("accepts a trailing semicolon", async () => {
		expect((await run("select 1 as n;")).rowCount).toBe(1);
	});

	it("returns an empty result for zero rows", async () => {
		expect(await run("select 1 as n where false")).toEqual({ rows: [], rowCount: 0 });
	});

	it("refuses a huge result without reading all of it", async () => {
		const started = Date.now();
		// generate_series in the select list streams; in FROM it would materialize all 10M rows server-side first.
		await expect(run("select generate_series(1, 10000000) as g")).rejects.toThrow(
			"Result has more than 5000 rows; aggregate in SQL",
		);
		expect(Date.now() - started).toBeLessThan(3_000);
	}, 15_000);

	it("returns exactly MAX_ROWS rows", async () => {
		expect((await run("select g from generate_series(1, 5000) g")).rowCount).toBe(5000);
	});

	it("runs row-returning statements that are not SELECT", async () => {
		expect((await run("explain select 1")).rowCount).toBeGreaterThan(0);
		expect(await run("show statement_timeout")).toEqual({ rows: [{ statement_timeout: "10s" }], rowCount: 1 });
	});

	it("surfaces an error raised mid-read as Query failed", async () => {
		await expect(run("select 1 / (5000 - g) from generate_series(1, 10000) g")).rejects.toThrow(
			/^Query failed: division by zero/,
		);
	});

	it("rejects quickly when the connection is dropped mid-query", async () => {
		const started = Date.now();
		await expect(run("select pg_terminate_backend(pg_backend_pid())")).rejects.toThrow(/^Query failed: /);
		expect(Date.now() - started).toBeLessThan(3_000);
	}, 15_000);

	it("rejects multiple statements", async () => {
		await expect(run("select 1; select 2")).rejects.toThrow(/^Query failed: .*multiple commands/);
	});

	it("rejects writes", async () => {
		await expect(run("create table sqlmcp_should_fail (a int)")).rejects.toThrow(/^Query failed: .*read-only transaction/);
	});

	it("times out after 10 seconds", async () => {
		await expect(run("select pg_sleep(11)")).rejects.toThrow(/^Query failed: .*statement timeout/);
	}, 20_000);

	it("cannot switch its own transaction to read-write", async () => {
		await expect(run("select set_config('transaction_read_only', 'off', true)")).rejects.toThrow(
			/^Query failed: .*read-write mode must be set before any query/,
		);
	});

	it("cannot lift the statement timeout from inside the query", async () => {
		await expect(run("select set_config('statement_timeout', '0', true), pg_sleep(11)")).rejects.toThrow(
			/^Query failed: .*statement timeout/,
		);
	}, 20_000);

	it("reports an unreachable database without the connection string", async () => {
		const error = await runReadonly("ghost", "postgres://u:secretpw@127.0.0.1:1/x", "select 1").catch((e) => e);
		expect(error.message).toBe('Database "ghost" is unreachable');
		expect(error.message).not.toContain("secretpw");
	});
});
