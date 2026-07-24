import type { DeckManifest } from "../../src/model.js";
import type { PlaybackFrame } from "../../src/visualizer.js";
import { DuelBoard } from "../DuelBoard";
import { useCardScans } from "../card-service";
import "./SimulatorBoardPreview.css";

const OCGCORE_BOOTSTRAP_MANIFEST: DeckManifest = {
  schemaVersion: 1,
  slug: "ocgcore-bootstrap-simulator",
  name: "ocgcore bootstrap simulator",
  cards: {
    ELF: { name: "Mystical Elf", kind: "monster", level: 4 },
  },
};

export function SimulatorBoardPreview({ frame }: { frame: PlaybackFrame | null }) {
  const { scans, loading } = useCardScans(OCGCORE_BOOTSTRAP_MANIFEST);

  return (
    <section className="simulator-board-preview" aria-labelledby="simulator-board-title">
      <header>
        <div>
          <p className="eyebrow">Milestone 06 · queried core state</p>
          <h2 id="simulator-board-title">Decoded engine board</h2>
        </div>
        <p>
          Every visible card and movement on this board now comes from ocgcore card queries and processed engine responses,
          translated into the shared immutable PlaybackFrame model.
        </p>
      </header>
      {frame ? (
        <>
          <div className="duel-visualizer simulator-board-surface">
            <DuelBoard frame={frame} scans={scans} ariaLabel="Decoded ocgcore duel board" />
          </div>
          <p className={`scan-credit ${loading ? "loading" : ""}`}>
            <i /> {loading ? "Resolving card scan…" : `${Object.keys(scans).length} real card scan loaded`} · Data and
            images via <a href="https://ygoprodeck.com/api-guide/" target="_blank" rel="noreferrer">YGOPRODeck</a>
          </p>
        </>
      ) : (
        <div className="simulator-note">
          Loading the real duel, drawing the bootstrap card, and querying the first engine-owned frame.
        </div>
      )}
    </section>
  );
}
