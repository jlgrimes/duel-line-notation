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
          <p className="eyebrow">Milestone 04 · engine-owned state</p>
          <h2 id="simulator-board-title">Engine snapshot board</h2>
        </div>
        <p>
          The simulator UI no longer constructs its own opening frame. The worker runtime now supplies normalized duel
          state through the typed engine snapshot—the same seam the real ocgcore decoder will use.
        </p>
      </header>
      {frame ? (
        <div className="duel-visualizer simulator-board-surface">
          <DuelBoard frame={frame} scans={scans} ariaLabel="Pure Mitsurugi engine snapshot board" />
        </div>
      ) : (
        <div className="simulator-note">Waiting for the engine to publish its first duel snapshot…</div>
      )}
      <p className={`scan-credit ${loading ? "loading" : ""}`}>
        <i /> {loading ? "Resolving card scans…" : `${Object.keys(scans).length} real card scans loaded`} · Data and
        images via <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck</a>
      </p>
    </section>
  );
}
