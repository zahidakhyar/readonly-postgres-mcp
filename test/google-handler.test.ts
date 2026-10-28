import { describe, expect, it } from "vitest";
import { redirectToGoogle } from "../src/google-handler";

const env = { GOOGLE_CLIENT_ID: "client-id", HOSTED_DOMAIN: "" };
const request = new Request("https://mcp.example.com/authorize");

describe("redirectToGoogle", () => {
	it("keeps every Set-Cookie header", () => {
		const res = redirectToGoogle(request, env, "state-token", ["approved=a", "session=b"]);
		expect(res.headers.getSetCookie()).toEqual(["approved=a", "session=b"]);
	});

	it("redirects to Google with the state and callback URL", () => {
		const res = redirectToGoogle(request, env, "state-token", []);
		const location = new URL(res.headers.get("location") as string);
		expect(res.status).toBe(302);
		expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
		expect(location.searchParams.get("state")).toBe("state-token");
		expect(location.searchParams.get("redirect_uri")).toBe("https://mcp.example.com/callback");
	});
});
