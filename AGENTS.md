# AGENTS.md

## Source of Truth
The canonical, always-current reference for this application's API, routes, endpoints, schemas, types, architecture, configuration, environment variables, and CLI commands is the published docs at **https://inicontent.com/docs** (index: https://inicontent.com/llms.txt). Read `https://inicontent.com/docs/agents.md` first for the entrypoint.

## Fetching the docs
- The machine-readable index is `https://inicontent.com/llms.txt` — start there.
- Guides render at `https://inicontent.com/docs/<name>` and are also served as plain markdown at `https://inicontent.com/docs/<name>.md`.

## Mandatory Workflow for API-Dependent Work
When answering questions, writing code, or making changes that depend on this application's contract (endpoints, params, bodies, responses, auth, types, env vars, CLI/scripts):

1. **Fetch**: Retrieve `https://inicontent.com/llms.txt`.
2. **Identify**: Find the guide that best represents the task (api, `rest-api`, `query-language`, `schema-rules`, …).
3. **Read**: Fetch `https://inicontent.com/docs/<name>.md` and read the **full** contents. Do not truncate.
4. **Use only the docs**: Base every answer, assumption, type, implementation, or proposed change strictly on what you read.

## Rules
- **Discovery over hardcoding.** Never hardcode endpoints, paths, schemas, or assume details from memory.
- **Stop if unavailable.** If the docs are unreachable or return nothing useful, stop and ask the user how to proceed. Do not guess.