/**
 * Pure decoders for the byte buffers the pinned Project Ignis core hands back.
 *
 * Nothing in this module touches WebAssembly, so every decoder can be exercised in a
 * plain Node test against golden fixtures captured from the real core. The three
 * buffer shapes decoded here are:
 *
 * - the framed message buffer from `OCG_DuelGetMessage`
 * - the tagged segment buffer from `OCG_DuelQuery` (`card::get_infos`)
 * - the flat field buffer from `OCG_DuelQueryField`
 */

import {
  MZONE_SEQUENCE_COUNT,
  QUERY_ALIAS,
  QUERY_ATTACK,
  QUERY_ATTRIBUTE,
  QUERY_BASE_ATTACK,
  QUERY_BASE_DEFENSE,
  QUERY_CODE,
  QUERY_COUNTERS,
  QUERY_COVER,
  QUERY_DEFENSE,
  QUERY_END,
  QUERY_EQUIP_CARD,
  QUERY_IS_HIDDEN,
  QUERY_IS_PUBLIC,
  QUERY_LEVEL,
  QUERY_LINK,
  QUERY_LSCALE,
  QUERY_OVERLAY_CARD,
  QUERY_OWNER,
  QUERY_POSITION,
  QUERY_RACE,
  QUERY_RANK,
  QUERY_REASON,
  QUERY_REASON_CARD,
  QUERY_RSCALE,
  QUERY_STATUS,
  QUERY_TARGET_CARD,
  QUERY_TYPE,
  SZONE_SEQUENCE_COUNT,
  messageName,
} from "./engine-constants.js";

export interface OcgcorePacket {
  type: number;
  payload: Uint8Array;
  packetBytes: number;
}

export interface OcgcorePacketSummary {
  totalBytes: number;
  packetBytes: number;
  messageType: number;
  messageName: string;
}

/** A `loc_info` value: how the core points at another card. */
export interface EngineLocationReference {
  controller: number;
  location: number;
  sequence: number;
  position: number;
}

export interface EngineCounter {
  type: number;
  count: number;
}

/**
 * Every field `card::get_infos` can emit for the flags this project requests.
 * A property is `null` when the core did not include that segment, which keeps
 * "the engine did not say" distinguishable from "the engine said zero".
 */
export interface QueriedCard {
  code: number | null;
  position: number | null;
  alias: number | null;
  type: number | null;
  level: number | null;
  rank: number | null;
  attribute: number | null;
  race: bigint | null;
  attack: number | null;
  defense: number | null;
  baseAttack: number | null;
  baseDefense: number | null;
  reason: number | null;
  cover: number | null;
  reasonCard: EngineLocationReference | null;
  equipTarget: EngineLocationReference | null;
  effectTargets: EngineLocationReference[];
  overlayCodes: number[];
  counters: EngineCounter[];
  owner: number | null;
  status: number | null;
  isPublic: boolean | null;
  lscale: number | null;
  rscale: number | null;
  link: number | null;
  linkMarker: number | null;
  isHidden: boolean | null;
}

export interface QueriedZoneSlot {
  occupied: boolean;
  position: number;
  overlayCount: number;
}

export interface QueriedPlayerField {
  lp: number;
  monsterZones: QueriedZoneSlot[];
  spellZones: QueriedZoneSlot[];
  deckCount: number;
  handCount: number;
  graveCount: number;
  banishedCount: number;
  extraCount: number;
  extraPendulumCount: number;
}

export interface QueriedChainLink {
  code: number;
  handler: EngineLocationReference;
  triggeringController: number;
  triggeringLocation: number;
  triggeringSequence: number;
  description: bigint;
}

export interface QueriedField {
  duelOptions: bigint;
  players: [QueriedPlayerField, QueriedPlayerField];
  chain: QueriedChainLink[];
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Splits `OCG_DuelGetMessage` output into its length-prefixed packets. */
export function parsePackets(bytes: Uint8Array): OcgcorePacket[] {
  const packets: OcgcorePacket[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (offset + 4 > bytes.byteLength) {
      throw new Error(`Truncated ocgcore packet header at byte ${offset}.`);
    }
    const packetBytes = viewOf(bytes).getUint32(offset, true);
    if (packetBytes < 1 || offset + 4 + packetBytes > bytes.byteLength) {
      throw new Error(`Malformed ocgcore packet length ${packetBytes} at byte ${offset}.`);
    }
    const payload = bytes.slice(offset + 4, offset + 4 + packetBytes);
    packets.push({ type: payload[0]!, payload, packetBytes });
    offset += 4 + packetBytes;
  }
  return packets;
}

export function summarizeFirstOcgcorePacket(bytes: Uint8Array): OcgcorePacketSummary {
  const first = parsePackets(bytes)[0];
  if (!first) throw new Error("ocgcore produced an empty message buffer.");
  return {
    totalBytes: bytes.byteLength,
    packetBytes: first.packetBytes,
    messageType: first.type,
    messageName: messageName(first.type),
  };
}

interface QuerySegment {
  flag: number;
  payload: Uint8Array;
}

/**
 * Walks the `uint16 length / uint32 flag / payload` segments written by
 * `card::get_infos`. The declared length covers the flag as well as the payload.
 */
function readSegments(bytes: Uint8Array): QuerySegment[] {
  const segments: QuerySegment[] = [];
  const view = viewOf(bytes);
  let offset = 0;
  while (offset + 2 <= bytes.byteLength) {
    const segmentLength = view.getUint16(offset, true);
    if (segmentLength < 4 || offset + 2 + segmentLength > bytes.byteLength) {
      throw new Error(`Malformed ocgcore query segment at byte ${offset}.`);
    }
    const flag = view.getUint32(offset + 2, true);
    if (flag === QUERY_END) return segments;
    segments.push({ flag, payload: bytes.slice(offset + 6, offset + 2 + segmentLength) });
    offset += 2 + segmentLength;
  }
  throw new Error("ocgcore query buffer ended without QUERY_END.");
}

function readLocationReference(bytes: Uint8Array, offset: number): EngineLocationReference {
  const view = viewOf(bytes);
  return {
    controller: view.getUint8(offset),
    location: view.getUint8(offset + 1),
    sequence: view.getUint32(offset + 2, true),
    position: view.getUint32(offset + 6, true),
  };
}

/**
 * A card reference segment is 10 bytes when it points at a card and 10 zero bytes
 * when it does not. The core writes `uint16 0` + `uint64 0` for the empty case, so an
 * all-zero controller/location pair is the documented "no card" encoding.
 */
function readOptionalLocationReference(payload: Uint8Array): EngineLocationReference | null {
  if (payload.byteLength < 10) return null;
  const reference = readLocationReference(payload, 0);
  return reference.location === 0 ? null : reference;
}

const EMPTY_QUERIED_CARD: QueriedCard = {
  code: null,
  position: null,
  alias: null,
  type: null,
  level: null,
  rank: null,
  attribute: null,
  race: null,
  attack: null,
  defense: null,
  baseAttack: null,
  baseDefense: null,
  reason: null,
  cover: null,
  reasonCard: null,
  equipTarget: null,
  effectTargets: [],
  overlayCodes: [],
  counters: [],
  owner: null,
  status: null,
  isPublic: null,
  lscale: null,
  rscale: null,
  link: null,
  linkMarker: null,
  isHidden: null,
};

/**
 * Decodes one `OCG_DuelQuery` buffer. The core returns a zero-length buffer for an
 * empty sequence, which this reports as `null` rather than as an empty card.
 */
export function decodeCardQuery(bytes: Uint8Array): QueriedCard | null {
  if (bytes.byteLength === 0) return null;
  const card: QueriedCard = { ...EMPTY_QUERIED_CARD, effectTargets: [], overlayCodes: [], counters: [] };

  for (const segment of readSegments(bytes)) {
    const view = viewOf(segment.payload);
    switch (segment.flag) {
      case QUERY_CODE: card.code = view.getUint32(0, true); break;
      case QUERY_POSITION: card.position = view.getUint32(0, true); break;
      case QUERY_ALIAS: card.alias = view.getUint32(0, true); break;
      case QUERY_TYPE: card.type = view.getUint32(0, true); break;
      case QUERY_LEVEL: card.level = view.getUint32(0, true); break;
      case QUERY_RANK: card.rank = view.getUint32(0, true); break;
      case QUERY_ATTRIBUTE: card.attribute = view.getUint32(0, true); break;
      case QUERY_RACE: card.race = view.getBigUint64(0, true); break;
      case QUERY_ATTACK: card.attack = view.getInt32(0, true); break;
      case QUERY_DEFENSE: card.defense = view.getInt32(0, true); break;
      case QUERY_BASE_ATTACK: card.baseAttack = view.getInt32(0, true); break;
      case QUERY_BASE_DEFENSE: card.baseDefense = view.getInt32(0, true); break;
      case QUERY_REASON: card.reason = view.getUint32(0, true); break;
      case QUERY_COVER: card.cover = view.getUint32(0, true); break;
      case QUERY_REASON_CARD: card.reasonCard = readOptionalLocationReference(segment.payload); break;
      case QUERY_EQUIP_CARD: card.equipTarget = readOptionalLocationReference(segment.payload); break;
      case QUERY_TARGET_CARD: {
        const count = view.getUint32(0, true);
        for (let index = 0; index < count; index += 1) {
          card.effectTargets.push(readLocationReference(segment.payload, 4 + index * 10));
        }
        break;
      }
      case QUERY_OVERLAY_CARD: {
        const count = view.getUint32(0, true);
        for (let index = 0; index < count; index += 1) {
          card.overlayCodes.push(view.getUint32(4 + index * 4, true));
        }
        break;
      }
      case QUERY_COUNTERS: {
        const count = view.getUint32(0, true);
        for (let index = 0; index < count; index += 1) {
          // The core packs the counter type into the low half and the total into the high half.
          const packed = view.getUint32(4 + index * 4, true);
          card.counters.push({ type: packed & 0xffff, count: packed >>> 16 });
        }
        break;
      }
      case QUERY_OWNER: card.owner = view.getUint8(0); break;
      case QUERY_STATUS: card.status = view.getUint32(0, true); break;
      case QUERY_IS_PUBLIC: card.isPublic = view.getUint8(0) === 1; break;
      case QUERY_LSCALE: card.lscale = view.getUint32(0, true); break;
      case QUERY_RSCALE: card.rscale = view.getUint32(0, true); break;
      case QUERY_LINK: {
        card.link = view.getUint32(0, true);
        card.linkMarker = view.getUint32(4, true);
        break;
      }
      case QUERY_IS_HIDDEN: card.isHidden = view.getUint8(0) === 1; break;
      default: break;
    }
  }

  return card;
}

class FieldCursor {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  private require(size: number): number {
    if (this.offset + size > this.bytes.byteLength) {
      throw new Error(`Truncated ocgcore field query at byte ${this.offset}.`);
    }
    const start = this.offset;
    this.offset += size;
    return start;
  }

  uint8(): number {
    return viewOf(this.bytes).getUint8(this.require(1));
  }

  uint32(): number {
    return viewOf(this.bytes).getUint32(this.require(4), true);
  }

  uint64(): bigint {
    return viewOf(this.bytes).getBigUint64(this.require(8), true);
  }

  get consumed(): number {
    return this.offset;
  }
}

function readZoneSlots(cursor: FieldCursor, count: number): QueriedZoneSlot[] {
  const slots: QueriedZoneSlot[] = [];
  for (let sequence = 0; sequence < count; sequence += 1) {
    if (cursor.uint8() === 0) {
      slots.push({ occupied: false, position: 0, overlayCount: 0 });
      continue;
    }
    slots.push({ occupied: true, position: cursor.uint8(), overlayCount: cursor.uint32() });
  }
  return slots;
}

function readPlayerField(cursor: FieldCursor): QueriedPlayerField {
  const lp = cursor.uint32();
  const monsterZones = readZoneSlots(cursor, MZONE_SEQUENCE_COUNT);
  const spellZones = readZoneSlots(cursor, SZONE_SEQUENCE_COUNT);
  return {
    lp,
    monsterZones,
    spellZones,
    deckCount: cursor.uint32(),
    handCount: cursor.uint32(),
    graveCount: cursor.uint32(),
    banishedCount: cursor.uint32(),
    extraCount: cursor.uint32(),
    extraPendulumCount: cursor.uint32(),
  };
}

/**
 * Decodes `OCG_DuelQueryField`: duel options, both players' life points and zone
 * occupancy, the per-location counts, and the current Chain.
 *
 * `duel_options` is a `uint64_t` in the core but `OCG_DuelQueryField` writes only its
 * low 32 bits, so this returns exactly what the buffer carries.
 */
export function decodeFieldQuery(bytes: Uint8Array): QueriedField {
  if (bytes.byteLength === 0) throw new Error("ocgcore returned an empty field query.");
  const cursor = new FieldCursor(bytes);
  const duelOptions = BigInt(cursor.uint32());
  const players: [QueriedPlayerField, QueriedPlayerField] = [readPlayerField(cursor), readPlayerField(cursor)];

  const chain: QueriedChainLink[] = [];
  const chainLength = cursor.uint32();
  for (let index = 0; index < chainLength; index += 1) {
    const code = cursor.uint32();
    const handler: EngineLocationReference = {
      controller: cursor.uint8(),
      location: cursor.uint8(),
      sequence: cursor.uint32(),
      position: cursor.uint32(),
    };
    chain.push({
      code,
      handler,
      triggeringController: cursor.uint8(),
      triggeringLocation: cursor.uint8(),
      triggeringSequence: cursor.uint32(),
      description: cursor.uint64(),
    });
  }

  if (cursor.consumed !== bytes.byteLength) {
    throw new Error(`ocgcore field query had ${bytes.byteLength - cursor.consumed} trailing bytes.`);
  }
  return { duelOptions, players, chain };
}
