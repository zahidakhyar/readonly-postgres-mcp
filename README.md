# readonly-postgres-mcp

A remote [MCP](https://modelcontextprotocol.io) server that lets Claude (or any
MCP client) run read-only SQL against your Postgres databases. It runs as a
Cloudflare Worker, reaches the databases through
[Hyperdrive](https://developers.cloudflare.com/hyperdrive/), and only lets in
the Google accounts you list.

I built it to plug production databases into claude.ai as a custom connector,
so Claude can answer questions and build dashboards from live data through a
connection that cannot write.

## Security model

- Only verified Google accounts listed in `ALLOWED_EMAILS` can connect. The
  list is checked again on every MCP request, so removing an email locks that
  person out right away, even if they still hold a token.
- OAuth tokens are bound to the server's URL (`MCP_RESOURCE`), so a token
  issued here is refused anywhere else, and the reverse. The Google access
  token is used once to read the email and is not stored.
- Every query runs inside `BEGIN READ ONLY` and is always rolled back. The
  extended query protocol makes Postgres reject anything with more than one
  statement.
- Queries get a 10s statement timeout and a 5s connect timeout. SQL is capped
  at 16,000 characters and results at 5,000 rows.
- The database role decides what Claude can see. Connect each database with a
  dedicated role that can only read the columns you want exposed (see
  [Database roles](#database-roles)); treat the guards above as a backstop.

## Tools

| Tool | Input | Output |
|------|-------|--------|
| `list_databases` | none | `{ databases: string[] }` |
| `execute_sql_readonly` | `{ database, sql }` | `{ rows, rowCount }` |

Results come back both as JSON text and as `structuredContent`.

## Setup

You need a Cloudflare account (the free plan works, with up to 10 Hyperdrive
configs) and a Google Cloud project for the OAuth client.

### 1. Install and configure

```bash
git clone https://github.com/zahidakhyar/readonly-postgres-mcp.git
cd readonly-postgres-mcp
npm install
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler kv namespace create readonly-postgres-mcp-oauth
```

In `wrangler.jsonc`, paste the KV namespace id from the last command into the
`OAUTH_KV` binding, and set `MCP_RESOURCE` to the URL clients will connect to
(`https://readonly-postgres-mcp.<your-subdomain>.workers.dev/mcp`). It must
match the connector URL exactly, or sign-in fails with `invalid_target`.
`wrangler.jsonc` is gitignored, so your ids stay out of the repo.

### 2. Create a Google OAuth client

In Google Cloud Console → APIs & Services → Credentials, create an OAuth
client of type **Web application** with these redirect URIs:

- `https://readonly-postgres-mcp.<your-subdomain>.workers.dev/callback`
- `http://localhost:8788/callback` (local development)

### 3. Set secrets and deploy

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY   # e.g. openssl rand -hex 32
npx wrangler secret put ALLOWED_EMAILS          # comma-separated
npm run deploy
```

Optionally set `HOSTED_DOMAIN` to limit the Google sign-in screen to one
Google Workspace domain.

### 4. Add databases

```bash
npm run add-db -- <name> "<postgres connection string>"
npm run remove-db -- <name>
```

`add-db` creates a Hyperdrive config named `<worker>-<name>` (caching
disabled), adds an `HD_<NAME>` binding to `wrangler.jsonc`, and redeploys.
Names are lowercase letters, digits and `_`. The connection string is redacted
from any error output.

### 5. Connect a client

In claude.ai, open Settings → Connectors → Add custom connector and enter
`https://readonly-postgres-mcp.<your-subdomain>.workers.dev/mcp`. Other MCP
clients that support remote servers with OAuth use the same URL.

## Database roles

Give each database its own read-only role and grant only the columns you
need. Revoke table-level `SELECT` and default privileges first, **as the table
owner**, then verify. A `REVOKE` run by the wrong role only prints a warning,
so the check at the end matters:

```sql
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM <role>;
ALTER DEFAULT PRIVILEGES FOR ROLE <owner> REVOKE SELECT ON TABLES FROM <role>;
ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA public REVOKE SELECT ON TABLES FROM <role>;
GRANT SELECT (<columns>) ON <table> TO <role>;
-- run through the connector; must be false for every sensitive table:
SELECT has_table_privilege('<table>', 'SELECT');
```

## Development

```bash
cp .dev.vars.example .dev.vars   # fill in; restart wrangler dev after edits
npm test
npm run type-check
TEST_DATABASE_URL=postgres://... npx vitest run test/sql.integration.test.ts
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HD_<NAME>=postgres://... npx wrangler dev
```

`wrangler dev` serves on port 8788, so the local MCP URL is
`http://localhost:8788/mcp`.

## Reporting security issues

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). The OAuth plumbing is adapted from Cloudflare's
[remote-mcp-google-oauth](https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-google-oauth)
template (MIT); see [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES).
