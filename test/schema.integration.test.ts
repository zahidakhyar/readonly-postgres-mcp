import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeSchemaTool } from "../src/tools";

const url = process.env.TEST_DATABASE_URL;
const SCHEMA = "sqlmcp_schema_test";
const NO_USAGE_SCHEMA = "sqlmcp_schema_nousage";
const ROLE = "sqlmcp_reader";

async function admin(sql: string): Promise<void> {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await client.query(sql);
	} finally {
		await client.end();
	}
}

describe.skipIf(!url)("describeSchemaTool against Postgres", () => {
	const readerUrl = new URL(url ?? "postgres://localhost");
	readerUrl.username = ROLE;
	readerUrl.password = "reader";
	const env = { HD_TEST: { connectionString: readerUrl.toString() } };
	const describeSchema = async (input: { schema?: string; table?: string }) =>
		describeSchemaTool(env, { database: "test", ...input });

	beforeAll(async () => {
		await admin(`
			drop schema if exists ${SCHEMA} cascade;
			drop schema if exists ${NO_USAGE_SCHEMA} cascade;
			drop role if exists ${ROLE};
			create schema ${SCHEMA};
			create table ${SCHEMA}.customers (id int primary key, name text not null, email text);
			create table ${SCHEMA}.orders (
				id int, line int, customer_id int references ${SCHEMA}.customers (id), total numeric,
				primary key (id, line)
			);
			comment on column ${SCHEMA}.orders.total is 'Order total';
			create table ${SCHEMA}.secret (x int);
			analyze ${SCHEMA}.customers;
			analyze ${SCHEMA}.orders;
			create role ${ROLE} login password 'reader';
			grant usage on schema ${SCHEMA} to ${ROLE};
			grant select (id, name) on ${SCHEMA}.customers to ${ROLE};
			grant select on ${SCHEMA}.orders to ${ROLE};
			create schema ${NO_USAGE_SCHEMA};
			create table ${NO_USAGE_SCHEMA}.t (a int);
			grant select on ${NO_USAGE_SCHEMA}.t to ${ROLE};
		`);
	});

	afterAll(async () => {
		await admin(`drop schema if exists ${SCHEMA} cascade; drop schema if exists ${NO_USAGE_SCHEMA} cascade; drop role if exists ${ROLE};`);
	});

	it("lists only readable tables", async () => {
		const result = await describeSchema({ schema: SCHEMA });
		const tables = result.structuredContent?.tables as { name: string; kind: string; estimatedRows: unknown }[];
		expect(tables.map((t) => t.name)).toEqual(["customers", "orders"]);
		for (const table of tables) {
			expect(table.kind).toBe("table");
			expect(typeof table.estimatedRows).toBe("number");
		}
	});

	it("lists only readable columns", async () => {
		const result = await describeSchema({ table: `${SCHEMA}.customers` });
		const columns = result.structuredContent?.columns as { name: string; nullable: boolean }[];
		expect(columns.map((c) => c.name)).toEqual(["id", "name"]);
		expect(columns.find((c) => c.name === "name")?.nullable).toBe(false);
	});

	it("returns composite and foreign keys in order", async () => {
		const result = await describeSchema({ table: `${SCHEMA}.orders` });
		expect(result.structuredContent?.primaryKey).toEqual(["id", "line"]);
		expect(result.structuredContent?.foreignKeys).toEqual([
			{ columns: ["customer_id"], references: { schema: SCHEMA, table: "customers", columns: ["id"] } },
		]);
		const columns = result.structuredContent?.columns as { name: string; type: string; comment: string | null }[];
		expect(columns.find((c) => c.name === "total")).toEqual({
			name: "total",
			type: "numeric",
			nullable: true,
			comment: "Order total",
		});
	});

	it("hides tables without a grant", async () => {
		expect(await describeSchema({ table: `${SCHEMA}.secret` })).toEqual({
			content: [{ type: "text", text: `Table "${SCHEMA}.secret" not found or not readable` }],
			isError: true,
		});
	});

	it("hides tables in a schema without USAGE", async () => {
		const listed = (await describeSchema({})).structuredContent?.tables as { schema: string }[];
		expect(listed.some((t) => t.schema === NO_USAGE_SCHEMA)).toBe(false);
		expect((await describeSchema({ schema: NO_USAGE_SCHEMA })).structuredContent).toEqual({ tables: [] });
		for (const table of [`${NO_USAGE_SCHEMA}.t`, `${NO_USAGE_SCHEMA}.missing`]) {
			expect(await describeSchema({ table })).toEqual({
				content: [{ type: "text", text: `Table "${table}" not found or not readable` }],
				isError: true,
			});
		}
	});

	it("does not describe system catalogs or indexes", async () => {
		for (const table of ["pg_class", `${SCHEMA}.customers_pkey`]) {
			expect((await describeSchema({ table })).content[0].text).toBe(`Table "${table}" not found or not readable`);
		}
	});

	it("binds input as data", async () => {
		const malformed = await describeSchema({ table: "x'); select 1; --" });
		expect(malformed.isError).toBe(true);
		expect(malformed.content[0].text).toMatch(/not found or not readable|^Query failed: /);
		expect((await describeSchema({ schema: "public' or '1'='1" })).structuredContent).toEqual({ tables: [] });
	});

	it("returns empty keys", async () => {
		const result = await describeSchema({ table: `${SCHEMA}.customers` });
		expect(result.structuredContent?.primaryKey).toEqual(["id"]);
		expect(result.structuredContent?.foreignKeys).toEqual([]);
	});
});
