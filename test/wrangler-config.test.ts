import { parse } from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
	addHyperdriveBinding,
	assertValidDbName,
	findBinding,
	hyperdriveConfigName,
	parseHyperdriveId,
	redact,
	removeHyperdriveBinding,
} from "../scripts/wrangler-config";

const config = `{
  // Worker config
  "name": "readonly-postgres-mcp",
  "hyperdrive": [
    { "binding": "HD_ANALYTICS", "id": "11111111111111111111111111111111" }
  ]
}`;

describe("assertValidDbName", () => {
	it("accepts lowercase names", () => {
		expect(() => assertValidDbName("shop_2")).not.toThrow();
	});

	it("rejects bad names", () => {
		for (const bad of ["", "Shop", "1shop", "shop-db", "a".repeat(32)]) {
			expect(() => assertValidDbName(bad)).toThrow(/Invalid database name/);
		}
	});
});

describe("hyperdriveConfigName", () => {
	it("prefixes the database name with the worker name", () => {
		expect(hyperdriveConfigName(config, "shop")).toBe("readonly-postgres-mcp-shop");
	});

	it("throws when the config has no worker name", () => {
		expect(() => hyperdriveConfigName("{}", "shop")).toThrow('wrangler.jsonc has no "name"');
	});
});

describe("addHyperdriveBinding", () => {
	it("appends a binding and keeps comments", () => {
		const next = addHyperdriveBinding(config, "shop", "22222222222222222222222222222222");
		expect(next).toContain("// Worker config");
		expect(parse(next).hyperdrive).toEqual([
			{ binding: "HD_ANALYTICS", id: "11111111111111111111111111111111" },
			{ binding: "HD_SHOP", id: "22222222222222222222222222222222" },
		]);
	});

	it("works when the hyperdrive key is missing", () => {
		const next = addHyperdriveBinding(`{ "name": "readonly-postgres-mcp" }`, "shop", "22222222222222222222222222222222");
		expect(parse(next).hyperdrive).toEqual([{ binding: "HD_SHOP", id: "22222222222222222222222222222222" }]);
	});

	it("refuses a name that already exists", () => {
		expect(() => addHyperdriveBinding(config, "analytics", "x")).toThrow('Database "analytics" already exists');
	});
});

describe("removeHyperdriveBinding", () => {
	it("removes the binding and returns its id", () => {
		const { text, id } = removeHyperdriveBinding(config, "analytics");
		expect(id).toBe("11111111111111111111111111111111");
		expect(parse(text).hyperdrive).toEqual([]);
		expect(findBinding(text, "analytics")).toBeUndefined();
	});

	it("refuses an unknown name", () => {
		expect(() => removeHyperdriveBinding(config, "nope")).toThrow('Database "nope" not found');
	});
});

describe("parseHyperdriveId", () => {
	it("finds the id in wrangler output", () => {
		const output = `✅ Created new Hyperdrive config\n{\n  "id": "0123456789abcdef0123456789abcdef",\n  "name": "shop"\n}`;
		expect(parseHyperdriveId(output)).toBe("0123456789abcdef0123456789abcdef");
	});

	it("throws when there is no id", () => {
		expect(() => parseHyperdriveId("nothing here")).toThrow("Could not find the Hyperdrive id");
	});
});

describe("redact", () => {
	it("hides every occurrence of the secret", () => {
		expect(redact("a postgres://u:pw@h b postgres://u:pw@h", "postgres://u:pw@h")).toBe("a <redacted> b <redacted>");
	});
});
