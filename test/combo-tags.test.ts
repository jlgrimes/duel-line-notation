import assert from "node:assert/strict";
import test from "node:test";
import { loadFileCombos } from "../server/catalog-files.js";
import { categorizeCombo, COMBO_TAG_GROUPS, groupForTag, type ComboTag } from "../src/combo-tags.js";

test("every catalog route has timing, goal, and commitment tags", async () => {
  const combos = await loadFileCombos();
  for (const combo of combos) {
    const groups = new Set(combo.tags.map(groupForTag));
    assert.ok(groups.has("timing"), `${combo.id} has timing`);
    assert.ok(groups.has("goal"), `${combo.id} has a goal`);
    assert.ok(groups.has("commitment"), `${combo.id} has commitment`);
    assert.equal(combo.tags.filter((tag) => groupForTag(tag) === "timing").length, 1, `${combo.id} has one timing tag`);
    assert.equal(combo.tags.filter((tag) => groupForTag(tag) === "commitment").length, 1, `${combo.id} has one commitment tag`);
  }
});

test("canonical inference distinguishes finishers, board breakers, and hard counters", () => {
  const tags = categorizeCombo({
    id: "example/locked-otk",
    title: "Going-second OTK",
    summary: "Break the opponent's board and establish a floodgate that shuts down Spell activation before lethal damage.",
    handSize: 2,
    guide: { endBoard: "Lethal", tags: ["board break", "otk"], turnPreference: "Going second", otkPotential: true },
  });
  for (const tag of ["Going Second", "Board Breaker", "Finisher", "Hard Counter", "Two-Card Combo"] satisfies ComboTag[]) {
    assert.ok(tags.includes(tag), `includes ${tag}`);
  }
});

test("tag taxonomy has no duplicates", () => {
  const tags = COMBO_TAG_GROUPS.flatMap((group) => [...group.tags]);
  assert.equal(new Set(tags).size, tags.length);
});
