import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { DeckManifest } from "../src/model.js";
import { parseLine } from "../src/parser.js";
import { buildPlayback } from "../src/visualizer.js";

test("builds movement-driven frames and resolves Chains backwards", async () => {
  const [line, rawManifest] = await Promise.all([
    readFile("decks/mitsurugi/lines/prayers-habakiri.dln", "utf8"),
    readFile("decks/mitsurugi/deck.json", "utf8"),
  ]);
  const sequence = buildPlayback(parseLine(line), JSON.parse(rawManifest) as DeckManifest);

  assert.equal(sequence.frames[0]?.label, "Opening state");
  assert.deepEqual(
    sequence.frames.filter((frame) => frame.stepNumber === 2 && frame.chainPhase === "resolution").map((frame) => frame.chainLink),
    [2, 1],
  );
  assert.ok(sequence.frames.some((frame) => frame.movements.some((move) => move.alias === "ARA" && move.to === "F")));
  assert.equal(sequence.frames.at(-1)?.lp, 7200);
});

test("creates visible placeholder cards for anonymous draws", () => {
  const document = parseLine(`@deck demo\n@line draw\n@start LP=8000; H=[]\n1 DRAW D>H\n@end LP=8000; H=[]`);
  const manifest: DeckManifest = { schemaVersion: 1, slug: "demo", name: "Demo", cards: {} };
  const sequence = buildPlayback(document, manifest);
  assert.equal(sequence.frames[1]?.cards.find((card) => card.alias === "DRAW")?.zone, "H");
});
