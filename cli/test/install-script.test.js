// install.sh: the Node floor matches package.json "engines" (>=18.17) and the npm 0.0.0-stage
// placeholder is never run. Fake node/npm/npx on PATH; no network, nothing installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'install.sh');

const FAKES = {
  node: `#!/bin/sh
case "$*" in
  -v) echo "v$FAKE_NODE";;
  *'[0]'*) echo "$FAKE_NODE" | cut -d. -f1;;
  *'[1]'*) echo "$FAKE_NODE" | cut -d. -f2;;
esac
`,
  npm: `#!/bin/sh
case "$FAKE_NPM_MODE" in
  e404) echo "npm error code E404" >&2; exit 1;;
  offline) echo "npm error code ETIMEDOUT" >&2; exit 1;;
esac
echo "$FAKE_NPM_VERSION"
`,
  npx: `#!/bin/sh
echo "npx $*" > "$NPX_LOG"
`,
};

function run({ node = '20.11.0', npmVersion = '0.1.0', npmMode = 'ok', pkg, args = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'justclaw-it-install-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  for (const [name, body] of Object.entries(FAKES)) {
    fs.writeFileSync(path.join(bin, name), body, { mode: 0o755 });
  }
  const log = path.join(dir, 'npx.log');
  const env = { PATH: `${bin}:/usr/bin:/bin`, FAKE_NODE: node, FAKE_NPM_VERSION: npmVersion, FAKE_NPM_MODE: npmMode,
                NPX_LOG: log, HOME: dir };
  if (pkg) env.JUSTCLAW_IT_CLI_PACKAGE = pkg;
  const r = spawnSync('sh', [SCRIPT, ...args], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
                                                 timeout: 20000 });
  const npx = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, stderr: r.stderr, npx };
}

test('runs the CLI init when the package is published', () => {
  const r = run({ args: ['--clients', 'cursor'] });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.npx.trim(), 'npx -y --package=@justclaw-it/cli@latest justclaw-it init --clients cursor');
});

for (const [node, ok] of [['18.16.1', false], ['18.17.0', true], ['17.9.1', false], ['19.0.0', true], ['24.2.0', true]]) {
  test(`Node ${node} ${ok ? 'is accepted' : 'is refused'} (engines >=18.17)`, () => {
    const r = run({ node });
    assert.equal(r.code === 0, ok, r.stderr);
    if (!ok) {
      assert.match(r.stderr, /Node\.js 18\.17\+ is required/);
      assert.equal(r.npx, null);
    }
  });
}

for (const [ver, mode] of [['0.0.0-stage', 'ok'], ['', 'ok'], ['', 'e404']]) {
  test(`npm version "${ver}" / ${mode} (placeholder or unpublished) is never run`, () => {
    const r = run({ npmVersion: ver, npmMode: mode });
    assert.equal(r.code, 1);
    assert.equal(r.npx, null);
    assert.match(r.stderr, /not published on npm yet/);
    assert.match(r.stderr, /\/docs\/quickstart/);
  });
}

test('an unreachable registry is not reported as unpublished: npx runs and reports', () => {
  const r = run({ npmMode: 'offline' });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.npx, /justclaw-it init/);
});

test('JUSTCLAW_IT_CLI_PACKAGE skips the registry check', () => {
  const r = run({ npmVersion: '', npmMode: 'e404', pkg: './justclaw-it-cli-0.1.0.tgz' });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.npx, /--package=\.\/justclaw-it-cli-0\.1\.0\.tgz/);
});
