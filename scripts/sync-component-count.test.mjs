import assert from "node:assert/strict";
import test from "node:test";
import { applyCount, floorLabel, parseLiveCount, readmeLabel } from "./sync-component-count.mjs";

const sample = "search **over 5.3 million real, quality-scored components";

test("reads the licence-cleared count and ignores commas", () => {
  const text = "search 6,123,344 licence-cleared code components";
  assert.equal(parseLiveCount(text), 6123344);
  assert.equal(parseLiveCount("no count here"), null);
});

test("rounds down to a tenth of a million and drops a zero fraction", () => {
  assert.equal(floorLabel(6123344), "6.1");
  assert.equal(floorLabel(5394221), "5.3");
  assert.equal(floorLabel(6000000), "6");
});

test("replaces only the README count phrase", () => {
  assert.equal(readmeLabel(sample), "5.3");
  assert.equal(applyCount(sample, "6.1"), "search **over 6.1 million real, quality-scored components");
  assert.equal(applyCount("no phrase", "6.1"), null);
});
