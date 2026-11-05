import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';

export const home = () => process.env.HOME || os.homedir();

const color = (code) => (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = { green: color(32), red: color(31), yellow: color(33), dim: color(2), bold: color(1), cyan: color(36) };

export const log = {
  ok: (m) => console.log(`${c.green('✔')} ${m}`),
  warn: (m) => console.log(`${c.yellow('!')} ${m}`),
  err: (m) => console.error(`${c.red('✘')} ${m}`),
  info: (m) => console.log(`  ${m}`),
  step: (m) => console.log(`\n${c.bold(m)}`),
};

export function redact(key) {
  if (!key) return '';
  return key.length > 16 ? `${key.slice(0, 12)}…${key.slice(-4)}` : '***';
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function which(bin) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', timeout: 60000, ...opts });
  return { code: r.status ?? (r.error ? 1 : 0), stdout: r.stdout || '', stderr: r.stderr || (r.error ? r.error.message : '') };
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

// Copy <file> to <file>.justclaw-it-bak-<timestamp> before we touch it. Returns the backup path.
export function backup(file) {
  if (!exists(file)) return null;
  const dest = `${file}.justclaw-it-bak-${stamp()}`;
  fs.copyFileSync(file, dest);
  try {
    fs.chmodSync(dest, 0o600);
  } catch {
    // windows
  }
  return dest;
}

// Write atomically (temp file + rename), keeping the original file mode when there is one.
export function writeFileAtomic(file, data, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let fileMode = mode;
  if (fileMode === undefined && exists(file)) fileMode = fs.statSync(file).mode & 0o777;
  const tmp = `${file}.justclaw-it-tmp-${process.pid}`;
  fs.writeFileSync(tmp, data, { mode: fileMode ?? 0o600 });
  fs.renameSync(tmp, file);
}

export function readJson(file) {
  if (!exists(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}); not touching it`);
  }
}

export function writeJson(file, obj) {
  writeFileAtomic(file, JSON.stringify(obj, null, 2) + '\n');
}

let rl = null;
function iface() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  return rl;
}
export function closePrompts() {
  if (rl) rl.close();
  rl = null;
}

export function ask(question) {
  return new Promise((resolve) => iface().question(question, (a) => resolve(a.trim())));
}

export async function confirm(question, def = true) {
  const a = (await ask(`${question} ${def ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
  if (!a) return def;
  return a === 'y' || a === 'yes';
}

// Read a secret without echoing it.
export function askSecret(question) {
  const r = iface();
  return new Promise((resolve) => {
    const orig = r._writeToOutput;
    let muted = false;
    r._writeToOutput = function (s) {
      if (!muted) return orig.call(r, s);
      if (s.includes('\n') || s.includes('\r')) return orig.call(r, '\n');
      return orig.call(r, '*'.repeat(s.length > 1 ? 0 : 1));
    };
    r.question(question, (a) => {
      r._writeToOutput = orig;
      resolve(a.trim());
    });
    muted = true;
  });
}

export function openUrl(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  if (process.platform !== 'win32' && !which(cmd)) return false;
  const r = run(cmd, process.platform === 'win32' ? ['""', url] : [url], { stdio: 'ignore', timeout: 5000 });
  return r.code === 0;
}
