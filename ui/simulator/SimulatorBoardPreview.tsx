import type { DeckManifest } from "../../src/model.js";
import type { PlaybackFrame } from "../../src/visualizer.js";
import { DuelBoard } from "../DuelBoard";
import { useCardScans } from "../card-service";
import "./SimulatorBoardPreview.css";

const PURE_MITSURUGI_MANIFEST: DeckManifest = {
  schemaVersion: 1,
  slug: "pure-mitsurugi-simulator-preview",
  name: "Pure Mitsurugi simulator preview",
  cards: {
    ARA: { name: "Mitsurugi no Miko, Aramasa", kind: "monster", level: 4 },
    PRY: { name: "Mitsurugi Prayers", kind: "spell" },
    HAB: { name: "Ame no Habakiri no Mitsurugi", kind: "monster", level: 4 },
  },
};

export function SimulatorBoardPreview({ frame }: { frame: PlaybackFrame | null }) {
  const { scans, loading } = useCardScans(PURE_MITSURUGI_MANIFEST);

  return (
    <section className="simulator-board-preview" aria-labelledby="simulator-board-title">
      <header>
        <div>
          <p className="eyebrow">Milestone 05 · decoder boundary</p>
          <h2 id="simulator-board-title">Decoded engine board</h2>
        </div>
        <p>
          The real core is running, but React will not invent a board while card records and field-query decoding are still
          absent. This surface will render only state projected from ocgcore through the shared snapshot model.
        </p>
      </header>
      {frame ? (
        <>
          <div className="duel-visualizer simulator-board-surface">
            <DuelBoard frame={frame} scans={scans} ariaLabel="Pure Mitsurugi decoded engine board" />
          </div>
          <p className={`scan-credit ${loading ? "loading" : ""}`}>
            <i /> {loading ? "Resolving card scans…" : `${Object.keys(scans).length} real card scans loaded`} · Data and
            images via <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck</a>
          </p>
        </>
      ) : (
        <div className="simulator-note">
          Real ocgcore is ready. Waiting for the card database, Lua resolver, and field-query decoder before publishing a board snapshot.
        </div>
      )}
    </section>
  );
}
