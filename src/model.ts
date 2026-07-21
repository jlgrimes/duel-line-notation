export const ZONES = ["H", "D", "F", "G", "B", "X"] as const;
export type Zone = (typeof ZONES)[number];

export interface CardDefinition {
  name: string;
  kind: "monster" | "spell" | "trap" | "token";
  level?: number;
  notes?: string;
}

export interface DeckManifest {
  schemaVersion: 1;
  slug: string;
  name: string;
  format?: string;
  cards: Record<string, CardDefinition>;
}

export interface ActionStep {
  kind: "action";
  number: number;
  expression: string;
  line: number;
}

export interface ChainLink {
  number: number;
  expression: string;
  line: number;
}

export interface ChainStep {
  kind: "chain";
  number: number;
  links: ChainLink[];
  line: number;
}

export type Step = ActionStep | ChainStep;

export interface LineDocument {
  deck: string;
  name: string;
  start: string;
  end: string;
  steps: Step[];
  source: string;
}

export interface Diagnostic {
  source: string;
  line?: number;
  message: string;
}
