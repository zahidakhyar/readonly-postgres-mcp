import { describe, expect, it } from "vitest";
import { getConnectionString, listDatabases } from "../src/registry";

const env = {
	HD_SHOP: { connectionString: "postgres://t" },
	HD_ANALYTICS: { connectionString: "postgres://e" },
	OAUTH_KV: {},
	ALLOWED_EMAILS: "a@b.c",
	HD_BROKEN: "not a binding",
};

describe("listDatabases", () => {
	it("returns lowercase names of HD_ bindings, sorted", () => {
		expect(listDatabases(env)).toEqual(["analytics", "shop"]);
	});

	it("returns an empty list when there are none", () => {
		expect(listDatabases({ OAUTH_KV: {} })).toEqual([]);
	});
});

describe("getConnectionString", () => {
	it("resolves a database by name", () => {
		expect(getConnectionString(env, "analytics")).toBe("postgres://e");
	});

	it("ignores case", () => {
		expect(getConnectionString(env, "Analytics")).toBe("postgres://e");
	});

	it("returns undefined for unknown names and non-bindings", () => {
		expect(getConnectionString(env, "nope")).toBeUndefined();
		expect(getConnectionString(env, "broken")).toBeUndefined();
	});
});
