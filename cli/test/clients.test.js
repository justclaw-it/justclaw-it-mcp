// Config writers against a throwaway HOME: idempotent, backed up, reversible.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'justclaw-it-test-'));
process.env.HOME = HOME;
process.env.XDG_CONFIG_HOME = path.join(HOME, '.config');
process.env.PATH = ''; // no real claude/openclaw binaries: exercise the file-based paths
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.CODEX_HOME;
delete process.env.HERMES_HOME;

const KEY = 'cobalt_live_TEST0000TEST0000';
const URL = 'https://justclaw.it.com/mcp';
let mod;
let skills;
before(async () => {
  mod = await import('../lib/clients.js');
  skills = await import('../lib/skills.js');
});

const backups = (dir) => fs.readdirSync(dir).filter((f) => f.includes('.justclaw-it-bak-'));

for (const id of ['claude-code', 'cursor', 'windsurf', 'claude-desktop']) {
  test(`${id}: preserves other entries, idempotent, uninstall`, () => {
    const cl = mod.byId(id);
    const file = cl.configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ keep: 1, mcpServers: { other: { url: 'x' } } }));
    assert.equal(cl.configure(KEY, URL).changed, true);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(cfg.keep, 1);
    assert.ok(cfg.mcpServers.other);
    assert.ok(JSON.stringify(cfg.mcpServers['justclaw-it']).includes(KEY));
    assert.equal(cl.isConfigured(), true);
    assert.equal(cl.configure(KEY, URL).changed, false);
    assert.equal(backups(path.dirname(file)).length >= 1, true);
    assert.equal(cl.unconfigure().changed, true);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(after.mcpServers['justclaw-it'], undefined);
    assert.ok(after.mcpServers.other);
  });

  test(`${id}: migrates an old "justclaw" entry to "justclaw-it" without duplicating`, () => {
    const cl = mod.byId(id);
    const file = cl.configPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ mcpServers: { justclaw: { url: 'stale', headers: {} } } }));
    assert.equal(cl.configure(KEY, URL).changed, true);
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(cfg.mcpServers.justclaw, undefined);
    assert.ok(JSON.stringify(cfg.mcpServers['justclaw-it']).includes(KEY));
  });
}

test('codex: appends a marked TOML block and removes it cleanly', () => {
  const cl = mod.byId('codex');
  const file = cl.configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const orig = 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "x"\n';
  fs.writeFileSync(file, orig);
  assert.equal(cl.configure(KEY, URL).changed, true);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.includes('[mcp_servers.justclaw-it]\nurl = "https://justclaw.it.com/mcp"'));
  assert.match(text, /http_headers = \{ "Authorization" = "Bearer cobalt_live_/);
  assert.equal(cl.configure(KEY, URL).changed, false);
  assert.equal(cl.configure(KEY + 'X', URL).changed, true); // key rotation replaces the block
  assert.equal((fs.readFileSync(file, 'utf8').match(/mcp_servers\.justclaw-it/g) || []).length, 1);
  cl.unconfigure();
  assert.equal(fs.readFileSync(file, 'utf8').trim(), orig.trim());
});

test('codex: migrates a legacy "justclaw" block, leaving exactly one "justclaw-it" block', () => {
  const cl = mod.byId('codex');
  const file = cl.configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const legacy = [
    'model = "gpt-5"',
    '',
    '# >>> justclaw >>>',
    '[mcp_servers.justclaw]',
    'url = "https://justclaw.it.com/mcp"',
    'http_headers = { "Authorization" = "Bearer cobalt_live_OLD" }',
    '# <<< justclaw <<<',
    '',
  ].join('\n');
  fs.writeFileSync(file, legacy);
  assert.equal(cl.configure(KEY, URL).changed, true);
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /mcp_servers\.justclaw\]/);
  assert.match(text, /\[mcp_servers\.justclaw-it\]/);
  assert.equal((text.match(/mcp_servers\.justclaw-it/g) || []).length, 1);
  cl.unconfigure();
  assert.equal(fs.readFileSync(file, 'utf8').trim(), 'model = "gpt-5"');
});

test('hermes: new file, existing mcp_servers, hand-written entry is left alone', () => {
  assert.match(mod.insertHermes('', URL), /^# >>> justclaw-it >>>\nmcp_servers:\n {2}justclaw-it:\n {4}url:/);
  const existing = 'model: x\nmcp_servers:\n    fs:\n        command: npx\nother: 1\n';
  const out = mod.insertHermes(existing, URL);
  assert.match(out, /mcp_servers:\n {4}# >>> justclaw-it >>>\n {4}justclaw-it:\n {8}url: "https/);
  assert.match(out, /Authorization: "Bearer \$\{JUSTCLAW_IT_API_KEY\}"/);
  assert.equal(mod.stripBlock(out), existing);
  assert.equal(mod.insertHermes('mcp_servers:\n  justclaw-it:\n    url: x\n', URL), null);
  assert.equal(mod.insertHermes('mcp_servers: {}\n', URL), null);

  const cl = mod.byId('hermes');
  fs.mkdirSync(path.join(HOME, '.hermes'), { recursive: true });
  fs.writeFileSync(cl.configPath(), existing);
  cl.configure(KEY, URL);
  const env = fs.readFileSync(path.join(HOME, '.hermes', '.env'), 'utf8');
  assert.match(env, /^JUSTCLAW_IT_API_KEY=cobalt_live_/m);
  assert.equal((fs.statSync(path.join(HOME, '.hermes', '.env')).mode & 0o777).toString(8), '600');
  assert.equal(cl.configure(KEY, URL).changed, false);
  cl.unconfigure();
  assert.equal(fs.readFileSync(cl.configPath(), 'utf8'), existing);
  assert.doesNotMatch(fs.readFileSync(path.join(HOME, '.hermes', '.env'), 'utf8'), /JUSTCLAW/);
});

test('hermes: migrates a legacy "justclaw" block to "justclaw-it"', () => {
  const legacy = [
    'model: x',
    'mcp_servers:',
    '  # >>> justclaw >>>',
    '  justclaw:',
    '    url: "https://justclaw.it.com/mcp"',
    '    headers:',
    '      Authorization: "Bearer ${JUSTCLAW_API_KEY}"',
    '  # <<< justclaw <<<',
    '',
  ].join('\n');
  const out = mod.insertHermes(legacy, URL);
  assert.doesNotMatch(out, /\bjustclaw:/);
  assert.match(out, /justclaw-it:/);
  assert.equal((out.match(/justclaw-it:/g) || []).length, 1);

  const cl = mod.byId('hermes');
  fs.mkdirSync(path.join(HOME, '.hermes'), { recursive: true });
  fs.writeFileSync(cl.configPath(), legacy);
  assert.equal(cl.configure(KEY, URL).changed, true);
  const text = fs.readFileSync(cl.configPath(), 'utf8');
  assert.doesNotMatch(text, /\bjustclaw:/);
  assert.match(text, /justclaw-it:/);
  cl.unconfigure();
});

test('openclaw without the CLI: skipped with a snippet, never a half-written file', () => {
  const r = mod.byId('openclaw').configure(KEY, URL);
  assert.ok(r.skipped);
  assert.match(mod.byId('openclaw').snippet(URL), /streamable-http/);
  assert.match(mod.byId('openclaw').snippet(URL), /justclaw-it/);
});

test('skills: install, refuse to clobber foreign dirs, remove only ours', () => {
  const dir = path.join(HOME, 'skills-target');
  fs.mkdirSync(path.join(dir, 'justclaw-it-pull'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'justclaw-it-pull', 'SKILL.md'), 'mine');
  const r = skills.installSkills(dir);
  assert.deepEqual(r.skipped, ['justclaw-it-pull']);
  assert.ok(r.done.includes('justclaw-it-search'));
  assert.match(fs.readFileSync(path.join(dir, 'justclaw-it-search', 'SKILL.md'), 'utf8'), /^---\nname: justclaw-it-search/);
  assert.match(fs.readFileSync(path.join(dir, 'justclaw-it-search', '.justclaw-it-managed'), 'utf8'), /justclaw-it init/);
  assert.deepEqual(skills.installedSkills(dir).sort(), ['justclaw-it-search', 'justclaw-it-starter']);
  skills.removeSkills(dir);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-it-search')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'justclaw-it-pull', 'SKILL.md'), 'utf8'), 'mine');
});

// Pre-release installs used justclaw-<name> dirs with a .justclaw-managed marker.
const legacySkill = (dir, name, marker = true) => {
  fs.mkdirSync(path.join(dir, name), { recursive: true });
  fs.writeFileSync(path.join(dir, name, 'SKILL.md'), `---\nname: ${name}\n---\n`);
  if (marker) fs.writeFileSync(path.join(dir, name, '.justclaw-managed'), 'old');
};

test('skills: install removes our legacy dirs, keeps foreign ones', () => {
  const dir = path.join(HOME, 'skills-legacy-install');
  legacySkill(dir, 'justclaw-search');
  legacySkill(dir, 'justclaw-pull');
  legacySkill(dir, 'justclaw-starter', false); // no marker: not ours
  const r = skills.installSkills(dir);
  assert.deepEqual(r.migrated.sort(), ['justclaw-pull', 'justclaw-search']);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-search')), false);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-pull')), false);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-starter', 'SKILL.md')), true);
  assert.deepEqual(r.done.sort(), ['justclaw-it-pull', 'justclaw-it-search', 'justclaw-it-starter']);
});

test('skills: uninstall removes our legacy dirs too', () => {
  const dir = path.join(HOME, 'skills-legacy-uninstall');
  legacySkill(dir, 'justclaw-search');
  legacySkill(dir, 'justclaw-pull', false);
  const gone = skills.removeSkills(dir);
  assert.deepEqual(gone, ['justclaw-search']);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-search')), false);
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-pull', 'SKILL.md')), true);
});

test('skills: a new-named dir with the legacy marker counts as ours', () => {
  const dir = path.join(HOME, 'skills-legacy-marker');
  legacySkill(dir, 'justclaw-it-search');
  const r = skills.installSkills(dir);
  assert.ok(r.done.includes('justclaw-it-search'));
  assert.equal(fs.existsSync(path.join(dir, 'justclaw-it-search', '.justclaw-it-managed')), true);
});

test('hermes: uninstall leaves .env alone when our block is not in config.yaml', () => {
  const cl = mod.byId('hermes');
  const envFile = path.join(HOME, '.hermes', '.env');
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(cl.configPath(), 'model: x\n');
  const env = 'OTHER=1\nJUSTCLAW_API_KEY=user\nJUSTCLAW_IT_API_KEY=user2\n';
  fs.writeFileSync(envFile, env);
  assert.equal(cl.unconfigure().changed, false);
  assert.equal(fs.readFileSync(envFile, 'utf8'), env);
  assert.equal(fs.readFileSync(cl.configPath(), 'utf8'), 'model: x\n');
});

test('hermes: replaces a legacy JUSTCLAW_API_KEY line in .env', () => {
  const cl = mod.byId('hermes');
  const envFile = path.join(HOME, '.hermes', '.env');
  fs.mkdirSync(path.dirname(envFile), { recursive: true });
  fs.writeFileSync(cl.configPath(), 'model: x\n');
  fs.writeFileSync(envFile, 'OTHER=1\nJUSTCLAW_API_KEY=cobalt_live_OLD\n');
  cl.configure(KEY, URL);
  const env = fs.readFileSync(envFile, 'utf8');
  assert.doesNotMatch(env, /^JUSTCLAW_API_KEY=/m);
  assert.match(env, /^JUSTCLAW_IT_API_KEY=cobalt_live_TEST/m);
  assert.match(env, /^OTHER=1$/m);
  cl.unconfigure();
  assert.doesNotMatch(fs.readFileSync(envFile, 'utf8'), /JUSTCLAW/);
});
