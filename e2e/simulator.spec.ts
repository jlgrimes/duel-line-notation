/**
 * Browser coverage for the Simulator choice flow.
 *
 * These tests run the real published `ocgcore` WebAssembly in a real Web Worker and
 * resolve choices the way a player does — by tapping the board. Nothing here reaches
 * into engine internals; if a test passes, the flow works through the shipping UI.
 *
 * Network note: `vite preview` serves static files only, so the `/api/*` serverless
 * routes 404 and card scans fall back to generated art. That is the preview environment,
 * not a regression, so only uncaught page errors fail a test.
 */

import { expect, test, type Page } from "@playwright/test";

const SIMULATOR = "/#/simulator";
const ZONES = [1, 2, 3, 4, 5] as const;

/** Fails the test on an uncaught exception, which no amount of 404s should produce. */
function failOnPageErrors(page: Page): string[] {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return pageErrors;
}

async function openReadySimulator(page: Page): Promise<string[]> {
  const pageErrors = failOnPageErrors(page);
  await page.goto(SIMULATOR);
  await expect(page.locator(".simulator-status-ready")).toBeVisible({ timeout: 40_000 });
  return pageErrors;
}

const summonAction = (page: Page) => page.getByRole("button", { name: /^Normal Summon/ });
const zoneChoice = (page: Page, zone: number) => page.getByRole("button", { name: new RegExp(`^M${zone}\\.`) });
const monsterZone = (page: Page, zone: number) => page.locator(".monster-zone .field-slot").nth(zone - 1);

test("the simulator boots the real core and reports engine state", async ({ page }) => {
  const pageErrors = await openReadySimulator(page);

  await expect(page.locator(".simulator-status strong")).toHaveText("Choose an action");

  const facts = page.locator(".engine-facts");
  await expect(facts).toContainText("Turn 1 · Main Phase 1");
  await expect(facts).toContainText("8,000 · 8,000");
  await expect(facts).toContainText("No Chain");
  // The API version proves this is the real pinned core, not a stub.
  await expect(facts).toContainText("11.0");

  await expect(page.locator(".hand-cards .duel-card")).toHaveCount(1);
  await expect(page.locator(".monster-zone .duel-card")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("the opening action is offered on the card, not as a separate button", async ({ page }) => {
  await openReadySimulator(page);

  // The card in hand is highlighted and carries the action itself.
  await expect(page.locator(".hand-cards .duel-card.legal-target")).toHaveCount(1);
  await expect(summonAction(page)).toBeVisible();
  await expect(summonAction(page)).toHaveAccessibleName(/Normal Summon Mystical Elf/);

  // With every option anchored, the duplicate button list is gone.
  await expect(page.locator(".choice-options button")).toHaveCount(0);
  await expect(page.locator(".choice-on-board")).toContainText("tap the card");
});

test("choosing the action highlights exactly the zones the engine allows", async ({ page }) => {
  await openReadySimulator(page);
  await summonAction(page).click();

  await expect(page.locator(".simulator-status strong")).toHaveText("Choose a monster zone");
  await expect(page.locator(".monster-zone .field-slot.legal-target")).toHaveCount(5);
  // Spell & Trap zones are not legal destinations for a Normal Summon.
  await expect(page.locator(".backrow-zone .field-slot.legal-target")).toHaveCount(0);
  await expect(page.locator(".extra-monster-slots .field-slot.legal-target")).toHaveCount(0);
  await expect(page.locator(".choice-options button")).toHaveCount(0);
  await expect(page.locator(".choice-on-board")).toContainText("tap the zone");
});

/**
 * Closes the manual check that every zone renders the card where it was asked to go.
 * A hard-coded destination, or an off-by-one in the sequence mapping, fails here.
 */
for (const zone of ZONES) {
  test(`tapping M${zone} summons the card into M${zone}`, async ({ page }) => {
    const pageErrors = await openReadySimulator(page);

    await summonAction(page).click();
    await expect(zoneChoice(page, zone)).toBeVisible();
    await zoneChoice(page, zone).click();

    // The card is in the chosen zone, and in no other.
    await expect(monsterZone(page, zone).locator(".duel-card")).toHaveCount(1);
    await expect(page.locator(".monster-zone .duel-card")).toHaveCount(1);
    await expect(monsterZone(page, zone).locator(".duel-card")).toHaveAttribute("title", "Mystical Elf");

    // The hand emptied and the board says so.
    await expect(page.locator(".hand-cards .duel-card")).toHaveCount(0);
    await expect(page.locator(".hand-zone .zone-caption")).toHaveText("Hand · 0");

    // The movement is the engine-observed one, named with the zone that was chosen.
    await expect(page.locator(".action-callout")).toContainText(`Monster Zone M${zone}`);
    await expect(page.locator(".action-callout")).toContainText("ELF H→F");

    await expect(page.locator(".simulator-status-error")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
}

test("no choice remains offered once the summon resolves", async ({ page }) => {
  await openReadySimulator(page);
  await summonAction(page).click();
  await zoneChoice(page, 3).click();
  await expect(page.locator(".monster-zone .duel-card")).toHaveCount(1);

  // Nothing on the board stays armed after the prompt is answered.
  await expect(page.locator(".legal-target")).toHaveCount(0);
  await expect(page.locator(".choice-hotspot")).toHaveCount(0);
  await expect(page.locator(".simulator-choice-resolver")).toContainText("Waiting for ocgcore");
});

test("restarting the engine returns a fresh opening hand", async ({ page }) => {
  await openReadySimulator(page);
  await summonAction(page).click();
  await zoneChoice(page, 2).click();
  await expect(page.locator(".monster-zone .duel-card")).toHaveCount(1);

  await page.getByRole("button", { name: "Restart engine" }).click();

  await expect(page.locator(".hand-cards .duel-card")).toHaveCount(1, { timeout: 40_000 });
  await expect(page.locator(".monster-zone .duel-card")).toHaveCount(0);
  await expect(summonAction(page)).toBeVisible();
  await expect(page.locator(".engine-facts")).toContainText("Turn 1 · Main Phase 1");
});
