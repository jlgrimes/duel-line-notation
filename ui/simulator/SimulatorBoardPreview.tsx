import type { PlaybackFrame } from "../../src/visualizer.js";
import { DuelBoard } from "../DuelBoard";

const PURE_MITSURUGI_OPENING: PlaybackFrame = {
  key: "simulator-opening-preview",
  stepNumber: 0,
  label: "Pure Mitsurugi opening state",
  expression: "Choose a legal action to begin",
  lp: 8000,
  cards: [
    {
      id: "preview-aramasa",
      alias: "ARA",
      name: "Mitsurugi no Miko, Aramasa",
      kind: "monster",
      level: 4,
      zone: "H",
      faceUp: true,
    },
    {
      id: "preview-prayers",
      alias: "PRY",
      name: "Mitsurugi Prayers",
      kind: "spell",
      zone: "H",
      faceUp: true,
    },
    {
      id: "preview-habakiri",
      alias: "HAB",
      name: "Ame no Habakiri no Mitsurugi",
      kind: "monster",
      level: 4,
      zone: "H",
      faceUp: true,
    },
    {
      id: "preview-deck",
      alias: "DECK",
      name: "Pure Mitsurugi Deck",
      kind: "monster",
      zone: "D",
      faceUp: false,
    },
    {
      id: "preview-extra",
      alias: "EXTRA",
      name: "Extra Deck",
      kind: "monster",
      zone: "X",
      faceUp: false,
    },
  ],
  activeAliases: [],
  movements: [],
};

export function SimulatorBoardPreview() {
  return (
    <section className="simulator-board-preview" aria-labelledby="simulator-board-title">
      <header>
        <div>
          <p className="eyebrow">Milestone 03 · shared presentation</p>
          <h2 id="simulator-board-title">One board, two consumers</h2>
        </div>
        <p>
          Combo playback and the live simulator now render through the same zone and card component. This static
          opening state will be replaced by the first normalized ocgcore snapshot.
        </p>
      </header>
      <div className="duel-visualizer simulator-board-surface">
        <DuelBoard frame={PURE_MITSURUGI_OPENING} ariaLabel="Pure Mitsurugi simulator board preview" />
      </div>
    </section>
  );
}
