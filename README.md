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

## Interactive combo catalog

The Vite-powered React app opens on a searchable catalog. Each catalog card leads to a nested combo detail screen and defaults to a visual view. The six local DLN routes expose Visual, Notation, and Trace modes. Imported community routes expose a scan-backed Visual player and their structured Steps without pretending that prose is executable DLN.

Combo content is not bundled into the React application. `GET /api/combos` returns lightweight shelf metadata, while `GET /api/combos?id=<deck>/<line>` returns one route on demand. The API reads Neon Postgres when `DATABASE_URL` is present and uses the repository's `decks/` files as a server-side fallback, so deployments remain usable before a database is provisioned.

### Database setup

Vercel Postgres has been retired. For a new deployment, install the free Neon integration from the Vercel Marketplace and connect it to this project. Vercel will inject `DATABASE_URL` and initialize the schema on the next deployment. For a manual local setup after pulling that environment variable, run:

```sh
npm run db:setup
```

The idempotent setup command applies `db/schema.sql`, upserts every local `.dln` route, and imports the current structured Markdown snapshot from [Open Combo Codex](https://github.com/Siebe-Uy/Open-Combo-Codex) at a pinned Git commit. The present snapshot adds 26 MIT-licensed guides across six engines to the six local DLN routes. If the upstream import is temporarily unavailable, existing database guides are preserved. Vercel runs the same setup automatically during deployments when a database is connected. API responses are CDN cached, and database credentials are only read inside Vercel Functions.

The **Visual** view turns the parsed document into a playable sequence. It includes:

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
3. The React client keeps resolved scans in memory for the current session; durable caching remains at the CDN layer.

The client does not use `localStorage` or `sessionStorage`. Catalog navigation, view selection, loading state, and notation drafts live in a reducer-backed React store. Draft edits are session-only, while Visual mode always plays the canonical database route.

This makes real scans automatic for new manifest entries while keeping the UI functional when the provider is unavailable. Token and unresolved cards retain the generated fallback design. Run the full app with `vercel dev` when testing the catalog and Functions locally; plain `npm run dev` only runs the Vite UI shell.

Card data and images are provided by [YGOPRODeck](https://ygoprodeck.com/api-guide/). Yu-Gi-Oh! card images and related graphical information belong to their respective rights holders.

```sh
npm run dev
npm run build:web
```

The current July 2026 snapshot includes Kewl Tune, Branded, Light and Darkness Ritual, Elfnote, Mitsurugi, and Sky Striker. Tournament shares and source links live in `decks/meta.json` so the snapshot can be updated without rewriting the interface.

## Combo Library and provenance

The top-level combo catalog makes DLN a library rather than an isolated editor. Larger external combo websites remain compact discovery links below the playable catalog. The source registry lives in `decks/sources.json`, so another source can be added without changing the React component.

The current local routes are **DLN-authored reference fixtures**, not claimed transcriptions of the pages linked beside them. They remain marked “Needs replay check” until every action is compared with an attributable source. External entries also record their reuse status:

- YgoCombo is indexed as a replay-derived source, but its combo steps are not copied because no public reuse license was found.
- Open Combo Codex routes are imported with contributor, source revision, and MIT license attribution. They remain typed as community guides until translated and validated as DLN.
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
