import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists } from './util.js';

const MARKER = '.justclaw-it-managed';
// Pre-rename marker and skill dirs. Dirs carrying either marker are ours; the legacy
// dirs are removed on install and uninstall so nobody keeps two copies of each skill.
const LEGACY_MARKER = '.justclaw-managed';
const LEGACY_SKILLS = ['justclaw-search', 'justclaw-pull', 'justclaw-starter'];
const isOurs = (dest) => exists(path.join(dest, MARKER)) || exists(path.join(dest, LEGACY_MARKER));

// Remove legacy skill dirs in <dir> that we installed. Returns the names removed.
function removeLegacySkills(dir) {
  const removed = [];
  for (const name of LEGACY_SKILLS) {
    const dest = path.join(dir, name);
    if (isOurs(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
const here = path.dirname(fileURLToPath(import.meta.url));

// Skills ship inside the npm package (cli/skills, copied at prepack) and live
// at <repo>/skills in a checkout.
export function skillsSource() {
  for (const p of [path.resolve(here, '..', 'skills'), path.resolve(here, '..', '..', 'skills')]) {
    if (exists(path.join(p, 'justclaw-it-search', 'SKILL.md'))) return p;
  }
  return null;
}

export function listSkills() {
  const src = skillsSource();
  if (!src) return [];
  return fs.readdirSync(src).filter((d) => exists(path.join(src, d, 'SKILL.md')));
}

// Copy every bundled skill into <dir>/<name>. A dir we did not create (no marker) is left alone.
export function installSkills(dir) {
  const src = skillsSource();
  if (!src) throw new Error('bundled skills not found');
  const done = [];
  const skipped = [];
  for (const name of listSkills()) {
    const dest = path.join(dir, name);
    if (exists(dest) && !isOurs(dest)) {
      skipped.push(name);
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(path.join(src, name), dest, { recursive: true });
    fs.writeFileSync(path.join(dest, MARKER), 'Installed by `justclaw-it init`; removed by `justclaw-it uninstall`.\n');
    done.push(name);
  }
  return { done, skipped, migrated: removeLegacySkills(dir) };
}

export function removeSkills(dir) {
  const removed = removeLegacySkills(dir);
  for (const name of listSkills()) {
    const dest = path.join(dir, name);
    if (isOurs(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}

export function installedSkills(dir) {
  return listSkills().filter((name) => isOurs(path.join(dir, name)));
}
