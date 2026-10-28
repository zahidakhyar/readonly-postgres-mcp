import { isEmailAllowed } from "./allowlist";

type FetchHandler = {
	fetch(request: Request, env: any, ctx: any): Response | Promise<Response>;
};

// Re-checks the allowlist on every MCP request, so removing an email revokes
// tokens already issued (refresh tokens otherwise live for 30 days).
export function withAllowlist(handler: FetchHandler): FetchHandler {
	return {
		fetch(request, env, ctx) {
			if (!isEmailAllowed(ctx?.props?.email, true, env?.ALLOWED_EMAILS)) {
				return new Response("This Google account is not allowed to use this connector.", { status: 403 });
			}
			return handler.fetch(request, env, ctx);
		},
	};
}
