# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: open the repository's
**Security** tab and choose **Report a vulnerability**. Do not open a public
issue for anything that could let someone read data they should not see, get
past the email allowlist, or write to a database.

You can expect a first reply within a week. Fixes go to `main`; there are no
maintained release branches.

## Scope

In scope: the Worker code in `src/`, the `add-db` / `remove-db` scripts, and
the defaults in `wrangler.example.jsonc`.

Out of scope: what a correctly allowlisted user can read with the database
role you configured. The role's grants define what is exposed; see
"Database roles" in the README.
