import { describe, expect, it } from "vitest";
import { MAX_ROWS, MAX_SQL_LENGTH, UserFacingError, runReadonly, shapeResult, validateSql } from "../src/sql";

describe("validateSql", () => {
	it("accepts normal SQL", () => {
		expect(() => validateSql("select 1")).not.toThrow();
	});

	it("rejects empty or whitespace-only SQL", () => {
		expect(() => validateSql("")).toThrow("SQL must be 1–16000 characters");
		expect(() => validateSql("   \n")).toThrow(UserFacingError);
	});

	it("rejects SQL over the limit", () => {
		expect(() => validateSql("x".repeat(MAX_SQL_LENGTH + 1))).toThrow("SQL must be 1–16000 characters");
		expect(() => validateSql("x".repeat(MAX_SQL_LENGTH))).not.toThrow();
	});
});

describe("runReadonly connect timeout", () => {
	it("reports a host that never answers as unreachable within seconds", async () => {
		// 10.255.255.1 is non-routable, so the TCP connect hangs instead of being refused.
		const error = await runReadonly("ghost", "postgres://u:p@10.255.255.1:5432/x", "select 1").catch((e) => e);
		expect(error.message).toBe('Database "ghost" is unreachable');
	}, 8_000);
});

describe("shapeResult", () => {
	it("returns rows and their count", () => {
		expect(shapeResult([{ n: "1" }, { n: "2" }])).toEqual({ rows: [{ n: "1" }, { n: "2" }], rowCount: 2 });
	});

	it("returns an empty result for zero rows", () => {
		expect(shapeResult([])).toEqual({ rows: [], rowCount: 0 });
	});

	it("refuses more than MAX_ROWS instead of truncating", () => {
		const rows = Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ i }));
		expect(() => shapeResult(rows)).toThrow("Result has more than 5000 rows; aggregate in SQL");
		expect(shapeResult(rows.slice(0, MAX_ROWS)).rowCount).toBe(MAX_ROWS);
	});
});
