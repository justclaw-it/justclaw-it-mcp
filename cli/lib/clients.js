// Per-client MCP config writers. Every writer is idempotent, backs up any file
// it edits, and keeps the API key in the client's own config / env file.
import fs from 'node:fs';
import path from 'node:path';
import { home, exists, which, run, backup, readJson, writeJson, writeFileAtomic } from './util.js';
import { ENV_VAR, LEGACY_ENV_VAR } from './state.js';

export const SERVER_NAME = 'justclaw-it';
// Pre-rename server key. init/uninstall detect and clean this up so nobody
// ends up with both `justclaw` and `justclaw-it` entries side by side.
export const OLD_SERVER_NAME = 'justclaw';
export { ENV_VAR };
const BEGIN = `# >>> ${SERVER_NAME} >>>`;
const END = `# <<< ${SERVER_NAME} <<<`;
const OLD_BEGIN = `# >>> ${OLD_SERVER_NAME} >>>`;
const OLD_END = `# <<< ${OLD_SERVER_NAME} <<<`;

const authHeader = (key) => ({ Authorization: `Bearer ${key}` });
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- generic JSON "mcpServers" style clients --------------------------------
function jsonClient({ id, name, file, rootKey = 'mcpServers', entry, detectPaths = [], bins = [], skillsDir = null, notes }) {
  return {
    id,
    name,
    skillsDir,
    configPath: file,
    detect() {
      return bins.some((b) => which(b)) || detectPaths().some(exists) || exists(file());
    },
    isConfigured() {
      try {
        return Boolean(readJson(file())?.[rootKey]?.[SERVER_NAME]);
      } catch {
        return false;
      }
    },
    configure(key, url) {
      const f = file();
      const cfg = readJson(f);
      const want = entry(key, url);
      cfg[rootKey] = cfg[rootKey] || {};
      const hadOld = Boolean(cfg[rootKey][OLD_SERVER_NAME]);
      if (!hadOld && sameJson(cfg[rootKey][SERVER_NAME], want)) return { changed: false, file: f };
      const bak = backup(f);
      if (hadOld) delete cfg[rootKey][OLD_SERVER_NAME];
      cfg[rootKey][SERVER_NAME] = want;
      writeJson(f, cfg);
      return { changed: true, file: f, backup: bak, notes };
    },
    unconfigure() {
      const f = file();
      if (!exists(f)) return { changed: false };
      const cfg = readJson(f);
      const hadOld = Boolean(cfg?.[rootKey]?.[OLD_SERVER_NAME]);
      const hadNew = Boolean(cfg?.[rootKey]?.[SERVER_NAME]);
      if (!hadOld && !hadNew) return { changed: false, file: f };
      const bak = backup(f);
      if (hadOld) delete cfg[rootKey][OLD_SERVER_NAME];
      if (hadNew) delete cfg[rootKey][SERVER_NAME];
      writeJson(f, cfg);
      return { changed: true, file: f, backup: bak };
    },
    snippet(url) {
      return JSON.stringify({ [rootKey]: { [SERVER_NAME]: entry('<YOUR_API_KEY>', url) } }, null, 2);
    },
  };
}

// ---- Claude Code ------------------------------------------------------------
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude');
const claudeJson = () => (process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(home(), '.claude.json'));
const claudeEntry = (key, url) => ({ type: 'http', url, headers: authHeader(key) });

const claudeCode = {
  id: 'claude-code',
  name: 'Claude Code',
  skillsDir: () => path.join(claudeDir(), 'skills'),
  configPath: claudeJson,
  detect: () => Boolean(which('claude')) || exists(claudeJson()) || exists(claudeDir()),
  isConfigured() {
    try {
      return Boolean(readJson(claudeJson())?.mcpServers?.[SERVER_NAME]);
    } catch {
      return false;
    }
  },
  configure(key, url) {
    const f = claudeJson();
    let current, hadOld;
    try {
      const cfg = readJson(f);
      current = cfg?.mcpServers?.[SERVER_NAME];
      hadOld = Boolean(cfg?.mcpServers?.[OLD_SERVER_NAME]);
    } catch {
      current = undefined;
      hadOld = false;
    }
    const want = claudeEntry(key, url);
    if (!hadOld && current && current.url === want.url && sameJson(current.headers, want.headers)) return { changed: false, file: f };
    const bak = backup(f);
    if (which('claude')) {
      if (hadOld) run('claude', ['mcp', 'remove', OLD_SERVER_NAME, '--scope', 'user']);
      run('claude', ['mcp', 'remove', SERVER_NAME, '--scope', 'user']);
      const r = run('claude', ['mcp', 'add', '--transport', 'http', '--scope', 'user', SERVER_NAME, url, '--header', `Authorization: Bearer ${key}`]);
      if (r.code === 0) return { changed: true, file: f, backup: bak, via: 'claude mcp add' };
    }
    // Fallback: edit ~/.claude.json directly (user-scope mcpServers).
    const cfg = readJson(f);
    cfg.mcpServers = cfg.mcpServers || {};
    delete cfg.mcpServers[OLD_SERVER_NAME];
    cfg.mcpServers[SERVER_NAME] = want;
    writeJson(f, cfg);
    return { changed: true, file: f, backup: bak, via: 'edited ~/.claude.json', notes: 'Restart Claude Code to pick it up.' };
  },
  unconfigure() {
    const f = claudeJson();
    let hadOld = false;
    try {
      hadOld = Boolean(readJson(f)?.mcpServers?.[OLD_SERVER_NAME]);
    } catch {
      hadOld = false;
    }
    const hadNew = this.isConfigured();
    if (!hadOld && !hadNew) return { changed: false };
    const bak = backup(f);
    if (which('claude')) {
      if (hadOld) run('claude', ['mcp', 'remove', OLD_SERVER_NAME, '--scope', 'user']);
      if (hadNew) run('claude', ['mcp', 'remove', SERVER_NAME, '--scope', 'user']);
      let stillOld = false;
      try {
        stillOld = Boolean(readJson(f)?.mcpServers?.[OLD_SERVER_NAME]);
      } catch {
        stillOld = false;
      }
      if (!this.isConfigured() && !stillOld) return { changed: true, file: f, backup: bak };
    }
    const cfg = readJson(f);
    if (cfg.mcpServers) {
      delete cfg.mcpServers[SERVER_NAME];
      delete cfg.mcpServers[OLD_SERVER_NAME];
    }
    writeJson(f, cfg);
    return { changed: true, file: f, backup: bak };
  },
  snippet: (url) => `claude mcp add --transport http --scope user ${SERVER_NAME} ${url} --header "Authorization: Bearer <YOUR_API_KEY>"`,
};

// ---- Claude Desktop (stdio bridge via mcp-remote) ---------------------------
function desktopConfigDir() {
  if (process.platform === 'darwin') return path.join(home(), 'Library', 'Application Support', 'Claude');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home(), 'AppData', 'Roaming'), 'Claude');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home(), '.config'), 'Claude');
}
const claudeDesktop = jsonClient({
  id: 'claude-desktop',
  name: 'Claude Desktop',
  file: () => path.join(desktopConfigDir(), 'claude_desktop_config.json'),
  detectPaths: () => [desktopConfigDir()],
  entry: (key, url) => ({
    command: 'npx',
    args: ['-y', 'mcp-remote@0.15.2', url, '--header', 'Authorization:${JUSTCLAW_IT_AUTH}'],
    env: { JUSTCLAW_IT_AUTH: `Bearer ${key}` },
  }),
  notes: 'Fully quit and reopen Claude Desktop. Needs Node.js (npx) on this machine.',
});

// ---- Cursor -----------------------------------------------------------------
const cursor = jsonClient({
  id: 'cursor',
  name: 'Cursor',
  file: () => path.join(home(), '.cursor', 'mcp.json'),
  detectPaths: () => [path.join(home(), '.cursor')],
  bins: ['cursor', 'cursor-agent'],
  entry: (key, url) => ({ url, headers: authHeader(key) }),
  notes: 'Cursor picks it up from Settings → MCP (toggle it on if needed).',
});

// ---- Windsurf ---------------------------------------------------------------
const windsurf = jsonClient({
  id: 'windsurf',
  name: 'Windsurf',
  file: () => path.join(home(), '.codeium', 'windsurf', 'mcp_config.json'),
  detectPaths: () => [path.join(home(), '.codeium', 'windsurf')],
  bins: ['windsurf'],
  entry: (key, url) => ({ serverUrl: url, headers: authHeader(key) }),
  notes: 'Press "Refresh" in Windsurf → Cascade → MCP servers.',
});

// ---- marker-block helpers (TOML / YAML / .env) --------------------------------
export function stripBlock(text, begin = BEGIN, end = END) {
  const lines = text.split('\n');
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (line.trim() === begin) {
      inside = true;
      continue;
    }
    if (line.trim() === end) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  return out.join('\n');
}
const hasBlock = (text, begin = BEGIN) => text.split('\n').some((l) => l.trim() === begin);
// Drop a legacy `justclaw`-named block before working with the current one.
const stripOldBlock = (text) => stripBlock(text, OLD_BEGIN, OLD_END);

// Edit a .env file in one write: drop the `remove` names, then set `set` = [name, value] if given.
// Returns true when the file changed.
function editEnv(file, { remove = [], set = null }) {
  if (!exists(file) && !set) return false;
  const text = exists(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = text ? text.replace(/\n$/, '').split('\n') : [];
  const kept = lines.filter((l) => !remove.some((n) => l.startsWith(`${n}=`)));
  let changed = kept.length !== lines.length;
  if (set) {
    const [name, value] = set;
    const line = `${name}=${value}`;
    const idx = kept.findIndex((l) => l.startsWith(`${name}=`));
    if (idx < 0) {
      kept.push(line);
      changed = true;
    } else if (kept[idx] !== line) {
      kept[idx] = line;
      changed = true;
    }
  }
  if (!changed) return false;
  writeFileAtomic(file, kept.length ? kept.join('\n') + '\n' : '', set ? 0o600 : undefined);
  return true;
}

// ---- Codex CLI (~/.codex/config.toml) ----------------------------------------
const codexHome = () => process.env.CODEX_HOME || path.join(home(), '.codex');
const codexFile = () => path.join(codexHome(), 'config.toml');
const tomlStr = (s) => JSON.stringify(s); // JSON strings are valid TOML basic strings
const codexBlock = (key, url) =>
  [BEGIN, `[mcp_servers.${SERVER_NAME}]`, `url = ${tomlStr(url)}`, `http_headers = { "Authorization" = ${tomlStr(`Bearer ${key}`)} }`, END].join('\n');

const codex = {
  id: 'codex',
  name: 'Codex CLI',
  skillsDir: null,
  configPath: codexFile,
  detect: () => Boolean(which('codex')) || exists(codexHome()),
  isConfigured() {
    return exists(codexFile()) && fs.readFileSync(codexFile(), 'utf8').includes(`[mcp_servers.${SERVER_NAME}]`);
  },
  configure(key, url) {
    const f = codexFile();
    const text = exists(f) ? fs.readFileSync(f, 'utf8') : '';
    const block = codexBlock(key, url);
    const hadOld = hasBlock(text, OLD_BEGIN);
    if (!hadOld && text.includes(block)) return { changed: false, file: f };
    const stripped = stripBlock(stripOldBlock(text));
    if (stripped.includes(`[mcp_servers.${SERVER_NAME}]`)) {
      return { changed: false, file: f, skipped: `[mcp_servers.${SERVER_NAME}] already exists outside the ${SERVER_NAME} block; edit it by hand` };
    }
    const bak = backup(f);
    const body = stripped.replace(/\s*$/, '');
    writeFileAtomic(f, (body ? `${body}\n\n` : '') + block + '\n', exists(f) ? undefined : 0o600);
    return { changed: true, file: f, backup: bak };
  },
  unconfigure() {
    const f = codexFile();
    if (!exists(f)) return { changed: false };
    const text = fs.readFileSync(f, 'utf8');
    if (!hasBlock(text) && !hasBlock(text, OLD_BEGIN)) return { changed: false, file: f };
    const bak = backup(f);
    writeFileAtomic(f, stripBlock(stripOldBlock(text)).replace(/\n{3,}/g, '\n\n'));
    return { changed: true, file: f, backup: bak };
  },
  snippet: (url) => codexBlock('<YOUR_API_KEY>', url).split('\n').slice(1, -1).join('\n'),
};

// ---- OpenClaw -----------------------------------------------------------------
const openclawState = () => process.env.OPENCLAW_STATE_DIR || path.join(home(), '.openclaw');
const openclawConfig = () => process.env.OPENCLAW_CONFIG_PATH || path.join(openclawState(), 'openclaw.json');
const openclawEntry = (key, url) => ({ url, transport: 'streamable-http', headers: authHeader(key) });

const openclaw = {
  id: 'openclaw',
  name: 'OpenClaw',
  skillsDir: () => path.join(openclawState(), 'skills'),
  configPath: openclawConfig,
  detect: () => Boolean(which('openclaw')) || exists(openclawState()),
  current(name = SERVER_NAME) {
    if (!which('openclaw')) return undefined;
    const r = run('openclaw', ['mcp', 'show', name, '--json']);
    if (r.code !== 0) return undefined;
    try {
      return JSON.parse(r.stdout);
    } catch {
      return undefined;
    }
  },
  isConfigured() {
    return Boolean(this.current());
  },
  configure(key, url) {
    if (!which('openclaw')) {
      return { changed: false, skipped: '`openclaw` CLI not on PATH; add the snippet below with `openclaw mcp set`' };
    }
    const want = openclawEntry(key, url);
    const cur = this.current();
    const oldCur = this.current(OLD_SERVER_NAME);
    if (!oldCur && cur && cur.url === want.url && sameJson(cur.headers, want.headers) && cur.transport === want.transport) {
      return { changed: false, file: openclawConfig() };
    }
    const bak = backup(openclawConfig());
    if (oldCur) run('openclaw', ['mcp', 'unset', OLD_SERVER_NAME]);
    const r = run('openclaw', ['mcp', 'set', SERVER_NAME, JSON.stringify(want)]);
    if (r.code !== 0) throw new Error(`openclaw mcp set failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    return { changed: true, file: openclawConfig(), backup: bak, via: 'openclaw mcp set', notes: 'Running gateways pick it up on `openclaw mcp reload` or restart.' };
  },
  unconfigure() {
    if (!which('openclaw')) return { changed: false };
    const hadOld = Boolean(this.current(OLD_SERVER_NAME));
    const hadNew = this.isConfigured();
    if (!hadOld && !hadNew) return { changed: false };
    const bak = backup(openclawConfig());
    if (hadOld) run('openclaw', ['mcp', 'unset', OLD_SERVER_NAME]);
    if (hadNew) {
      const r = run('openclaw', ['mcp', 'unset', SERVER_NAME]);
      if (r.code !== 0) throw new Error(`openclaw mcp unset failed: ${(r.stderr || r.stdout).trim().slice(0, 300)}`);
    }
    return { changed: true, file: openclawConfig(), backup: bak };
  },
  snippet: (url) => `openclaw mcp set ${SERVER_NAME} '${JSON.stringify(openclawEntry('<YOUR_API_KEY>', url))}'`,
};

// ---- Hermes Agent (~/.hermes/config.yaml + ~/.hermes/.env) --------------------
const hermesHome = () => process.env.HERMES_HOME || path.join(home(), '.hermes');
const hermesFile = () => path.join(hermesHome(), 'config.yaml');
const hermesEnv = () => path.join(hermesHome(), '.env');
const hermesBlock = (indent, url) => {
  const i = ' '.repeat(indent);
  return [
    `${i}${BEGIN}`,
    `${i}${SERVER_NAME}:`,
    `${i}${i}url: ${JSON.stringify(url)}`,
    `${i}${i}headers:`,
    `${i}${i}${i}Authorization: "Bearer \${${ENV_VAR}}"`,
    `${i}${END}`,
  ].join('\n');
};

export function insertHermes(text, url) {
  // Migrate: drop any legacy `justclaw`-named managed block first.
  const base = stripBlock(stripOldBlock(text));
  const lines = base.split('\n');
  const idx = lines.findIndex((l) => /^mcp_servers:\s*(#.*)?$/.test(l));
  if (idx < 0) {
    if (/^mcp_servers:/m.test(base)) return null; // inline/flow style: don't guess
    // We own the whole mcp_servers key, so it goes inside the markers and leaves with them.
    const body = base.replace(/\s*$/, '');
    const inner = hermesBlock(2, url).split('\n').slice(1, -1).join('\n');
    return (body ? `${body}\n\n` : '') + `${BEGIN}\nmcp_servers:\n${inner}\n${END}\n`;
  }
  // Find the child indent, and bail if justclaw-it is already defined by hand.
  let indent = null;
  for (let j = idx + 1; j < lines.length; j++) {
    const l = lines[j];
    if (!l.trim() || l.trim().startsWith('#')) continue;
    const m = l.match(/^(\s+)\S/);
    if (!m) break; // next top-level key
    if (indent === null) indent = m[1].length;
    if (m[1].length === indent && l.trim() === `${SERVER_NAME}:`) return null;
  }
  lines.splice(idx + 1, 0, hermesBlock(indent ?? 2, url));
  return lines.join('\n');
}

const hermes = {
  id: 'hermes',
  name: 'Hermes Agent',
  skillsDir: () => path.join(hermesHome(), 'skills'),
  configPath: hermesFile,
  detect: () => Boolean(which('hermes')) || exists(hermesHome()),
  isConfigured() {
    return exists(hermesFile()) && hasBlock(fs.readFileSync(hermesFile(), 'utf8'));
  },
  configure(key, url) {
    const f = hermesFile();
    const text = exists(f) ? fs.readFileSync(f, 'utf8') : '';
    const next = insertHermes(text, url);
    if (next === null) {
      return { changed: false, file: f, skipped: 'mcp_servers is in a format we will not rewrite automatically; add the snippet below by hand' };
    }
    // Pre-rename installs stored the key as LEGACY_ENV_VAR; rename it in the same write.
    const envChanged = editEnv(hermesEnv(), { remove: [LEGACY_ENV_VAR], set: [ENV_VAR, key] });
    if (next === text) return { changed: envChanged, file: f };
    const bak = backup(f);
    writeFileAtomic(f, next, exists(f) ? undefined : 0o600);
    return { changed: true, file: f, backup: bak, notes: `Key stored in ${hermesEnv()} as ${ENV_VAR}. Restart Hermes.` };
  },
  unconfigure() {
    const f = hermesFile();
    if (!exists(f)) return { changed: false, file: f };
    const text = fs.readFileSync(f, 'utf8');
    // The env lines are ours only if our managed block was there to use them.
    if (!hasBlock(text) && !hasBlock(text, OLD_BEGIN)) return { changed: false, file: f };
    const bak = backup(f);
    writeFileAtomic(f, stripBlock(stripOldBlock(text)).replace(/\n{3,}/g, '\n\n'));
    editEnv(hermesEnv(), { remove: [ENV_VAR, LEGACY_ENV_VAR] });
    return { changed: true, file: f, backup: bak };
  },
  snippet: (url) => `# ~/.hermes/config.yaml\nmcp_servers:\n${hermesBlock(2, url).split('\n').slice(1, -1).join('\n')}\n\n# ~/.hermes/.env\n${ENV_VAR}=<YOUR_API_KEY>`,
};

export const CLIENTS = [claudeCode, claudeDesktop, cursor, windsurf, codex, openclaw, hermes];
export const byId = (id) => CLIENTS.find((c) => c.id === id);
