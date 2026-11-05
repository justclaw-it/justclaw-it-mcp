// prepack: copy <repo>/skills, README and LICENSE into the package; postpack (--clean): remove the copies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(pkg, '..');
const copies = [
  ['skills', 'skills'],
  ['README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
];

for (const [from, to] of copies) {
  const dest = path.join(pkg, to);
  fs.rmSync(dest, { recursive: true, force: true });
  if (!process.argv.includes('--clean')) fs.cpSync(path.join(repo, from), dest, { recursive: true });
}
