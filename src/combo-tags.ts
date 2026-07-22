export const COMBO_TAG_GROUPS = [
  { id: "timing", label: "When", tags: ["Turn 1", "Going Second", "Midgame"] },
  { id: "goal", label: "Goal", tags: ["Setup", "Disruption", "Board Breaker", "Finisher", "Grind Game", "Recovery"] },
  { id: "commitment", label: "Start", tags: ["One-Card Starter", "Two-Card Combo", "3+ Card Combo"] },
  { id: "matchup", label: "Matchup", tags: ["Hard Counter"] },
] as const;

export type ComboTagGroup = (typeof COMBO_TAG_GROUPS)[number]["id"];
export type ComboTag = (typeof COMBO_TAG_GROUPS)[number]["tags"][number];

interface TaggableCombo {
  id: string;
  title: string;
  summary: string;
  handSize: number;
  guide?: {
    endBoard: string;
    tags: string[];
    turnPreference?: string;
    otkPotential?: boolean;
  };
}

const TAG_OVERRIDES: Record<string, ComboTag[]> = {
  "branded/aluber-fusion": ["Turn 1", "Setup", "Disruption"],
  "branded/nadir-virtuous-board": ["Turn 1", "Setup", "Disruption"],
  "doomz/change-fuwalos-power-patron": ["Turn 1", "Setup", "Disruption"],
  "doomz/terminus-power-patron": ["Turn 1", "Setup", "Disruption"],
  "dracotail/lukias-ketu-arthalion": ["Turn 1", "Setup", "Disruption"],
  "elfnote/tinia-setup": ["Turn 1", "Setup", "Disruption"],
  "kewl-tune/cue-rotary-rosewhip": ["Turn 1", "Setup", "Disruption"],
  "kewl-tune/cue-starter": ["Turn 1", "Setup"],
  "kewl-tune/reco-psy-frame-route": ["Turn 1", "Setup", "Disruption"],
  "light-and-darkness-ritual/black-chaos-mind-shuffle": ["Turn 1", "Setup", "Disruption"],
  "light-and-darkness-ritual/records-ritual": ["Turn 1", "Setup"],
  "mitsurugi/azamina-habakiri": ["Turn 1", "Setup", "Disruption"],
  "mitsurugi/prayers-habakiri": ["Turn 1", "Setup"],
  "sky-striker/raye-cycle": ["Going Second", "Grind Game"],
};

export function categorizeCombo(combo: TaggableCombo): ComboTag[] {
  const tags = new Set<ComboTag>(TAG_OVERRIDES[combo.id] ?? inferTags(combo));
  tags.add(combo.handSize <= 1 ? "One-Card Starter" : combo.handSize === 2 ? "Two-Card Combo" : "3+ Card Combo");
  return COMBO_TAG_GROUPS.flatMap((group) => group.tags.filter((tag) => tags.has(tag)));
}

export function groupForTag(tag: ComboTag): ComboTagGroup {
  return COMBO_TAG_GROUPS.find((group) => (group.tags as readonly string[]).includes(tag))!.id;
}

function inferTags(combo: TaggableCombo): ComboTag[] {
  const source = [combo.title, combo.summary, combo.guide?.endBoard, ...(combo.guide?.tags ?? []), combo.guide?.turnPreference]
    .filter(Boolean).join(" ").toLowerCase();
  const tags = new Set<ComboTag>();

  if (/going second/.test(combo.guide?.turnPreference?.toLowerCase() ?? "") || /going second|board break|battle|otk|lethal|direct.attack/.test(source) || combo.guide?.otkPotential) tags.add("Going Second");
  else if (/going first/.test(combo.guide?.turnPreference?.toLowerCase() ?? "") || /turn one|turn 1/.test(source)) tags.add("Turn 1");
  else if (/grind|resource loop|recovery|recover|rebuild|recursion/.test(source)) tags.add("Midgame");
  else tags.add("Turn 1");

  if (/setup|establish|end board|search|access|set |follow-up|follow up|starter|extension/.test(source)) tags.add("Setup");
  if (/disruption|interaction|interruption|negate|defense|control|widow anchor|varudras|hieratic seal/.test(source)) tags.add("Disruption");
  if (/board break|board clear|cleared|destroy opponent|remove opponent/.test(source)) tags.add("Board Breaker");
  if (/otk|lethal|battle push|direct.attack|finisher/.test(source) || combo.guide?.otkPotential) tags.add("Finisher");
  if (/grind|resource|recursion|rebuild|long.game|reusable|follow-up|follow up/.test(source)) tags.add("Grind Game");
  if (/recover|recycle|revive|return.+hand|return.+deck/.test(source)) tags.add("Recovery");
  if (/hard counter|floodgate|shut(?:s)? down|cannot activate|cannot summon/.test(source)) tags.add("Hard Counter");

  if (![...tags].some((tag) => groupForTag(tag) === "goal")) tags.add("Setup");
  return [...tags];
}
