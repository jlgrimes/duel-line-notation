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
          <p className="eyebrow">Milestone 08 · generic engine snapshots</p>
          <h2 id="simulator-board-title">Decoded engine board</h2>
        </div>
        <p>
          Every player, location, and occupied sequence is queried from ocgcore and normalized into one immutable state.
          This board is that state projected for you; the movements below it are diffed from consecutive snapshots rather
          than declared by the interface.
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
