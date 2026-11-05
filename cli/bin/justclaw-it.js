#!/usr/bin/env node
// justclaw-it — connect your coding agents to the JustClaw-It component registry (MCP).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient, McpError, DEFAULT_URL, fetchUsage } from '../lib/mcp.js';
import { CLIENTS, byId, SERVER_NAME } from '../lib/clients.js';
import { installSkills, removeSkills, installedSkills, listSkills } from '../lib/skills.js';
import { readState, writeState, removeState, stateFile, envKey, ENV_VAR } from '../lib/state.js';
import { c, log, redact, askSecret, confirm, closePrompts, openUrl } from '../lib/util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version;
const SIGNUP_URL = 'https://justclaw.it.com/signup';
const ACCOUNT_URL = 'https://justclaw.it.com/account';
const KEY_RE = /^cobalt_live_[A-Za-z0-9_-]{16,}$/;
const PRO_TOOLS = ['get_component_bundle', 'compose_starter'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('-') && ['key', 'url', 'clients', 'search'].includes(k)) args[k] = argv[++i];
      else args[k] = true;
    } else if (a === '-y') args.yes = true;
    else if (a === '-h') args.help = true;
    else if (a === '-v') args.version = true;
    else args._.push(a);
  }
  return args;
}

const HELP = `justclaw-it ${VERSION} — connect your coding agents to the JustClaw-It MCP component registry

Usage:
  justclaw-it init       Validate your API key and configure every agent found on this machine
  justclaw-it doctor     Test the connection, show your tier/usage, and check each agent's config
  justclaw-it uninstall  Remove the justclaw-it MCP entry and skills from every agent

Options:
  --key <key>         API key (default: $${ENV_VAR}, saved key, or prompt)
  --clients <list>    Only these clients: ${CLIENTS.map((x) => x.id).join(',')}
  --yes, -y           Don't ask; configure every detected client
  --no-skills         Don't install the agent skills
  --search "<query>"  (doctor) run one real search
  --url <url>         MCP endpoint (default: ${DEFAULT_URL})

Get a free key: ${SIGNUP_URL}`;

async function validateKey(key, url) {
  const client = new McpClient({ url, apiKey: key, clientVersion: VERSION });
  try {
    await client.connect();
    const tools = await client.listTools();
    return { client, tools };
  } catch (err) {
    await client.close();
    throw err;
  }
}

async function obtainKey(args, url, interactive) {
  let key = typeof args.key === 'string' ? args.key : envKey();
  if (!key && readState().apiKey) {
    const saved = readState().apiKey;
    if (!interactive || (await confirm(`Use your saved key ${c.dim(redact(saved))}?`))) key = saved;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!key) {
      if (!interactive) throw new Error(`no API key. Pass --key, set ${ENV_VAR}, or run interactively. Get one at ${SIGNUP_URL}`);
      console.log(`\nPaste your JustClaw-It API key (starts with ${c.cyan('cobalt_live_')}).`);
      console.log(`No key yet? Press ${c.bold('Enter')} to open ${SIGNUP_URL} (free, no card).`);
      key = await askSecret('API key: ');
      if (!key) {
        const opened = openUrl(SIGNUP_URL);
        console.log(opened ? `Opened ${SIGNUP_URL} in your browser.` : `Open ${c.cyan(SIGNUP_URL)} in your browser.`);
        console.log('Confirm the email link, copy the key it shows you, then paste it here.');
        key = await askSecret('API key: ');
        if (!key) continue;
      }
    }
    if (!KEY_RE.test(key)) {
      log.err(`that doesn't look like a JustClaw-It key (expected cobalt_live_…)`);
      key = '';
      if (!interactive) break;
      continue;
    }
    process.stdout.write(`  Checking key ${c.dim(redact(key))} against ${url} … `);
    try {
      const res = await validateKey(key, url);
      console.log(c.green('ok'));
      return { key, ...res };
    } catch (err) {
      console.log(c.red('failed'));
      log.err(err.message);
      if (!(err instanceof McpError && err.code === 'AUTH') || !interactive) throw err;
      key = '';
    }
  }
  throw new Error('no valid API key');
}

function pickClients(args) {
  if (args.clients) {
    const ids = String(args.clients).split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !byId(id));
    if (unknown.length) throw new Error(`unknown client(s): ${unknown.join(', ')}`);
    return ids.map(byId);
  }
  return CLIENTS.filter((cl) => cl.detect());
}

async function init(args) {
  const url = args.url || readState().url || DEFAULT_URL;
  const interactive = process.stdin.isTTY && !args.yes;
  console.log(`${c.bold('JustClaw-It')} — real, licence-cleared components for your coding agents\n`);

  const { key, tools, client } = await obtainKey(args, url, interactive);
  await client.close();
  const names = tools.map((t) => t.name);
  log.ok(`key valid — ${tools.length} tools: ${names.join(', ')}`);

  log.step('Agents on this machine');
  const candidates = pickClients(args);
  for (const cl of CLIENTS) {
    const found = candidates.includes(cl);
    console.log(`  ${found ? c.green('●') : c.dim('○')} ${cl.name}${found ? '' : c.dim(' (not found)')}`);
  }
  if (!candidates.length) {
    log.warn('No supported agent found. Manual config snippets are in the README: https://github.com/justclaw-it/justclaw-it-mcp#manual-setup');
  }

  const chosen = [];
  for (const cl of candidates) {
    if (!interactive || args.clients || (await confirm(`Configure ${cl.name}?`))) chosen.push(cl);
  }

  log.step('Configuring');
  const configured = [];
  for (const cl of chosen) {
    try {
      const r = cl.configure(key, url);
      if (r.skipped) {
        log.warn(`${cl.name}: ${r.skipped}`);
        console.log(c.dim(cl.snippet(url).replace(/^/gm, '    ')));
        continue;
      }
      configured.push(cl.id);
      log.ok(`${cl.name}: ${r.changed ? 'configured' : 'already configured'}${r.file ? c.dim(` (${r.file})`) : ''}`);
      if (r.backup) log.info(c.dim(`backup: ${r.backup}`));
      if (r.changed && r.notes) log.info(c.dim(r.notes));
    } catch (err) {
      log.err(`${cl.name}: ${err.message}`);
    }

    if (!args['no-skills'] && cl.skillsDir && configured.includes(cl.id)) {
      try {
        const dir = cl.skillsDir();
        const s = installSkills(dir);
        if (s.done.length) log.info(`skills → ${dir}: ${s.done.join(', ')}`);
        if (s.migrated.length) log.info(c.dim(`removed pre-release skills ${s.migrated.join(', ')} from ${dir}`));
        if (s.skipped.length) log.warn(`kept your existing ${s.skipped.join(', ')} in ${dir}`);
      } catch (err) {
        log.err(`${cl.name} skills: ${err.message}`);
      }
    }
  }

  const prev = readState();
  writeState({ ...prev, apiKey: key, url, clients: [...new Set([...(prev.clients || []), ...configured])] });
  log.info(c.dim(`key saved for \`justclaw-it doctor\` in ${stateFile()} (mode 600)`));

  log.step('Done');
  console.log(`  Restart your agent, then try: ${c.cyan('"search justclaw-it for a stripe webhook handler"')}`);
  console.log(`  Check anytime: ${c.cyan('npx @justclaw-it/cli doctor')}    Account & usage: ${ACCOUNT_URL}`);
  console.log(c.dim(`  Bundles and starter projects come with Pro: https://justclaw.it.com/pricing`));
}

function printUsage(usage) {
  if (!usage) {
    log.warn('usage endpoint unavailable');
    return;
  }
  const skip = new Set(['owner', 'key_prefix', 'created_at', 'revoked', 'tier', 'rate_limit_window_seconds']);
  log.ok(`tier: ${c.bold(usage.tier ?? 'unknown')}`);
  for (const [k, v] of Object.entries(usage)) {
    if (skip.has(k) || v === null || typeof v === 'object') continue;
    if (k === 'rate_limit' && !v) continue; // 0 = metered by credits, not a call cap
    log.info(`${k.replace(/_/g, ' ')}: ${v}`);
  }
  if (usage.revoked) log.err('this key is revoked');
}

async function doctor(args) {
  const st = readState();
  const url = args.url || st.url || DEFAULT_URL;
  const key = (typeof args.key === 'string' && args.key) || envKey() || st.apiKey;
  let ok = true;
  console.log(`${c.bold('justclaw-it doctor')} ${c.dim(VERSION)}\n`);
  console.log(`  node ${process.version}, endpoint ${url}`);
  if (!key) {
    log.err(`no API key found (run \`justclaw-it init\` or set ${ENV_VAR})`);
    return 1;
  }
  log.ok(`key ${redact(key)}`);

  log.step('Connection');
  let client;
  try {
    const t0 = Date.now();
    const res = await validateKey(key, url);
    client = res.client;
    log.ok(`MCP ${client.serverInfo.name || 'server'} ${client.serverInfo.version || ''} — tools/list in ${Date.now() - t0} ms`);
    for (const t of res.tools) log.info(`${PRO_TOOLS.includes(t.name) ? c.cyan('★') : '·'} ${t.name}${PRO_TOOLS.includes(t.name) ? c.dim(' (Pro)') : ''}`);
  } catch (err) {
    log.err(err.message);
    return 1;
  }

  log.step('Account');
  printUsage(await fetchUsage(key, url));

  if (args.search) {
    log.step(`Search: "${args.search}"`);
    try {
      const out = await client.callTool('search_components', { query: String(args.search), limit: 3 });
      const results = out?.results || [];
      if (!results.length) log.warn('no results');
      for (const r of results) {
        const score = r.scores?.composite ?? '–';
        log.ok(`${r.name} ${c.dim(`[${r.attribution?.license_spdx || '?'} · score ${score} · sim ${r.similarity}]`)}`);
        log.info(c.dim(r.source_url || ''));
      }
    } catch (err) {
      ok = false;
      log.err(err.message);
    }
  }
  await client.close();

  log.step('Agents');
  for (const cl of CLIENTS) {
    if (!cl.detect()) continue;
    const conf = cl.isConfigured();
    const skills = cl.skillsDir ? installedSkills(cl.skillsDir()) : [];
    const skillNote = cl.skillsDir ? c.dim(` skills: ${skills.length}/${listSkills().length}`) : '';
    if (conf) log.ok(`${cl.name}: configured${skillNote}`);
    else log.warn(`${cl.name}: not configured — run \`justclaw-it init --clients ${cl.id}\``);
  }
  return ok ? 0 : 1;
}

async function uninstall(args) {
  const interactive = process.stdin.isTTY && !args.yes;
  if (interactive && !(await confirm(`Remove the "${SERVER_NAME}" MCP server and skills from every agent?`))) return 0;
  const targets = args.clients ? pickClients(args) : CLIENTS;
  for (const cl of targets) {
    try {
      const r = cl.unconfigure();
      if (r.changed) {
        log.ok(`${cl.name}: removed${r.file ? c.dim(` (${r.file})`) : ''}`);
        if (r.backup) log.info(c.dim(`backup: ${r.backup}`));
      }
    } catch (err) {
      log.err(`${cl.name}: ${err.message}`);
    }
    if (cl.skillsDir) {
      const gone = removeSkills(cl.skillsDir());
      if (gone.length) log.ok(`${cl.name}: removed skills ${gone.join(', ')}`);
    }
  }
  if (!args['keep-key']) {
    for (const f of removeState()) log.ok(`removed saved key (${f})`);
  }
  console.log(`\nYour API key itself is still valid. Revoke or regenerate it at ${ACCOUNT_URL}`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) return console.log(VERSION);
  const cmd = args._[0] || (args.help ? 'help' : 'init');
  try {
    if (cmd === 'init') await init(args);
    else if (cmd === 'doctor') process.exitCode = await doctor(args);
    else if (cmd === 'uninstall') process.exitCode = await uninstall(args);
    else {
      console.log(HELP);
      if (cmd !== 'help') process.exitCode = 1;
    }
  } catch (err) {
    log.err(err.message);
    process.exitCode = 1;
  } finally {
    closePrompts();
  }
}

main();
