/**
 * Maps an engine prompt onto the board, so legal choices can be made by tapping the real
 * card or zone instead of only through a list of buttons.
 *
 * This is deliberately free of React and CSS: the interface decides how a target looks,
 * but what is legal — and what each target means — comes from the engine alone.
 */

import type { EngineActionPrompt } from "./engine-protocol.js";
import type { VisualFieldSlot } from "../visualizer.js";

export interface BoardChoice {
  optionId: string;
  label: string;
  detail: string | null;
}

export interface BoardTargets {
  /** Legal destination zones, keyed by the slot the board draws. */
  slotChoices: Partial<Record<VisualFieldSlot, BoardChoice>>;
  /** Legal actions, keyed by the card instance id they belong to. */
  cardChoices: Record<string, BoardChoice>;
}

/**
 * Returns the board targets for a prompt, or `null` when nothing in it can be pointed at.
 *
 * Options the engine did not anchor — a battle position is a property of a summon, not a
 * place on the board — are skipped here and must still be offered as labelled options.
 */
export function boardTargetsFor(prompt: EngineActionPrompt | null): BoardTargets | null {
  if (!prompt) return null;
  const slotChoices: BoardTargets["slotChoices"] = {};
  const cardChoices: BoardTargets["cardChoices"] = {};

  for (const option of prompt.options) {
    if (!option.target) continue;
    const choice: BoardChoice = { optionId: option.id, label: option.label, detail: option.detail };
    if (option.target.kind === "field-slot") slotChoices[option.target.fieldSlot] = choice;
    else cardChoices[option.target.cardId] = choice;
  }

  const anchored = Object.keys(slotChoices).length + Object.keys(cardChoices).length;
  return anchored === 0 ? null : { slotChoices, cardChoices };
}

/** Whether every option in a prompt can be reached on the board. */
export function isFullyAnchored(prompt: EngineActionPrompt | null): boolean {
  return prompt !== null
    && prompt.options.length > 0
    && prompt.options.every((option) => option.target !== null);
}
