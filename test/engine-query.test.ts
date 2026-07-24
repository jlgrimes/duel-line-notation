import assert from "node:assert/strict";
import test from "node:test";
import {
  FULL_CARD_QUERY_FLAGS,
  MSG_NEW_TURN,
  MSG_SELECT_IDLECMD,
  MSG_SELECT_PLACE,
  POS_FACEUP_ATTACK,
  QUERY_ALIAS,
  QUERY_CODE,
  QUERY_END,
  QUERY_IS_PUBLIC,
  QUERY_OWNER,
  QUERY_POSITION,
  QUERY_STATUS,
  QUERY_TYPE,
  TYPE_MONSTER,
  TYPE_NORMAL,
} from "../src/simulator/engine-constants.js";
import {
  decodeCardQuery,
  decodeFieldQuery,
  parsePackets,
  summarizeFirstOcgcorePacket,
} from "../src/simulator/engine-query.js";
import { ocgcoreFixture } from "./fixtures/ocgcore-golden.js";

const CARD_CODE = 15025844; // Mystical Elf

test("packet parser splits the golden startup buffer into framed packets", () => {
  const packets = parsePackets(ocgcoreFixture("startupMessages"));

  assert.ok(packets.length > 0, "expected at least one startup packet");
  assert.ok(packets.some((packet) => packet.type === MSG_NEW_TURN), "expected MSG_NEW_TURN");
  assert.ok(packets.some((packet) => packet.type === MSG_SELECT_IDLECMD), "expected MSG_SELECT_IDLECMD");
  for (const packet of packets) {
    assert.equal(packet.payload.byteLength, packet.packetBytes, "payload length must match the frame header");
  }

  const totalFramed = packets.reduce((sum, packet) => sum + packet.packetBytes + 4, 0);
  assert.equal(totalFramed, ocgcoreFixture("startupMessages").byteLength, "every byte must be accounted for");
});

test("packet parser rejects truncated and malformed frames", () => {
  assert.throws(() => parsePackets(Uint8Array.from([1, 2, 3])), /Truncated ocgcore packet header/);
  assert.throws(() => parsePackets(Uint8Array.from([99, 0, 0, 0, 1])), /Malformed ocgcore packet length/);
  assert.throws(() => parsePackets(Uint8Array.from([0, 0, 0, 0])), /Malformed ocgcore packet length/);
  assert.deepEqual(parsePackets(new Uint8Array()), []);
});

test("first-packet summary names the message type", () => {
  const summary = summarizeFirstOcgcorePacket(ocgcoreFixture("startupMessages"));

  assert.equal(summary.totalBytes, ocgcoreFixture("startupMessages").byteLength);
  assert.equal(summary.messageName, "MSG_DRAW");
  assert.throws(() => summarizeFirstOcgcorePacket(new Uint8Array()), /empty message buffer/);
});

test("card query decoder reads every requested field from the opening hand", () => {
  const card = decodeCardQuery(ocgcoreFixture("openingHandCard"));

  assert.ok(card, "the opening hand card must decode");
  assert.equal(card.code, CARD_CODE);
  assert.equal(card.alias, CARD_CODE, "an unaliased card reports itself");
  assert.equal(card.type, TYPE_MONSTER | TYPE_NORMAL);
  assert.equal(card.level, 4);
  assert.equal(card.attack, 800);
  assert.equal(card.defense, 2000);
  assert.equal(card.baseAttack, 800);
  assert.equal(card.baseDefense, 2000);
  assert.equal(card.attribute, 0x10, "LIGHT");
  assert.equal(card.race, 2n, "Spellcaster");
  assert.equal(card.owner, 0);
  assert.equal(card.rank, 0);
  assert.equal(card.link, 0);
  assert.deepEqual(card.counters, []);
  assert.deepEqual(card.overlayCodes, []);
  assert.equal(typeof card.status, "number");
});

test("card query decoder distinguishes an empty zone from an empty card", () => {
  assert.equal(decodeCardQuery(ocgcoreFixture("emptyMonsterZone")), null);
});

test("card query decoder reports the summoned monster face-up in Attack Position", () => {
  const card = decodeCardQuery(ocgcoreFixture("summonedMonster"));

  assert.ok(card);
  assert.equal(card.code, CARD_CODE);
  assert.equal(card.position, POS_FACEUP_ATTACK);
  assert.equal(card.isPublic, true, "a face-up monster is public information");
});

test("card query decoder walks segments without assuming their order", () => {
  const segment = (flag: number, payload: number[]) => {
    const bytes = [payload.length + 4, 0, flag & 0xff, (flag >>> 8) & 0xff, (flag >>> 16) & 0xff, (flag >>> 24) & 0xff];
    return [...bytes, ...payload];
  };
  const buffer = Uint8Array.from([
    ...segment(QUERY_IS_PUBLIC, [1]),
    ...segment(QUERY_POSITION, [POS_FACEUP_ATTACK, 0, 0, 0]),
    ...segment(QUERY_CODE, [0x01, 0x02, 0x03, 0x04]),
    ...segment(QUERY_END, []),
  ]);

  const card = decodeCardQuery(buffer);

  assert.ok(card);
  assert.equal(card.code, 0x04030201);
  assert.equal(card.position, POS_FACEUP_ATTACK);
  assert.equal(card.isPublic, true);
  assert.equal(card.level, null, "a flag the core did not send stays null, not zero");
});

test("card query decoder rejects buffers that never terminate", () => {
  assert.throws(
    () => decodeCardQuery(Uint8Array.from([5, 0, QUERY_CODE, 0, 0, 0, 7])),
    /ended without QUERY_END/,
  );
  assert.throws(() => decodeCardQuery(Uint8Array.from([2, 0, 1, 2])), /Malformed ocgcore query segment/);
});

test("field query decoder reads both players, every zone, and the empty Chain", () => {
  const field = decodeFieldQuery(ocgcoreFixture("openingField"));

  assert.equal(field.players.length, 2);
  assert.equal(field.players[0].lp, 8000);
  assert.equal(field.players[1].lp, 8000);
  assert.equal(field.players[0].monsterZones.length, 7, "the core sizes list_mzone at 7");
  assert.equal(field.players[0].spellZones.length, 8, "the core sizes list_szone at 8");
  assert.ok(field.players[0].monsterZones.every((slot) => !slot.occupied), "no monsters at the opening");
  assert.equal(field.players[0].handCount, 1, "player 0 drew exactly one card");
  assert.equal(field.players[0].deckCount, 0, "the bootstrap deck holds a single card");
  assert.equal(field.players[0].graveCount, 0);
  assert.deepEqual(field.chain, [], "no Chain is being built at the opening");
});

test("field query decoder observes the summoned monster in the chosen zone", () => {
  const field = decodeFieldQuery(ocgcoreFixture("summonedField"));

  const occupied = field.players[0].monsterZones
    .map((slot, sequence) => ({ ...slot, sequence }))
    .filter((slot) => slot.occupied);

  assert.equal(occupied.length, 1);
  assert.equal(occupied[0]?.sequence, 2, "the fixture places the monster in M3");
  assert.equal(occupied[0]?.position, POS_FACEUP_ATTACK);
  assert.equal(occupied[0]?.overlayCount, 0);
  assert.equal(field.players[0].handCount, 0, "the card left the hand");
});

test("field query decoder rejects empty and trailing-byte buffers", () => {
  assert.throws(() => decodeFieldQuery(new Uint8Array()), /empty field query/);

  const padded = new Uint8Array(ocgcoreFixture("openingField").byteLength + 3);
  padded.set(ocgcoreFixture("openingField"));
  assert.throws(() => decodeFieldQuery(padded), /trailing bytes/);

  assert.throws(() => decodeFieldQuery(ocgcoreFixture("openingField").slice(0, 40)), /Truncated ocgcore field query/);
});

test("the place prompt fixture exposes the zones the engine left legal", () => {
  const packet = ocgcoreFixture("selectPlacePacket");

  assert.equal(packet[0], MSG_SELECT_PLACE);
  assert.equal(packet[1], 0, "player 0 is asked");
  assert.equal(packet[2], 1, "exactly one placement is requested");
  const unavailable = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(3, true);
  for (let sequence = 0; sequence < 5; sequence += 1) {
    assert.equal((unavailable >>> sequence) & 1, 0, `M${sequence + 1} must be legal on an empty board`);
  }
});

test("the requested query flag mask asks for identity and state, never the terminator", () => {
  for (const flag of [QUERY_CODE, QUERY_ALIAS, QUERY_POSITION, QUERY_TYPE, QUERY_OWNER, QUERY_STATUS]) {
    assert.equal(FULL_CARD_QUERY_FLAGS & flag, flag);
  }
  assert.equal(FULL_CARD_QUERY_FLAGS & QUERY_END, 0, "QUERY_END is a terminator, never a request");
});
