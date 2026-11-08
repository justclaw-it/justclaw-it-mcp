# JustClaw-It MCP: install guide for Cline

JustClaw-It MCP is a hosted, remote MCP server (streamable HTTP) at `https://justclaw.it.com/mcp`. Nothing to build or run locally: you only add a server entry to Cline's MCP settings.

## 1. Get an API key (optional for first test)

`search_components` works with no key. Every other tool needs a free key from https://justclaw.it.com/signup (no card). Keys look like `cobalt_live_...`.

## 2. Add the server to Cline

**Cline CLI** (one command; checked against Cline CLI 3.0.74, it writes `cline_mcp_settings.json` for you):

```sh
cline mcp add justclaw-it --transport streamable-http --yes https://justclaw.it.com/mcp
```

With a key, add `--header "Authorization: Bearer <YOUR_API_KEY>"`.

**Cline in VS Code**: open MCP Servers > Configure MCP Servers and add this under `mcpServers`:

```json
{
  "mcpServers": {
    "justclaw-it": {
      "type": "streamableHttp",
      "url": "https://justclaw.it.com/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      },
      "disabled": false
    }
  }
}
```

Without a key, leave out the whole `headers` block; `search_components` still works.

Do not use `npx` or `@justclaw-it/cli` for this: the server is remote and needs no local process.

## 3. Check it works

Restart or refresh Cline's MCP servers, then ask: *"search JustClaw-It for a stripe webhook handler"*. Cline should call `search_components` and return ranked results, each with a GitHub permalink and licence.
