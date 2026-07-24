/**
 * Pins the card-database unpacking rules.
 *
 * The database packs several values into columns that do not line up with `OCG_CardData`.
 * Those conventions were confirmed against known cards rather than assumed, and getting one
 * wrong is silent: a Link monster would gain a nonsense Defence, a Pendulum would lose its
 * scales, and an archetype card would stop belonging to its archetype. These tests hold the
 * rules in place without needing the third-party database present.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  unpackCardRow,
  unpackSetcodes,
  type CardDatabaseRow,
} from "../src/simulator/card-bundle.js";

function row(overrides: Partial<CardDatabaseRow>): CardDatabaseRow {
  return {
    id: 1,
    name: "Test Card",
    alias: 0,
    setcode: 0,
    type: 0x21,
    atk: 0,
    def: 0,
    level: 1,
    race: 1,
    attribute: 1,
    ...overrides,
  };
}

test("set codes unpack from one integer into individual archetype codes", () => {
  assert.deepEqual(unpackSetcodes(0), [], "no archetype");
  assert.deepEqual(unpackSetcodes(0x1bd), [0x1bd], "Mitsurugi");
  assert.deepEqual(unpackSetcodes(0x10f20099), [0x0099, 0x10f2], "a card in two archetypes");
  assert.deepEqual(
    unpackSetcodes(0x0004000300020001n),
    [1, 2, 3, 4],
    "all four slots, which only fit in a bigint",
  );
});

test("an ordinary monster keeps its printed values", () => {
  // Mystical Elf, the card the bootstrap simulator has always hard-coded.
  const card = unpackCardRow(row({
    id: 15025844,
    name: "Mystical Elf",
    type: 0x11,
    atk: 800,
    def: 2000,
    level: 4,
    race: 2,
    attribute: 0x10,
  }));

  assert.equal(card.code, 15025844);
  assert.equal(card.level, 4);
  assert.equal(card.attack, 800);
  assert.equal(card.defense, 2000);
  assert.equal(card.race, "2");
  assert.equal(card.linkMarker, 0, "a non-Link monster has no markers");
  assert.equal(card.leftScale, 0);
  assert.equal(card.rightScale, 0);
});

test("Pendulum scales are unpacked from the upper bytes of the level column", () => {
  // Odd-Eyes Pendulum Dragon: level 7, scales 4 and 4, stored as 0x04040007.
  const card = unpackCardRow(row({ type: 0x01000021, level: 0x04040007 }));

  assert.equal(card.level, 7, "the level is the low byte only");
  assert.equal(card.leftScale, 4);
  assert.equal(card.rightScale, 4);
});

test("Link markers are read from the Defence column, which is not a Defence", () => {
  // Decode Talker: Link 3, marker mask 0x85. Its "def" of 133 is the mask, not a stat.
  const card = unpackCardRow(row({ type: 0x04000021, level: 3, atk: 2300, def: 133 }));

  assert.equal(card.linkMarker, 133);
  assert.equal(card.defense, 0, "a Link monster has no Defence");
  assert.equal(card.level, 3, "the link rating travels in the level field");
  assert.equal(card.attack, 2300);
});

test("a race mask too wide for 32 bits survives as a decimal string", () => {
  // RACE_YOKAI is 0x4000000000000000 and would be destroyed by a 32-bit round trip.
  const card = unpackCardRow(row({ race: 0x4000000000000000n }));

  assert.equal(card.race, "4611686018427387904");
  assert.equal(Number(BigInt(card.race) >> 32n), 0x40000000, "the high half is intact");
});

test("the level column never leaks scale bits into an ordinary level", () => {
  // A level 8 Ritual monster: no Pendulum bits, so nothing may bleed through.
  const card = unpackCardRow(row({ type: 0xa1, level: 8, atk: 2400, def: 1800 }));

  assert.equal(card.level, 8);
  assert.equal(card.leftScale, 0);
  assert.equal(card.rightScale, 0);
  assert.equal(card.defense, 1800, "a Ritual monster keeps its Defence");
});
