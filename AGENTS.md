# AGENTS.md

Instructions for AI agents (and humans) working in this repository.

## Read `CONTEXT.md` first

[`CONTEXT.md`](CONTEXT.md) is the authoritative reference for everything platform-specific. Read the
sections you need **before** writing code — do not guess from memory or from the in-app `/admin/api`
page, which is out of date.

| You are doing… | Read |
| --- | --- |
| Authenticating / calling the API | §3 Auth, §5 REST API, §6 Query language |
| Reading or changing a schema | §4 Database discovery, §7 Schema & field types, §10 Meta endpoints |
| Totals, derived numbers, line totals | §8 Computed fields |
| Automating data (validation, defaults, emails) | §9 Flows |
| Working through a code agent (ChatGPT, Claude, Cursor, OpenCode) | §11 The MCP server (`@inicontent/mcp`), plus per-tool docs in the connected agent |
| Charts, counters, live updates, backups | §12 Dashboards, §13 Realtime, §10.5 Backups |
| Building custom per-table screens | §15 Custom interfaces (file-based overrides) |
| Debugging a failed call | §17 Troubleshooting, then §18 Quick reference |

## Non-negotiables

- **Never invent API params.** The only query params that carry pagination, projection and sorting
  are `options` and `where`, both **Inison-stringified and URL-encoded** (`CONTEXT.md` §5.1/§6).
  The default `perPage` is **15**. There is no top-level `page` / `limit` / `columns` / `search` param.
- **Errors arrive with HTTP 200.** Judge every response by its body: `result: null` plus a **string**
  `code` (`dbNotFound`, `accessDenied`, `COMPUTED_FIELD_SETTABLE`, …) means failure; a numeric `code`
  (`200`/`201`/`202`/`204`) means success. A few validation routes do use real 401/403.
- **Ask the user** for the database slug, username and password. Never invent them, never hardcode
  them, never print or log them — use env vars.
- **Never send a computed field's key in a create/update body.** Computed values are engine-owned
  and read-only (`CONTEXT.md` §8).
- **Schema, `onRequest` and `onResponse` replace wholesale.** Always read the current table first
  (or `GET inicontent/databases/{db}`) and merge before you `PUT` — a partial `schema` wipes fields.
- **Custom table pages are file-based, not registered.** Put the page at
  `app/pages/admin/tables/<tableSlug>/…` (folder name = the table slug, no `[[database]]` segment)
  and it overrides the CMS screen — there is no `hooks["pages:extend"]` step (`CONTEXT.md` §15).
- **Aggregate server-side.** Totals and counters go through `GET {db}/{table}/sum`, never by summing
  a page of rows in the client.
- **Respect `allowedMethods` (`r`/`c`/`u`/`d`) and `show`** per table, and the DB super-admin
  requirement on dashboards writes, backups, export and domains.
- **Never propose a second `users` table** — edit the existing one (`CONTEXT.md` §7.4).

## Project shape

- This repo is a **Nuxt 4 app that extends the `inicontent` layer** from npm
  (`extends: ["inicontent"]` in `nuxt.config.ts`). Do not edit `node_modules/inicontent`.
  To change CMS behaviour, add your own files — anything you put in `app/` (or `app/pages/`)
  **overrides** the layer's version of the same route.
- `pnpm dev` serves on **port 3434**.
- Env: `database` (required) selects the database; `apiBase` and `idOne` are optional overrides.

## Keeping this repo honest

`CONTEXT.md` is the product's documentation. If your change adds or changes an endpoint, a query
param, a schema/flow rule, a computed-field capability or a page route, **update `CONTEXT.md` in the
same change** — with the same path, param and field names you actually implemented.
