/**
 * Drives the shipping `OcgcoreEngineRuntime` against the real published core.
 *
 * This exercises the production class — not a parallel harness — by injecting a module
 * loader that reads the same artifacts the browser downloads. If `public/ocgcore` has
 * not been published yet the suite skips rather than failing, so a fresh checkout
 * without generated assets still runs green.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  LOCATION_HAND,
  LOCATION_MZONE,
  POS_FACEUP_ATTACK,
} from "../src/simulator/engine-constants.js";
import {
  OcgcoreEngineRuntime,
  type OcgcoreModule,
} from "../src/simulator/ocgcore-engine-runtime.js";
import type { EngineSnapshot, EngineWorkerResponse } from "../src/simulator/engine-protocol.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const distRoot = [
  resolve(repoRoot, "packages", "ocgcore", "dist"),
  resolve(repoRoot, "public", "ocgcore"),
].find((candidate) => existsSync(resolve(candidate, "ocgcore.js")));

const CARD_CODE = 15025844;

async function loadPublishedModule(): Promise<OcgcoreModule> {
  const factory = await import(pathToFileURL(resolve(distRoot!, "ocgcore.js")).href) as {
    default: (options: { locateFile(file: string): string }) => Promise<OcgcoreModule>;
  };
  return factory.default({ locateFile: (file) => resolve(distRoot!, file) });
}

let requestId = 0;

async function send(
  runtime: OcgcoreEngineRuntime,
  command: Parameters<OcgcoreEngineRuntime["handle"]>[0]["command"],
): Promise<EngineWorkerResponse> {
  requestId += 1;
  return runtime.handle({ requestId, command });
}

function expectOk(response: EngineWorkerResponse): EngineSnapshot {
  assert.equal(response.ok, true, response.ok ? "" : `engine failed: ${response.error}`);
  return response.snapshot;
}

test(
  "the shipping runtime queries a full snapshot and follows the chosen zone",
  { skip: distRoot ? false : "no published ocgcore artifacts in this checkout" },
  async () => {
    const runtime = new OcgcoreEngineRuntime(loadPublishedModule);

    const opening = expectOk(await send(runtime, { type: "initialize" }));
    assert.equal(opening.phase, "ready");
    assert.equal(opening.engineVersion, 11);

    const openingField = opening.field;
    assert.ok(openingField, "initialization must produce a normalized field state");
    assert.equal(openingField.turnCount, 1, "the duel is on its first turn");
    assert.equal(openingField.players[0].lp, 8000);
    assert.equal(openingField.players[1].lp, 8000);
    assert.equal(openingField.players[0].handCount, 1);
    assert.deepEqual(openingField.chain, []);

    const drawn = openingField.cards.find((card) => card.controller === 0 && card.location === LOCATION_HAND);
    assert.ok(drawn, "the drawn card must appear in the normalized state");
    assert.equal(drawn.code, CARD_CODE);
    assert.equal(opening.board?.cards.length, 1);
    assert.equal(opening.board?.cards[0]?.zone, "H");

    // Answer the Normal Summon prompt, then place the monster somewhere other than M1 so a
    // hard-coded zone would be caught.
    const action = opening.prompt;
    assert.ok(action, "the engine must offer an action");
    const afterAction = expectOk(await send(runtime, {
      type: "perform-action",
      promptId: action.id,
      optionId: action.options[0]!.id,
    }));

    const placePrompt = afterAction.prompt;
    assert.ok(placePrompt, "the engine must ask for a zone");
    assert.equal(placePrompt.kind, "zone");
    const m4 = placePrompt.options.find((option) => option.label === "M4");
    assert.ok(m4, "M4 must be legal on an empty board");

    const summoned = expectOk(await send(runtime, {
      type: "perform-action",
      promptId: placePrompt.id,
      optionId: m4.id,
    }));

    const field = summoned.field;
    assert.ok(field);
    assert.equal(field.players[0].handCount, 0, "the card left the hand");
    const monster = field.cards.find((card) => card.location === LOCATION_MZONE && card.controller === 0);
    assert.ok(monster, "the monster must be located on the field");
    assert.equal(monster.sequence, 3, "the engine placed it in the chosen sequence");
    assert.equal(monster.position, POS_FACEUP_ATTACK);
    assert.equal(monster.instanceId, drawn.instanceId, "it is the same card instance that left the hand");

    const board = summoned.board;
    assert.ok(board);
    assert.equal(board.cards.length, 1);
    assert.equal(board.cards[0]?.fieldSlot, "M4");
    assert.equal(board.cards[0]?.faceUp, true);
    assert.deepEqual(
      board.movements.map((movement) => `${movement.from}>${movement.to}`),
      ["H>F"],
      "the movement is derived from the observed diff",
    );

    const reset = expectOk(await send(runtime, { type: "reset" }));
    assert.equal(reset.phase, "idle");
    assert.equal(reset.field, null);
    assert.equal(reset.board, null);
  },
);
