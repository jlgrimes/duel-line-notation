import type { DeckManifest } from "./model.js";

export interface ComboSummary {
  id: string;
  deckSlug: string;
  lineSlug: string;
  deckName: string;
  title: string;
  summary: string;
  summon: string;
  accent: string;
  format: string;
  sourceLabel: string;
  sourceUrl: string;
  representativeCardName: string;
  handSize: number;
  stepCount: number;
}

export interface ComboDetail extends ComboSummary {
  manifest: DeckManifest;
  line: string;
}

export interface ComboListResponse {
  combos: ComboSummary[];
  backend: "database" | "file-fallback";
}

export interface ComboDetailResponse {
  combo: ComboDetail;
  backend: "database" | "file-fallback";
}
