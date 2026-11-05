// Saved CLI state (API key, endpoint, configured clients) in ~/.config/justclaw-it/config.json.
import fs from 'node:fs';
import path from 'node:path';
import { home, exists, log, writeFileAtomic } from './util.js';

// The API-key env var, shared with the client config writers (Hermes .env).
export const ENV_VAR = 'JUSTCLAW_IT_API_KEY';
// Pre-rename env var, still honoured silently.
export const LEGACY_ENV_VAR = 'JUSTCLAW_API_KEY';

const configHome = () => process.env.XDG_CONFIG_HOME || path.join(home(), '.config');
export const stateDir = () => path.join(configHome(), 'justclaw-it');
export const stateFile = () => path.join(stateDir(), 'config.json');
// Pre-rename state file, read when the new one is missing.
export const legacyStateFile = () => path.join(configHome(), 'justclaw', 'config.json');

export const envKey = () => process.env[ENV_VAR] || process.env[LEGACY_ENV_VAR] || '';

// New file first; a missing or unreadable one falls through to the legacy file.
export function readState() {
  for (const f of [stateFile(), legacyStateFile()]) {
    if (!exists(f)) continue;
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      // unreadable: try the next one
    }
  }
  return {};
}

// Always writes the new location. The legacy file (it holds the key) is removed only
// after the new one was written: writeFileAtomic throws before we get there otherwise.
export function writeState(s) {
  fs.mkdirSync(stateDir(), { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(stateDir(), 0o700); // mkdir's mode is masked by umask and skipped for an existing dir
  } catch {
    // windows
  }
  writeFileAtomic(stateFile(), JSON.stringify(s, null, 2) + '\n', 0o600);
  removeLegacyState();
}

// Best effort: a failure here warns and never fails the command that called it.
function removeLegacyState() {
  const f = legacyStateFile();
  if (!exists(f)) return false;
  try {
    fs.rmSync(f);
  } catch (err) {
    log.warn(`could not remove the old saved key ${f}: ${err.message}`);
    return false;
  }
  try {
    fs.rmdirSync(path.dirname(f));
  } catch {
    // not empty: leave it
  }
  return true;
}

// Remove saved state (new and legacy). Returns the files removed.
export function removeState() {
  const gone = [];
  if (exists(stateFile())) {
    fs.rmSync(stateFile());
    gone.push(stateFile());
  }
  const legacy = legacyStateFile();
  if (removeLegacyState()) gone.push(legacy);
  return gone;
}
