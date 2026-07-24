import { createContext, useContext, useEffect, useState } from "react";
import type {
  PlaybackFrame,
  VisualCard,
  VisualFieldSlot,
  VisualZone,
} from "../src/visualizer.js";
import type { BoardChoice, BoardTargets } from "../src/simulator/board-interaction.js";
import type { CardScan } from "./card-service";

/**
 * Makes the board itself the input surface. Opt-in: notation playback passes nothing and
 * renders exactly as before, while the simulator passes the choices the engine reported.
 */
export interface BoardInteraction extends BoardTargets {
  busy: boolean;
  onChoose(optionId: string): void;
}

interface DuelBoardProps {
  frame: PlaybackFrame;
  scans?: Record<string, CardScan>;
  ariaLabel?: string;
  showActionCallout?: boolean;
  interaction?: BoardInteraction;
}

const CardScanContext = createContext<Record<string, CardScan>>({});
const InteractionContext = createContext<BoardInteraction | null>(null);

/**
 * A transparent button laid over a card or zone. Using a real button keeps the target
 * keyboard-reachable and screen-reader labelled, without restyling the card itself.
 */
function ChoiceHotspot({ choice, kind }: { choice: BoardChoice; kind: "zone" | "card" }) {
  const interaction = useContext(InteractionContext);
  if (!interaction) return null;
  return (
    <button
      type="button"
      className={`choice-hotspot choice-hotspot-${kind}`}
      disabled={interaction.busy}
      onClick={() => interaction.onChoose(choice.optionId)}
      title={choice.detail ?? choice.label}
      aria-label={choice.detail ? `${choice.label}. ${choice.detail}` : choice.label}
    >
      <span>{choice.label}</span>
    </button>
  );
}

export function DuelBoard({
  frame,
  scans = {},
  ariaLabel = "Duel board",
  showActionCallout = true,
  interaction,
}: DuelBoardProps) {
  const chainLink = frame.chainLink;

  return (
    <CardScanContext.Provider value={scans}>
      <InteractionContext.Provider value={interaction ?? null}>
      <div className={`duel-canvas ${interaction ? "interactive" : ""}`} aria-label={ariaLabel}>
        <div className="opponent-field" aria-hidden="true">
          <span>Opponent</span>
          <div>{Array.from({ length: 5 }, (_, index) => <i key={index} />)}</div>
        </div>

        <div className="life-points"><small>LP</small><strong>{frame.lp.toLocaleString()}</strong></div>

        {chainLink !== undefined && (
          <div className="chain-resolver">
            <span>{frame.chainPhase === "activation" ? "Building Chain" : "Chain resolving"}</span>
            <div>
              {Array.from({ length: frame.chainSize ?? 0 }, (_, index) => index + 1).reverse().map((link) => (
                <i
                  key={link}
                  className={link === chainLink
                    ? "active"
                    : frame.chainPhase === "resolution" && link > chainLink
                      ? "resolved"
                      : frame.chainPhase === "activation" && link < chainLink
                        ? "queued"
                        : ""}
                >
                  CL{link}
                </i>
              ))}
            </div>
          </div>
        )}

        <div className="playmat">
          <ExtraMonsterRow frame={frame} />
          <StaticZone label="Field Zone" className="field-zone" />
          <FieldRow
            cards={frame.cards.filter((card) => card.zone === "F" && card.kind === "monster" && card.fieldSlot?.startsWith("M"))}
            label="Main Monster Zones"
            frame={frame}
            className="monster-zone"
            slotPrefix="M"
          />
          <Zone zone="G" label="GY" frame={frame} compact />
          <Zone zone="X" label="Extra Deck" frame={frame} stack compact />
          <FieldRow
            cards={frame.cards.filter((card) => card.zone === "F" && card.kind !== "monster")}
            label="Spell & Trap Zones"
            frame={frame}
            className="backrow-zone"
            slotPrefix="S"
            pendulumEdges
          />
          <Zone zone="D" label="Deck" frame={frame} stack compact />
          <div className="banished-zone"><Zone zone="B" label="Banished" frame={frame} compact /></div>
        </div>

        <div className="hand-zone">
          <span className="zone-caption">Hand · {frame.cards.filter((card) => card.zone === "H").length}</span>
          <div className="hand-cards">
            {frame.cards.filter((card) => card.zone === "H").map((card) => <DuelCard key={card.id} card={card} frame={frame} />)}
            {!frame.cards.some((card) => card.zone === "H") && <span className="empty-zone-label">Empty hand</span>}
          </div>
        </div>

        {showActionCallout && (
          <div className="action-callout">
            <span>{frame.movements.length > 0
              ? frame.movements.map((move) => `${move.alias} ${move.from}→${move.to}`).join(" · ")
              : "Effect window"}</span>
            <code>{frame.expression}</code>
          </div>
        )}
      </div>
      </InteractionContext.Provider>
    </CardScanContext.Provider>
  );
}

function FieldRow({
  cards,
  label,
  frame,
  className,
  slotPrefix,
  pendulumEdges = false,
}: {
  cards: VisualCard[];
  label: string;
  frame: PlaybackFrame;
  className: string;
  slotPrefix: "M" | "S";
  pendulumEdges?: boolean;
}) {
  const interaction = useContext(InteractionContext);
  const unplacedCards = cards.filter((card) => !card.fieldSlot);
  let nextUnplaced = 0;

  return (
    <div className={`field-row ${className}`}>
      <span className="zone-caption">{label}</span>
      <div className="field-slots">
        {Array.from({ length: 5 }, (_, index) => {
          const fieldSlot = `${slotPrefix}${index + 1}` as VisualFieldSlot;
          const exact = cards.find((candidate) => candidate.fieldSlot === fieldSlot);
          const card = exact ?? unplacedCards[nextUnplaced++];
          const choice = interaction?.slotChoices[fieldSlot];
          return (
            <div className={`field-slot ${choice ? "legal-target" : ""}`} key={fieldSlot}>
              <span className="field-slot-label">
                {fieldSlot}{pendulumEdges && (index === 0 || index === 4) ? <small>P</small> : null}
              </span>
              {card && <DuelCard card={card} frame={frame} />}
              {choice && <ChoiceHotspot choice={choice} kind="zone" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExtraMonsterRow({ frame }: { frame: PlaybackFrame }) {
  const interaction = useContext(InteractionContext);
  return (
    <div className="extra-monster-row">
      <span className="zone-caption">Shared Extra Monster Zones</span>
      <div className="extra-monster-slots">
        {(["EMZ1", "EMZ2"] as VisualFieldSlot[]).map((slot, index) => {
          const card = frame.cards.find((candidate) => candidate.zone === "F" && candidate.fieldSlot === slot);
          const choice = interaction?.slotChoices[slot];
          return (
            <div className={`field-slot emz-slot emz-${index + 1} ${choice ? "legal-target" : ""}`} key={slot}>
              <span className="field-slot-label">EMZ {index + 1}</span>
              {card && <DuelCard card={card} frame={frame} />}
              {choice && <ChoiceHotspot choice={choice} kind="zone" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaticZone({ label, className }: { label: string; className: string }) {
  return (
    <div className={`static-zone ${className}`}>
      <span className="zone-caption">{label}</span>
      <div className="static-zone-surface"><span>FIELD</span></div>
    </div>
  );
}

function Zone({
  zone,
  label,
  frame,
  compact = false,
  stack = false,
}: {
  zone: VisualZone;
  label: string;
  frame: PlaybackFrame;
  compact?: boolean;
  stack?: boolean;
}) {
  const cards = frame.cards.filter((card) => card.zone === zone);
  const visible = stack ? cards.slice(-1) : cards.slice(-2);
  return (
    <div className={`side-zone zone-${zone.toLowerCase()} ${compact ? "compact" : ""} ${stack ? "stack" : ""}`}>
      <span className="zone-caption">{label}{cards.length > 0 ? ` · ${cards.length}` : ""}</span>
      <div className="zone-card-stack">
        {visible.map((card) => <DuelCard key={card.id} card={card} frame={frame} faceDown={stack} />)}
        {visible.length === 0 && stack && <div className="card-back"><span>D/LN</span></div>}
        {visible.length === 0 && !stack && <span className="empty-zone-label">Empty</span>}
      </div>
    </div>
  );
}

function DuelCard({
  card,
  frame,
  faceDown = false,
}: {
  card: VisualCard;
  frame: PlaybackFrame;
  faceDown?: boolean;
}) {
  const scans = useContext(CardScanContext);
  const interaction = useContext(InteractionContext);
  const scan = scans[card.name];
  const [scanFailed, setScanFailed] = useState(false);
  const active = frame.activeAliases.includes(card.alias);
  const moving = frame.movements.some((movement) => movement.cardId === card.id);
  const hidden = faceDown || !card.faceUp;
  const showScan = !hidden && scan && !scanFailed;
  const choice = interaction?.cardChoices[card.id];

  useEffect(() => setScanFailed(false), [scan?.imageUrl]);

  return (
    <article
      className={`duel-card card-${card.kind} ${active ? "active" : ""} ${moving ? "moving" : ""} ${hidden ? "face-down" : ""} ${showScan ? "real-scan" : ""} ${choice ? "legal-target" : ""}`}
      style={{ viewTransitionName: `card-${card.id}` }}
      title={card.name}
    >
      {hidden ? (
        <div className="card-back"><span>D/LN</span></div>
      ) : showScan ? (
        <>
          <img
            src={scan.imageUrl}
            alt={card.name}
            loading={active ? "eager" : "lazy"}
            draggable={false}
            onError={() => setScanFailed(true)}
          />
          <span className="scan-alias">{card.alias}</span>
        </>
      ) : (
        <>
          <div className="card-name"><span>{card.name}</span>{card.level && <b>★{card.level}</b>}</div>
          <div className="card-art"><span>{card.alias.slice(0, 3)}</span></div>
          <div className="card-text"><b>{card.alias}</b><span>{card.kind}</span></div>
        </>
      )}
      {choice && <ChoiceHotspot choice={choice} kind="card" />}
    </article>
  );
}
