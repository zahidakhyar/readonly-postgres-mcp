import { describe, expect, it, vi } from "vitest";
import { withAllowlist } from "../src/guard";

const inner = { fetch: vi.fn(async () => new Response("ok")) };
const env = { ALLOWED_EMAILS: "alice@example.com" };
const request = new Request("https://x/mcp");

describe("withAllowlist", () => {
	it("passes requests from an allowlisted token through", async () => {
		const res = await withAllowlist(inner).fetch(request, env, { props: { email: "alice@example.com" } });
		expect(res.status).toBe(200);
	});

	it("refuses a token whose email was removed from the allowlist", async () => {
		inner.fetch.mockClear();
		const res = await withAllowlist(inner).fetch(request, { ALLOWED_EMAILS: "other@x.com" }, {
			props: { email: "alice@example.com" },
		});
		expect(res.status).toBe(403);
		expect(inner.fetch).not.toHaveBeenCalled();
	});

	it("refuses when the token carries no email", async () => {
		const res = await withAllowlist(inner).fetch(request, env, {});
		expect(res.status).toBe(403);
	});
});
