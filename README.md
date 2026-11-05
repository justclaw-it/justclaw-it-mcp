# JustClaw-It MCP: real components for your coding agent

JustClaw-It MCP is a remote MCP server. It lets Claude Code, Cursor, Codex, Windsurf, Claude Desktop, OpenClaw and Hermes search **over a million real, quality-scored components, every one licence-cleared with attribution** mined from production repos, instead of hallucinating them. Every result comes with a GitHub permalink and its licence.

This repo is the **connector**: a one-command installer, agent skills, and manual config snippets. The server itself is a hosted service at `https://justclaw.it.com/mcp`.

## One-line install

Get a free key at **https://justclaw.it.com/signup** (no card), then run the line for your client. Replace `<YOUR_API_KEY>` with your `cobalt_live_…` key.

**Claude Code**

```sh
claude mcp add --transport http --scope user justclaw-it https://justclaw.it.com/mcp --header "Authorization: Bearer <YOUR_API_KEY>"
```

**Cursor**: open this install link, then put your key in place of `<YOUR_API_KEY>` in Cursor's MCP settings:

[Add JustClaw-It to Cursor](https://cursor.com/link/mcp/install?name=justclaw-it&config=eyJ1cmwiOiJodHRwczovL2p1c3RjbGF3Lml0LmNvbS9tY3AiLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiJCZWFyZXIgPFlPVVJfQVBJX0tFWT4ifX0=)

or paste the deeplink into your browser:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=justclaw-it&config=eyJ1cmwiOiJodHRwczovL2p1c3RjbGF3Lml0LmNvbS9tY3AiLCJoZWFkZXJzIjp7IkF1dGhvcml6YXRpb24iOiJCZWFyZXIgPFlPVVJfQVBJX0tFWT4ifX0=
```

**VS Code**

```sh
code --add-mcp '{"name":"justclaw-it","type":"http","url":"https://justclaw.it.com/mcp","headers":{"Authorization":"Bearer <YOUR_API_KEY>"}}'
```

**Codex CLI**: the key is read from an environment variable, so set it in your shell profile too:

```sh
export JUSTCLAW_IT_API_KEY=<YOUR_API_KEY>
codex mcp add justclaw-it --url https://justclaw.it.com/mcp --bearer-token-env-var JUSTCLAW_IT_API_KEY
```

Then restart the client and ask it: *"search JustClaw-It for a stripe webhook handler"*. Windsurf, Claude Desktop, OpenClaw, Hermes and any other MCP client: see [Manual setup](#manual-setup); every config is also in [`examples/`](examples/).

## Installer CLI (once it is on npm)

> `@justclaw-it/cli` is not published on npm yet; until it is, use the one-liners above.

```sh
npx @justclaw-it/cli init
```

or, without npm on your PATH:

```sh
curl -fsSL https://justclaw.it.com/install | sh
```

1. Paste your API key, or press Enter to open **https://justclaw.it.com/signup** (free, no card).
2. The CLI checks the key with a live `tools/list` call.
3. It finds the agents on your machine and adds the `justclaw-it` MCP server to each one. Every edited file is backed up first, as `<file>.justclaw-it-bak-<timestamp>`. An old `justclaw` entry from a previous install is detected and replaced, so you never end up with both.
4. Restart your agent and ask: *"search JustClaw-It for a stripe webhook handler"*.

```sh
npx @justclaw-it/cli doctor                 # connection, tier/usage, which agents are configured
npx @justclaw-it/cli doctor --search "jwt auth middleware express"
npx @justclaw-it/cli uninstall              # removes the entries and skills it added
```

Non-interactive: `JUSTCLAW_IT_API_KEY=cobalt_live_… npx @justclaw-it/cli init --yes`. To limit it to some clients: `--clients claude-code,cursor`. To skip the skills: `--no-skills`.

Requires Node.js 18.17+. Zero runtime dependencies.

### Upgrading from a pre-release

`npx @justclaw-it/cli init` cleans up after pre-release installs: old `justclaw` MCP entries in your agents' configs and the old `justclaw-search`, `justclaw-pull` and `justclaw-starter` skill dirs are removed automatically and replaced by `justclaw-it` and `justclaw-it-*`. The old `justclaw` command no longer exists; use `justclaw-it` (or `npx @justclaw-it/cli`). A key saved in `~/.config/justclaw/` is moved to `~/.config/justclaw-it/`, and `JUSTCLAW_API_KEY` is still read if `JUSTCLAW_IT_API_KEY` is unset. Two env var names changed with it: Hermes' `~/.hermes/.env` key line `JUSTCLAW_API_KEY` becomes `JUSTCLAW_IT_API_KEY`, and the Claude Desktop bridge's `JUSTCLAW_AUTH` becomes `JUSTCLAW_IT_AUTH`. `init` rewrites both for you.

## What the tools do

| Tool | What it does | Tier |
| --- | --- | --- |
| `search_components` | Semantic search. Takes `query`, plus optional `limit`, `category`, `language`, `license` (`permissive`, `commercial-safe`, `open-source`, `any`), `min_composite` and `offset`. Returns ranked matches with repo, quality scores, similarity, licence and permalink. | all |
| `find_similar` | Other licence-cleared implementations of the same job as a component `id`, to compare scores, licences and stacks. | all |
| `list_categories` | The categories (function tags) with how many components each has: the values `category` accepts. | all |
| `check_component_security` | Known security advisories for components or repositories (`component_ids` or `names`): severity, CVSS, summary and fixed versions. | all |
| `get_component` | Full source plus metadata and attribution for one component `id`. | all |
| `list_licenses` | Every source repo with its SPDX licence and copyright holder (a NOTICE file). | all |
| `library_stats` | Library size and counts. | all |
| `get_component_bundle` | Takes a `component_id`. Returns that component plus the components it imports from its own repo, each with an attribution header, and a manifest of files, npm/pip packages and install commands. 3 credits. | Pro |
| `compose_starter` | Takes a `prompt` and an optional `stack` (e.g. `"nextjs"`). Returns a starter project built from 3–8 components: file tree, attributed files, README with every source and licence, NOTICE, and install commands. 10 credits. | Pro |

Searching is free (0 credits): `search_components`, `find_similar`, `list_categories`, `library_stats` and `list_licenses`, with fair-use rate limits; `search_components` even works without a key. A pull (`get_component`) costs 1 credit; the Pro tools cost 3 and 10.

Each component carries 5 sub-scores (completeness, code quality, deployability, reusability, strategic value) and a `composite` 0–10. Filter with `min_composite`. Categories include `ai, ui, auth, database, payments, email, infra, integration, automation, analytics, files, realtime, scraping, dev-tools, testing, security, search, chat, cli`, and more.

## Skills

`justclaw-it init` also installs three [Agent Skills](https://agentskills.io) into Claude Code (`~/.claude/skills`), OpenClaw (`~/.openclaw/skills`) and Hermes (`~/.hermes/skills`):

- **justclaw-it-search**: search before writing common components; pick by fit, quality score and licence; always keep the attribution headers.
- **justclaw-it-pull**: pull a component or bundle into the project with attribution, `THIRD_PARTY_LICENSES` and dependencies.
- **justclaw-it-starter** (Pro): compose a new starter project.

To install them manually, copy `skills/<name>/` into your agent's skills directory. On OpenClaw you can also run `openclaw skills install justclaw-it-search` (from ClawHub).

## Manual setup

Replace `<YOUR_API_KEY>` with your `cobalt_live_…` key. Auth is a standard `Authorization: Bearer` header on `https://justclaw.it.com/mcp` (Streamable HTTP).

<details open><summary><b>Claude Code</b></summary>

```sh
claude mcp add --transport http --scope user justclaw-it https://justclaw.it.com/mcp \
  --header "Authorization: Bearer <YOUR_API_KEY>"
```
</details>

<details><summary><b>Cursor</b>: <code>~/.cursor/mcp.json</code></summary>

```json
{
  "mcpServers": {
    "justclaw-it": {
      "url": "https://justclaw.it.com/mcp",
      "headers": { "Authorization": "Bearer <YOUR_API_KEY>" }
    }
  }
}
```
</details>

<details><summary><b>VS Code</b>: <code>.vscode/mcp.json</code> or your user <code>mcp.json</code></summary>

VS Code asks for the key once and stores it:

```json
{
  "inputs": [
    { "type": "promptString", "id": "justclaw-it-key", "description": "JustClaw-It API key", "password": true }
  ],
  "servers": {
    "justclaw-it": {
      "type": "http",
      "url": "https://justclaw.it.com/mcp",
      "headers": { "Authorization": "Bearer ${input:justclaw-it-key}" }
    }
  }
}
```
</details>

<details><summary><b>Windsurf</b>: <code>~/.codeium/windsurf/mcp_config.json</code></summary>

```json
{
  "mcpServers": {
    "justclaw-it": {
      "serverUrl": "https://justclaw.it.com/mcp",
      "headers": { "Authorization": "Bearer <YOUR_API_KEY>" }
    }
  }
}
```
</details>

<details><summary><b>Claude Desktop</b>: <code>claude_desktop_config.json</code></summary>

The config file is at `~/Library/Application Support/Claude/` on macOS, `%APPDATA%\Claude\` on Windows, and `~/.config/Claude/` on Linux. Claude Desktop reaches remote servers through the `mcp-remote` bridge, so it needs Node.js:

```json
{
  "mcpServers": {
    "justclaw-it": {
      "command": "npx",
      "args": ["-y", "mcp-remote@0.15.2", "https://justclaw.it.com/mcp", "--header", "Authorization:${JUSTCLAW_IT_AUTH}"],
      "env": { "JUSTCLAW_IT_AUTH": "Bearer <YOUR_API_KEY>" }
    }
  }
}
```
</details>

<details><summary><b>Codex CLI</b>: <code>~/.codex/config.toml</code></summary>

```toml
[mcp_servers.justclaw-it]
url = "https://justclaw.it.com/mcp"
http_headers = { "Authorization" = "Bearer <YOUR_API_KEY>" }
```

Or keep the key out of the file: `bearer_token_env_var = "JUSTCLAW_IT_API_KEY"` instead of `http_headers`, with `JUSTCLAW_IT_API_KEY` set in your environment.
</details>

<details><summary><b>OpenClaw</b></summary>

```sh
openclaw mcp set justclaw-it '{"url":"https://justclaw.it.com/mcp","transport":"streamable-http","headers":{"Authorization":"Bearer <YOUR_API_KEY>"}}'
openclaw mcp reload    # if a gateway is already running
```
</details>

<details><summary><b>Hermes Agent</b>: <code>~/.hermes/config.yaml</code></summary>

```yaml
mcp_servers:
  justclaw-it:
    url: "https://justclaw.it.com/mcp"
    headers:
      Authorization: "Bearer ${JUSTCLAW_IT_API_KEY}"
```

and in `~/.hermes/.env`:

```sh
JUSTCLAW_IT_API_KEY=<YOUR_API_KEY>
```
</details>

<details><summary><b>Any other MCP client</b></summary>

```json
{ "mcpServers": { "justclaw-it": { "url": "https://justclaw.it.com/mcp", "headers": { "Authorization": "Bearer <YOUR_API_KEY>" } } } }
```
</details>

## Pricing

Usage runs on credits: search is free, one credit is one component pull. Every plan has a hard cap, so there's no surprise bill. Live prices: **https://justclaw.it.com/pricing**

| Plan | Price | Credits |
| --- | --- | --- |
| Free | $0 | 30 bonus credits on day one, then 10 per day (resets daily, doesn't carry over). No card. |
| Solo | $10/mo | 300 per week; unused credits carry over |
| Indie | $19/mo | 1,000 per week; unused credits carry over |
| Pro | $49/mo | 5,000 per week, plus **component bundles** and **starter composition** |

Paid plans earn up to 1.5x credits the longer you stay, and have a yearly fair-use cap on unique components pulled.

## Security

- **Your key stays local.** The CLI writes it only into each agent's own config file (as the `justclaw-it` MCP entry), or the agent's env file for Hermes, plus `~/.config/justclaw-it/config.json` (mode 600) for `justclaw-it doctor`. Nothing is sent anywhere except `https://justclaw.it.com`. The key is never logged in full.
- **Backups.** Every file the CLI edits is copied to `<file>.justclaw-it-bak-<timestamp>` first. `justclaw-it uninstall` removes exactly what `init` added.
- **Open connector, closed server.** This repo, the CLI, the installer and the skills are MIT-licensed and auditable. The search service and its index are closed-source and hosted.
- **Licences are respected.** Every component carries its upstream SPDX licence and copyright, and the skills tell agents to keep attribution headers and to avoid copyleft or unlicensed code unless your project allows it.
- Lost or leaked key? Regenerate it at https://justclaw.it.com/account.

## Registry entry

[`server.json`](server.json) is this server's entry for the [official MCP Registry](https://registry.modelcontextprotocol.io) (remote Streamable HTTP server, optional bearer header).

## Development

```sh
cd cli && npm test        # config-writer tests in a throwaway $HOME
node scripts/check-examples.mjs   # examples/ and server.json stay valid and in sync
node bin/justclaw-it.js doctor
```

Issues: https://github.com/justclaw-it/justclaw-it-mcp/issues

## License

The connector (this repo) is [MIT](LICENSE). Components returned by the service keep their own upstream licences.
