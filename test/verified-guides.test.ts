import assert from "node:assert/strict";
import test from "node:test";
import { loadFileCombos } from "../server/catalog-files.js";
import { buildGuidePlayback } from "../src/guide-visualizer.js";

test("verified guide snapshots are attributed, unique, and visualizable", async () => {
  const guides = (await loadFileCombos()).filter((combo) => combo.contentType === "guide" && !combo.id.includes("/occ-"));
  assert.equal(guides.length, 27);
  assert.equal(new Set(guides.map((guide) => guide.id)).size, guides.length);

  for (const combo of guides) {
    assert.ok(combo.guide, `${combo.id} has a structured guide`);
    assert.match(combo.sourceUrl, /^https:\/\//, `${combo.id} has an attributable source`);
    assert.ok(combo.guide.steps.length > 0, `${combo.id} has steps`);
    assert.ok(combo.guide.starterCards.length > 0, `${combo.id} has starters`);
    const manifestNames = new Set(Object.values(combo.manifest.cards).map((card) => card.name));
    for (const starter of combo.guide.starterCards) assert.ok(manifestNames.has(starter), `${combo.id} includes starter ${starter}`);
    const playback = buildGuidePlayback(combo.guide, combo.manifest);
    assert.ok(playback.frames.length > combo.guide.steps.length, `${combo.id} produces animation frames`);
  }
});

test("replay snapshots retain unique direct sources and exact action counts", async () => {
  const replays = (await loadFileCombos()).filter((combo) => combo.lineSlug.startsWith("replay-"));
  assert.equal(replays.length, 16);
  assert.equal(new Set(replays.map((combo) => combo.sourceUrl)).size, replays.length);
  assert.equal(replays.reduce((total, combo) => total + combo.stepCount, 0), 645);
  for (const combo of replays) {
    assert.equal(combo.guide?.steps.length, combo.stepCount);
    assert.match(combo.sourceUrl, /^https:\/\/www\.ygocombo\.com\/combo\/\d+\/$/);
  }
});
