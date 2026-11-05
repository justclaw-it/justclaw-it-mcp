#!/usr/bin/env node
// Checks examples/ and server.json stay correct (run by CI; no dependencies):
//  - every examples/*.json parses and points at the one server URL,
//  - server.json parses and its remote URL is that same URL,
//  - the Cursor install link in README.md decodes to the entry in examples/cursor.mcp.json,
//  - no example carries anything that looks like a real key,
//  - the mcp-remote bridge is pinned to the same exact version in examples/, README.md and the CLI.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const URL = "https://justclaw.it.com/mcp";
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

const examples = join(root, "examples");
for (const d of readdirSync(examples, { withFileTypes: true })) {
  const name = d.name;
  if (!d.isFile()) { check(false, `${name}: not a file (examples/ holds only config files)`); continue; }
  const text = readFileSync(join(examples, name), "utf8");
  check(!/cobalt_live_[A-Za-z0-9_-]{8,}/.test(text), `${name}: contains something that looks like a real key`);
  if (name.endsWith(".json")) {
    let cfg;
    try { cfg = JSON.parse(text); } catch (e) { check(false, `${name}: invalid JSON (${e.message})`); continue; }
    const entry = (cfg.mcpServers || cfg.servers || {})["justclaw-it"];
    check(entry, `${name}: no "justclaw-it" server entry`);
    // exact match: url (most clients), serverUrl (Windsurf), or the mcp-remote argument (Claude Desktop)
    if (entry) check(entry.url === URL || entry.serverUrl === URL || (entry.args || []).includes(URL), `${name}: does not point at ${URL}`);
  } else if (!name.endsWith(".md")) {
    // TOML / YAML: an uncommented `url = "…"` or `url: "…"` line with exactly the server URL
    const live = text.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
    check(/^\s*url\s*[=:]\s*"https:\/\/justclaw\.it\.com\/mcp"\s*$/m.test(live), `${name}: does not point at ${URL}`);
  }
}

const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
check(server.remotes?.[0]?.url === URL, "server.json: remotes[0].url is not the server URL");
check(server.repository?.url === "https://github.com/justclaw-it/justclaw-it-mcp", "server.json: repository.url");

const readme = readFileSync(join(root, "README.md"), "utf8");
// both forms: the web link GitHub renders, and the raw cursor:// deeplink
const links = [...readme.matchAll(/(?:cursor:\/\/anysphere\.cursor-deeplink|https:\/\/cursor\.com\/link)\/mcp\/install\?name=justclaw-it&config=([A-Za-z0-9+/=]+)/g)];
check(links.some((m) => m[0].startsWith("cursor://")), "README.md: missing the cursor:// deeplink");
check(links.some((m) => m[0].startsWith("https://cursor.com/link")), "README.md: missing the Cursor web install link");
const cursorEntry = JSON.stringify(JSON.parse(readFileSync(join(examples, "cursor.mcp.json"), "utf8")).mcpServers["justclaw-it"]);
for (const m of links) {
  let linked;
  try { linked = JSON.stringify(JSON.parse(Buffer.from(m[1], "base64").toString("utf8"))); } catch (e) { check(false, `README.md: Cursor link config does not decode (${e.message})`); continue; }
  check(linked === cursorEntry, "README.md: Cursor install link does not match examples/cursor.mcp.json");
}

// the mcp-remote bridge is pinned to one exact version everywhere it is written
const pins = (text) => [...text.matchAll(/mcp-remote@([^\s"',]+)/g)].map((m) => m[1]);
const desktop = pins(readFileSync(join(examples, "claude_desktop_config.json"), "utf8"));
const allPins = [...desktop, ...pins(readme), ...pins(readFileSync(join(root, "cli", "lib", "clients.js"), "utf8"))];
check(desktop.length === 1 && /^\d+\.\d+\.\d+$/.test(desktop[0]), "claude_desktop_config.json: mcp-remote is not pinned to an exact version");
check(allPins.every((v) => v === desktop[0]), `mcp-remote pins differ across examples/, README.md and cli/lib/clients.js: ${[...new Set(allPins)].join(", ")}`);

if (fails.length) {
  console.error(fails.map((f) => `check-examples: ${f}`).join("\n"));
  process.exit(1);
}
console.log("check-examples: ok");
