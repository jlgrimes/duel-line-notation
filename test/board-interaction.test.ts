import assert from "node:assert/strict";
import test from "node:test";
import type { EngineActionPrompt } from "../src/simulator/engine-protocol.js";
import { boardTargetsFor, isFullyAnchored } from "../src/simulator/board-interaction.js";

function prompt(overrides: Partial<EngineActionPrompt>): EngineActionPrompt {
  return {
    id: "prompt-1",
    title: "Choose",
    detail: "",
    kind: "action",
    cardCode: null,
    options: [],
    ...overrides,
  };
}

test("zone options become tappable slots on the board", () => {
  const targets = boardTargetsFor(prompt({
    kind: "zone",
    options: [
      { id: "monster-zone-0", label: "M1", detail: "Place in M1.", target: { kind: "field-slot", fieldSlot: "M1" } },
      { id: "monster-zone-3", label: "M4", detail: "Place in M4.", target: { kind: "field-slot", fieldSlot: "M4" } },
    ],
  }));

  assert.ok(targets);
  assert.deepEqual(Object.keys(targets.slotChoices).sort(), ["M1", "M4"]);
  assert.equal(targets.slotChoices.M4?.optionId, "monster-zone-3");
  assert.equal(targets.slotChoices.M2, undefined, "an illegal zone is never offered");
  assert.deepEqual(targets.cardChoices, {});
});

test("card-anchored actions are keyed by the card instance the board renders", () => {
  const targets = boardTargetsFor(prompt({
    options: [{
      id: "normal-summon",
      label: "Normal Summon Mystical Elf",
      detail: null,
      target: { kind: "card", cardId: "engine-card-1" },
    }],
  }));

  assert.ok(targets);
  assert.equal(targets.cardChoices["engine-card-1"]?.optionId, "normal-summon");
  assert.deepEqual(targets.slotChoices, {});
});

test("prompts with no board anchor stay off the board entirely", () => {
  const position = prompt({
    kind: "position",
    options: [
      { id: "position-1", label: "Face-up Attack", detail: null, target: null },
      { id: "position-8", label: "Face-down Defense", detail: null, target: null },
    ],
  });

  assert.equal(boardTargetsFor(position), null, "a battle position is not a place you can point at");
  assert.equal(isFullyAnchored(position), false, "so its buttons must stay on screen");
});

test("no prompt means no targets, so the board stays inert between choices", () => {
  assert.equal(boardTargetsFor(null), null);
  assert.equal(boardTargetsFor(prompt({ options: [] })), null);
  assert.equal(isFullyAnchored(null), false);
  assert.equal(isFullyAnchored(prompt({ options: [] })), false, "an empty prompt is not fully anchored");
});

test("a partly anchored prompt keeps its button list", () => {
  const mixed = prompt({
    options: [
      { id: "a", label: "A", detail: null, target: { kind: "field-slot", fieldSlot: "M1" } },
      { id: "b", label: "B", detail: null, target: null },
    ],
  });

  assert.ok(boardTargetsFor(mixed), "the anchored option is still offered on the board");
  assert.equal(isFullyAnchored(mixed), false, "but the unanchored one must remain reachable");
});
