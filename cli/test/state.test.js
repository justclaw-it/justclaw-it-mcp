// Saved state and API-key env var, including the pre-release fallbacks.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'justclaw-it-state-'));
process.env.HOME = HOME;
process.env.XDG_CONFIG_HOME = path.join(HOME, '.config');
const NEW = path.join(HOME, '.config', 'justclaw-it', 'config.json');
const OLD = path.join(HOME, '.config', 'justclaw', 'config.json');

let st;
before(async () => {
  st = await import('../lib/state.js');
});
beforeEach(() => {
  fs.rmSync(path.join(HOME, '.config'), { recursive: true, force: true });
  delete process.env.JUSTCLAW_IT_API_KEY;
  delete process.env.JUSTCLAW_API_KEY;
});

const put = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
};

test('state: lives in ~/.config/justclaw-it', () => {
  assert.equal(st.stateFile(), NEW);
  st.writeState({ apiKey: 'k1' });
  assert.deepEqual(JSON.parse(fs.readFileSync(NEW, 'utf8')), { apiKey: 'k1' });
  assert.equal((fs.statSync(NEW).mode & 0o777).toString(8), '600');
  assert.deepEqual(st.readState(), { apiKey: 'k1' });
});

test('state: reads the legacy file when the new one is missing, then writes the new one', () => {
  put(OLD, { apiKey: 'old' });
  assert.deepEqual(st.readState(), { apiKey: 'old' });
  st.writeState({ ...st.readState(), url: 'u' });
  assert.deepEqual(JSON.parse(fs.readFileSync(NEW, 'utf8')), { apiKey: 'old', url: 'u' });
  assert.equal(fs.existsSync(OLD), false);
});

test('state: the new file wins over the legacy one', () => {
  put(OLD, { apiKey: 'old' });
  put(NEW, { apiKey: 'new' });
  assert.equal(st.readState().apiKey, 'new');
});

test('state: an unreadable new file falls through to the legacy one', () => {
  put(OLD, { apiKey: 'old' });
  fs.mkdirSync(path.dirname(NEW), { recursive: true });
  fs.writeFileSync(NEW, '{ not json');
  assert.deepEqual(st.readState(), { apiKey: 'old' });
});

test('state: the legacy file is kept when the new one cannot be written', () => {
  put(OLD, { apiKey: 'old' });
  fs.mkdirSync(path.dirname(NEW), { recursive: true });
  fs.mkdirSync(NEW); // a directory where config.json should go: the write fails
  assert.throws(() => st.writeState({ apiKey: 'new' }));
  assert.deepEqual(JSON.parse(fs.readFileSync(OLD, 'utf8')), { apiKey: 'old' });
});

test('state: the state dir is chmod 700', () => {
  fs.mkdirSync(path.dirname(NEW), { recursive: true, mode: 0o755 });
  fs.chmodSync(path.dirname(NEW), 0o755);
  st.writeState({ apiKey: 'k' });
  assert.equal((fs.statSync(path.dirname(NEW)).mode & 0o777).toString(8), '700');
});

test('state: removeState removes both files', () => {
  put(OLD, { apiKey: 'old' });
  put(NEW, { apiKey: 'new' });
  assert.deepEqual(st.removeState(), [NEW, OLD]);
  assert.equal(fs.existsSync(NEW), false);
  assert.equal(fs.existsSync(OLD), false);
  assert.deepEqual(st.readState(), {});
});

test('env: JUSTCLAW_IT_API_KEY, falling back to the legacy JUSTCLAW_API_KEY', () => {
  assert.equal(st.ENV_VAR, 'JUSTCLAW_IT_API_KEY');
  assert.equal(st.envKey(), '');
  process.env.JUSTCLAW_API_KEY = 'legacy';
  assert.equal(st.envKey(), 'legacy');
  process.env.JUSTCLAW_IT_API_KEY = 'current';
  assert.equal(st.envKey(), 'current');
});
