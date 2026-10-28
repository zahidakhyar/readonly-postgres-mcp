import { env } from "cloudflare:workers";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { GoogleHandler } from "./google-handler";
import { withAllowlist } from "./guard";
import { registerTools } from "./tools";

function createServer() {
	const server = new McpServer({
		name: "readonly-postgres-mcp",
		version: "0.0.1",
	});
	registerTools(server, env as unknown as Record<string, unknown>);
	return server;
}

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider<Env>({
	apiHandler: withAllowlist({
		fetch: (request: Request, env: Env, ctx: ExecutionContext) => mcpHandler(request, env, ctx),
	}),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: GoogleHandler as any,
	tokenEndpoint: "/token",
	// The URL MCP clients connect to. Every token is bound to it.
	resourceMetadata: { resource: env.MCP_RESOURCE },
});
