# Example client configs

Ready-to-copy configuration for connecting each MCP client to the JustClaw-It server at
`https://justclaw.it.com/mcp` (Streamable HTTP, `Authorization: Bearer <key>`). Get a free key at
https://justclaw.it.com/signup and put it where a file says `<YOUR_API_KEY>`.

| Client | File | Where it goes |
| --- | --- | --- |
| Cursor | [`cursor.mcp.json`](cursor.mcp.json) | `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project) |
| VS Code | [`vscode.mcp.json`](vscode.mcp.json) | `.vscode/mcp.json`, or your user `mcp.json`. VS Code asks for the key once and stores it. |
| Codex CLI | [`codex.config.toml`](codex.config.toml) | `~/.codex/config.toml` |
| Windsurf | [`windsurf.mcp_config.json`](windsurf.mcp_config.json) | `~/.codeium/windsurf/mcp_config.json` |
| Claude Desktop | [`claude_desktop_config.json`](claude_desktop_config.json) | `claude_desktop_config.json` (needs Node.js for the `mcp-remote` bridge) |
| Hermes Agent | [`hermes.config.yaml`](hermes.config.yaml) | `~/.hermes/config.yaml`, with the key in `~/.hermes/.env` |
| Any other client | [`generic.mcp.json`](generic.mcp.json) | wherever your client reads `mcpServers` |

Claude Code and OpenClaw take a single command instead of a file; see the
[main README](../README.md#one-line-install). If a file already has an `mcpServers` (or `servers`)
block, add the `justclaw-it` entry to it rather than replacing the file.

`node scripts/check-examples.mjs` checks that every JSON file here parses, that each one points at the
same server URL, and that the Cursor install link in the README decodes to `cursor.mcp.json`'s entry.
