# AGENTS.md

## Source of Truth
The `inicontent` MCP server is the canonical, always-current source for this application's API, routes, endpoints, schemas, types, architecture, configuration, environment variables, and CLI commands.

## Mandatory Workflow for API-Dependent Work
When answering questions, writing code, or making changes that depend on this application's contract (endpoints, params, bodies, responses, auth, types, env vars, CLI/scripts):

1. **Discover**: Call MCP "list resources" for server `inicontent`.
2. **Identify**: Find the resource that best represents the current, complete reference. Look for names, URIs, or descriptions containing `api`, `context`, `reference`, `canonical`, `latest`, or `docs`.
3. **Read**: Call MCP "read resource" with that exact URI and read the **full** contents. Do not truncate.
4. **Use only MCP**: Base every answer, assumption, type, implementation, or proposed change strictly on what you read from that resource.

## Rules
- **Discovery over hardcoding.** Never hardcode endpoints, paths, schemas, resource URIs, or assume details from memory.
- **Prefer the canonical one.** If multiple candidates exist, pick the most complete resource explicitly marked `canonical` or `latest`. Otherwise pick the most complete one covering the whole app.
- **Stop if unavailable.** If the `inicontent` MCP is unreachable, returns nothing useful, or repeatedly fails, stop and ask the user how to proceed. Do not guess.