#!/usr/bin/env node
// Keeps the README's "over N million" figure at or below the public page.
// The figure is the rounded-down tenth of a million from the licence-cleared
// count on https://justclaw.it.com/llms.txt. This does not call the paid MCP.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PAGE = "https://justclaw.it.com/llms.txt";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = join(root, "README.md");
const PHRASE = /\*\*over (\d+(?:\.\d+)?) million real,/;

export function parseLiveCount(text) {
  const match = String(text).match(/search\s+([\d,]+)\s+licence-cleared/i);
  if (!match) return null;
  const count = Number(match[1].replaceAll(",", ""));
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

export function floorLabel(count) {
  const tenths = Math.floor(count / 100_000);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  return fraction === 0 ? String(whole) : `${whole}.${fraction}`;
}

export function readmeLabel(readme) {
  const match = String(readme).match(PHRASE);
  return match ? match[1] : null;
}

export function applyCount(readme, label) {
  if (!PHRASE.test(readme)) return null;
  return readme.replace(PHRASE, `**over ${label} million real,`);
}

async function liveCount() {
  const response = await fetch(PAGE, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`public page returned ${response.status}`);
  const count = parseLiveCount(await response.text());
  if (count == null) throw new Error("public page has no licence-cleared count");
  return count;
}

function labelValue(label) {
  return Number(label);
}

async function main() {
  const write = process.argv.includes("--write");
  const readme = readFileSync(readmePath, "utf8");
  const current = readmeLabel(readme);
  if (current == null) {
    console.error("sync-component-count: README has no 'over N million real' phrase");
    process.exit(1);
  }
  let count;
  try {
    count = await liveCount();
  } catch (error) {
    if (write) {
      console.error(`sync-component-count: ${error.message}`);
      process.exit(1);
    }
    console.log(`sync-component-count: skipped (${error.message})`);
    process.exit(0);
  }
  const next = floorLabel(count);
  if (labelValue(current) > labelValue(next)) {
    console.error(`sync-component-count: README says over ${current} million, public floor is ${next}`);
    process.exit(1);
  }
  if (current === next) {
    console.log(`sync-component-count: ok (${next})`);
    return;
  }
  if (!write) {
    console.log(`sync-component-count: README says ${current}; public floor is ${next}. Run with --write to refresh.`);
    return;
  }
  const updated = applyCount(readme, next);
  writeFileSync(readmePath, updated);
  console.log(`sync-component-count: wrote ${next}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
