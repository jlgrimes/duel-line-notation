# Duel Line Notation

**DLN** is a compact, machine-checkable notation for documenting Yu-Gi-Oh! combo lines.

Players already write things like `NS Aluber, add BraFu`. DLN adds the information that prose usually loses: starting state, zones, costs versus resolution, Chain order, triggers, materials, restrictions, and ending state.

```dln
@deck mitsurugi
@line prayers-habakiri
@start LP=8000; H=[PRY,HAB]

1 PRY [TR HAB:H>G] => ADD ARA:D>H; DMG 800; SS ARA:H>F
2 CHAIN {
  CL1 HAB#T => ADD RIT:D>H
  CL2 ARA#S => ADD MUR:D>H
}
3 RIT#2 => RS MUR:H>F [TR KUS:D>G; TR NSS:D>G]
4 CHAIN {
  CL1 KUS#T => REC RIT:G>H
  CL2 NSS#G => SS NSS:G>F
}

@end LP=7200; H=[RIT]; F=[MUR@8,ARA@4,NSS@4]; G=[PRY,HAB,KUS]
```

## What exists today

- A draft v0.1 language specification
- A TypeScript parser and semantic validator
- A responsive React Line Lab with live parsing, validation, and animated playback
- A searchable registry of combo websites, open datasets, and local DLN routes
- A CLI that checks `.dln` files against their deck manifests
- A fully annotated Mitsurugi starter line
- Tests and GitHub Actions CI
- A directory convention intended to make adding decks uncomplicated

This is deliberately an early, opinionated foundation. The notation should evolve from real deck lines rather than attempt to encode every possible card interaction up front.

## Install and run

Requires Node.js 20 or newer.

```sh
npm install
npm run check
npm test
npm run dev
```

Check a particular deck or line:

```sh
npm run build
node dist/src/cli.js check decks/mitsurugi
node dist/src/cli.js check decks/mitsurugi/lines/prayers-habakiri.dln
```

## Add a deck

1. Copy `decks/_template` to `decks/<deck-slug>`.
2. Define the deck-local card aliases in `deck.json`.
3. Add `.dln` files beneath `lines/`.
4. Run `npm run check`.

Aliases are local namespaces, not part of the language. `MUR` can mean Ame no Murakumo inside the Mitsurugi deck without consuming that alias globally.

## Interactive Line Lab

The Vite-powered React app loads the current TCG Advanced fixtures directly from `decks/`. Select a deck, edit its notation, and inspect the parsed execution trace, Chain resolution order, diagnostics, and alias dictionary in real time.

The **Duel View** tab turns the same parsed document into a playable visual sequence. It includes:

- Play, pause, step, replay, timeline scrubbing, and playback speed controls
- Animated card movement between the hand, field, Deck, Extra Deck, GY, and banishment
- Reverse-order Chain Link resolution and LP changes
- An official-topology player field: five Main Monster Zones above five Spell & Trap Zones, two shared Extra Monster Zones, and a separate Field Zone
- Numbered M1–M5 and S1–S5 placement, including Extra Monster Zone placement for Link Summons from the Extra Deck
- Responsive desktop and mobile playmats
- Reduced-motion support

Playback is notation-driven rather than hand-authored per deck. Write every observable movement as `ALIAS:FROM>TO`; the visualizer will pick it up automatically. Anonymous operations such as `DRAW D>H` and `BAN D>B` render a hidden placeholder card.

### Real card scans

Duel View resolves manifest card names through the YGOPRODeck v7 API. It does not hotlink their image server:

1. `/api/cards` batches exact-name metadata lookups and caches responses on Vercel's CDN.
2. `/api/card-image` validates each image ID, fetches the scan server-side, and re-serves it through the app's domain with a one-year CDN cache.
3. The browser keeps the name-to-image mapping in local storage for 30 days.

This makes real scans automatic for new manifest entries while keeping the UI functional when the provider is unavailable. Token and unresolved cards retain the generated fallback design. Run the app with `vercel dev` when testing the Functions locally; plain `npm run dev` runs the Vite UI with graceful image fallbacks.

Card data and images are provided by [YGOPRODeck](https://ygoprodeck.com/api-guide/). Yu-Gi-Oh! card images and related graphical information belong to their respective rights holders.

```sh
npm run dev
npm run build:web
```

The current July 2026 snapshot includes Kewl Tune, Branded, Light and Darkness Ritual, Elfnote, Mitsurugi, and Sky Striker. Tournament shares and source links live in `decks/meta.json` so the snapshot can be updated without rewriting the interface.

## Combo Library and provenance

The **Combo Library** tab makes DLN a catalog rather than an isolated editor. It searches the playable routes in this repository alongside larger external combo websites and datasets. The registry lives in `decks/sources.json`, so another source can be added without changing the React component.

The current local routes are **DLN-authored reference fixtures**, not claimed transcriptions of the pages linked beside them. They remain marked “Needs replay check” until every action is compared with an attributable source. External entries also record their reuse status:

- YgoCombo is indexed as a replay-derived source, but its combo steps are not copied because no public reuse license was found.
- Open Combo Codex is flagged as import-ready because it publishes structured Markdown under an MIT license.
- Community builders and deck databases remain discovery or supporting sources until an individual route has sufficient provenance.

The publication path is: discover → cite → transcribe → validate → replay-check → publish. This keeps “available elsewhere,” “imported into DLN,” and “verified” as separate, visible states.

## Design principles

1. **Readable aloud.** A player should be able to translate a line without a compiler.
2. **State is explicit.** A line declares its relevant input and output.
3. **Costs are not effects.** Costs use brackets before `=>`; resolved operations follow it.
4. **Chains are stacks.** Chain Links are written in activation order and resolve in reverse.
5. **Card text remains authoritative.** DLN references effects; it does not replace PSCT or rulings.
6. **Progressive precision.** Common lines stay short, while annotations can capture restrictions and unusual legality facts.

See [SPEC.md](SPEC.md) for the draft grammar and [CONTRIBUTING.md](CONTRIBUTING.md) for extension guidance.

## Status

DLN is experimental and is not affiliated with or endorsed by Konami. Yu-Gi-Oh! card names and game terminology belong to their respective owners.
