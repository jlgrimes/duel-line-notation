import type { DeckManifest } from "./model.js";
import type { ComboTag } from "./combo-tags.js";

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
  contentType: "dln" | "guide";
  difficulty?: string;
  sourceLicense?: string;
  tags: ComboTag[];
}

export interface ComboDetail extends ComboSummary {
  manifest: DeckManifest;
  line?: string;
  guide?: ComboGuide;
}

export interface ComboGuide {
  contributor: string;
  starterCards: string[];
  cardNames: string[];
  prerequisites: string[];
  steps: string[];
  notes: string[];
  endBoard: string;
  variants: string[];
  tags: string[];
  turnPreference?: string;
  otkPotential?: boolean;
}

export interface ComboListResponse {
  combos: ComboSummary[];
  backend: "database" | "file-fallback";
}

export interface ComboDetailResponse {
  combo: ComboDetail;
  backend: "database" | "file-fallback";
}
