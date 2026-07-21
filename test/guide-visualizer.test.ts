import assert from "node:assert/strict";
import test from "node:test";
import type { ComboGuide } from "../src/catalog-model.js";
import { buildGuidePlayback } from "../src/guide-visualizer.js";
import type { DeckManifest } from "../src/model.js";

const manifest: DeckManifest = {
  schemaVersion: 1,
  slug: "sky-striker",
  name: "Sky Striker",
  cards: {
    C1: { name: "Sky Striker Ace - Raye", kind: "monster", level: 4 },
    C2: { name: "Sky Striker Ace - Hayate", kind: "monster" },
  },
};

const guide: ComboGuide = {
  contributor: "test",
  starterCards: ["Sky Striker Ace - Raye"],
  cardNames: ["Sky Striker Ace - Raye", "Sky Striker Ace - Hayate"],
  prerequisites: [],
  steps: [
    "Normal Summon Sky Striker Ace - Raye.",
    "Link Summon Sky Striker Ace - Hayate using Sky Striker Ace - Raye.",
  ],
  notes: [],
  endBoard: "Hayate in the Extra Monster Zone and Raye in the GY.",
  variants: [],
  tags: [],
};

test("structured guides animate through the duel board", () => {
  const sequence = buildGuidePlayback(guide, manifest);
  assert.equal(sequence.frames.length, 3);
  assert.equal(sequence.frames[0]?.cards.find((card) => card.alias === "C1")?.zone, "H");
  assert.equal(sequence.frames[1]?.cards.find((card) => card.alias === "C1")?.fieldSlot, "M1");
  assert.equal(sequence.frames[2]?.cards.find((card) => card.alias === "C1")?.zone, "G");
  assert.equal(sequence.frames[2]?.cards.find((card) => card.alias === "C2")?.fieldSlot, "EMZ1");
  assert.equal(sequence.frames[2]?.movements.length, 2);
});

test("used guide Spells resolve from the backrow to the GY", () => {
  const spellManifest: DeckManifest = {
    schemaVersion: 1,
    slug: "branded",
    name: "Branded",
    cards: { C1: { name: "Branded Fusion", kind: "spell" } },
  };
  const spellGuide: ComboGuide = {
    ...guide,
    starterCards: ["Branded Fusion"],
    cardNames: ["Branded Fusion"],
    steps: ["Activate Branded Fusion to Fusion Summon a Fusion Monster."],
  };
  const frames = buildGuidePlayback(spellGuide, spellManifest).frames;
  assert.equal(frames.length, 3);
  assert.equal(frames[1]?.cards[0]?.zone, "F");
  assert.deepEqual(frames[1]?.movements[0], { cardId: "guide-c1-0", alias: "C1", from: "H", to: "F" });
  assert.equal(frames[2]?.cards[0]?.zone, "G");
  assert.deepEqual(frames[2]?.movements[0], { cardId: "guide-c1-0", alias: "C1", from: "F", to: "G" });
});
