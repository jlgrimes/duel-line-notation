# @dln/carddata

Builds card bundles for the simulator: the `ocgcore`-shaped card records and the Lua scripts
for a declared set of cards.

```sh
npm run carddata:fetch          # check out the pinned database and script revisions
npm run carddata:build          # build every deck under decks/
npm run carddata:build mitsurugi
```

`carddata.lock.json` pins the exact upstream revisions. `fetch` checks them out beneath
`vendor/`, which is ignored by git, exactly like the pinned core source in
`packages/ocgcore`. Bundles are written to `dist/`, also ignored.

## Licensing — read before distributing a bundle

**No third-party card data or scripts are committed to this repository, and that is
deliberate.** Everything this package consumes is downloaded on demand from pinned
revisions. The question of whether a built bundle may be *shipped to browsers* is not
settled here, because it is not a purely technical decision.

| Source | What it is | License |
| --- | --- | --- |
| [ProjectIgnis/CardScripts](https://github.com/ProjectIgnis/CardScripts) | the Lua card scripts | **AGPL-3.0-or-later** |
| [ProjectIgnis/BabelCDB](https://github.com/ProjectIgnis/BabelCDB) | the card database | **no license file** |
| [edo9300/ygopro-core](https://github.com/edo9300/ygopro-core) | the duel engine | **AGPL-3.0-or-later** |
| this repository | notation, catalog, app | MIT |

Three things follow, and they need a decision rather than a default:

1. **The scripts are AGPL.** Serving them to browsers is conveying them. That is allowed,
   but it carries AGPL obligations, and how far those reach into an MIT-licensed
   application that loads them is a judgement call about where the boundary between
   aggregation and derivation sits.
2. **The card database has no license file at all**, so there is no explicit grant to
   redistribute it. The individual card facts are largely not copyrightable, but the
   compiled database is a different question from the facts inside it.
3. **This is not new.** `public/ocgcore/ocgcore.wasm` is already committed and served, and
   it is compiled from an AGPL engine. Bundling scripts widens the exposure; it does not
   create it. Worth resolving before the broader publication the checklist anticipates.

Until that is decided, this package builds bundles locally and commits nothing.

## Where the shapes come from

The database packs several fields into columns that do not match `OCG_CardData`, and the
build unpacks them. These conventions were confirmed against known cards rather than
assumed, and `test/card-bundle.test.ts` pins them:

- `setcode` holds up to four 16-bit archetype codes in one integer.
- `level` carries the level in its low byte, the right Pendulum scale in bits 16–23, and the
  left scale in bits 24–31.
- Link monsters keep their marker mask in `def`; their Defence is not a real value.
- `race` does not fit in 32 bits (`RACE_YOKAI` is `0x4000000000000000`), so it travels as a
  decimal string and is split when it reaches the bridge.

## Scripts are not just the card scripts

A bundle carries the whole shared library layer — every `.lua` at the root of the script
collection — not only the per-card files. `constant.lua` and `utility.lua` pull in counter
constants, archetype set codes, and the summon procedure libraries, and a card script that
reaches a missing one fails at run time. The host loads those two entry scripts after
creating a duel; the core resolves everything else on demand.

One `MISS proc_unofficial.lua` per duel is expected: the collection probes for optional
libraries it does not ship.

## Verifying a bundle

`npm run ocgcore:native-check -- packages/carddata/dist/mitsurugi.native` registers the real
records and scripts, starts a duel, and checks that every card script compiled and ran with
no Lua errors — using an ordinary C++ compiler, with no Emscripten and no browser. The build
writes that flat fixture next to the JSON bundle for exactly this purpose.
