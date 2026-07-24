# Duel Line Notation — Project Checklist

_Last updated: July 24, 2026_

This file is the working implementation checklist for DLN. It tracks the notation platform, combo library, visualizer, real `ocgcore` simulator, and the longer-term analysis/discovery goals.

## Status rules

- `[x]` means implemented in `main`.
- **CI verified** means an automated build or smoke test has exercised the behavior.
- **Manual verification pending** means the code and deployment passed, but the latest browser/mobile interaction has not yet been confirmed by a person.
- `[ ]` means the work is still required; it is not implied by adjacent completed items.

## Current checkpoint

The project now has two substantial layers:

1. A notation, catalog, database, and animated playback product.
2. A real Project Ignis `ocgcore` WebAssembly runtime running in a Web Worker and producing immutable UI snapshots.

The current simulator vertical slice is intentionally tiny but real:

- A deterministic duel is created with one Mystical Elf in each deck.
- Player 0 draws Mystical Elf.
- `ocgcore` emits a real idle-command prompt.
- The UI offers the real Normal Summon action.
- The UI then exposes the engine's mandatory monster-zone choice.
- The chosen response is written back to `ocgcore`.
- The card leaves the hand and appears in the selected monster zone according to engine field queries.

The **duel content** is still that one card, but the **state layer underneath it is no longer
bootstrap-specific**. Every snapshot now queries both players, every supported location, and every
occupied sequence, decodes the full card record, and normalizes the result into one immutable
`EngineFieldState`. The board the visualizer renders is a projection of that state for one viewer,
and its movements are diffed from consecutive snapshots rather than declared by the interface.
Adding real cards is now a card-data problem, not a snapshot-plumbing problem.

**Automated status:** the WebAssembly build, smoke test, and Vercel deployment are green. `npm run ci`
additionally drives the shipping runtime against the published core in Node, and the packet, card, and
field decoders are covered by golden buffers captured from the pinned core.

Choices are now made **on the board**. The engine names the card or zone each legal option belongs to,
the interface highlights exactly those targets, and the button list below the field appears only for
options that have no place to point at.

**Manual status:** desktop is confirmed. iPhone/mobile Safari still needs a real tap-through; a Chromium
phone viewport passes but is not the same browser.

---

# 1. DLN language and validation foundation

## Completed

- [x] Define the initial DLN v0.1 language direction.
- [x] Represent starting state, ending state, zones, costs, resolution, Chains, materials, restrictions, and observable movements.
- [x] Implement the TypeScript parser.
- [x] Implement semantic validation.
- [x] Implement deck-local card aliases through deck manifests.
- [x] Implement the CLI for checking a deck directory or individual `.dln` file.
- [x] Add parser and validator tests.
- [x] Add repository CI for checks, tests, and web builds.
- [x] Add a fully annotated Mitsurugi reference line.
- [x] Establish a reusable `decks/<slug>` directory convention.
- [x] Keep card text and rulings authoritative instead of attempting to replace PSCT.

## Still required

- [ ] Expand the grammar only from verified real-world lines rather than speculative syntax.
- [ ] Add formal syntax for additional selection types when real engine integration proves they are needed.
- [ ] Add richer legality annotations for once-per-turn, hard once-per-turn, lingering restrictions, summon locks, and replacement effects.
- [ ] Add first-class support for optional triggers, simultaneous triggers, missed timing, and player ordering decisions.
- [ ] Add first-class support for continuous effects and state-dependent modifiers.
- [ ] Add first-class support for hidden-information uncertainty.
- [ ] Version the language explicitly when breaking grammar changes become necessary.
- [ ] Add migration tooling for older DLN documents.
- [ ] Add a formatter/prettifier with stable output.
- [ ] Add editor diagnostics with exact source ranges and suggested fixes.

---

# 2. Combo library, data, and provenance

## Completed

- [x] Build a searchable top-level combo catalog.
- [x] Add nested combo detail routes.
- [x] Default combo detail pages to the visual board view.
- [x] Provide Visual, Notation, Trace, and imported-source views where appropriate.
- [x] Keep combo content outside the React bundle.
- [x] Add `GET /api/combos` for lightweight catalog metadata.
- [x] Add `GET /api/combos?id=<deck>/<line>` for individual routes.
- [x] Add Neon Postgres support through `DATABASE_URL`.
- [x] Preserve repository-file fallback behavior when a database is unavailable.
- [x] Add an idempotent database setup/import command.
- [x] Import a pinned, licensed Open Combo Codex snapshot.
- [x] Track contributor, source revision, and reuse/license status for imported material.
- [x] Separate discovery, transcription, validation, replay checking, and publication states.
- [x] Add a source registry for combo sites and datasets.
- [x] Add current meta/deck snapshot metadata without hard-coding it into the interface.
- [x] Add tags/categories to make combo discovery easier.

## Still required

- [ ] Audit every local DLN fixture against an attributable replay, official card text, or reproducible engine line.
- [ ] Remove “Needs replay check” only after exact verification.
- [ ] Translate licensed community guides into executable DLN instead of treating prose as executable state.
- [ ] Add duplicate-line detection across local and imported sources.
- [ ] Add combo lineage/version history when a line changes after a banlist or rules update.
- [ ] Add deck-version metadata: format, banlist date, card-pool region, and platform.
- [ ] Add confidence and verification filters to catalog search.
- [ ] Add structured end-board and interaction metadata.
- [ ] Add starter requirements, brick requirements, and probability metadata.
- [ ] Add “dies to” and “plays through” interaction tags backed by verified lines.
- [ ] Add community contribution and moderation workflows.
- [ ] Add automated source-link health checks.

---

# 3. React application and visualizer

## Completed

- [x] Build a responsive React application.
- [x] Build the Line Lab with live parsing and validation.
- [x] Build notation-driven animated playback.
- [x] Add play, pause, step, replay, timeline scrubbing, and playback speed controls.
- [x] Animate card movement among hand, field, Deck, Extra Deck, GY, and banishment.
- [x] Render Chain building and reverse-order Chain resolution.
- [x] Render LP changes.
- [x] Build an official-topology player field with five Main Monster Zones and five Spell & Trap Zones.
- [x] Add shared Extra Monster Zones and a separate Field Zone.
- [x] Add numbered M1–M5 and S1–S5 placement.
- [x] Support Extra Monster Zone placement for relevant Extra Deck summons.
- [x] Add desktop and mobile layouts.
- [x] Add reduced-motion support.
- [x] Resolve real card scans through server-side YGOPRODeck APIs and CDN caching.
- [x] Preserve generated fallback cards when scans are unavailable.
- [x] Replace browser storage with reducer-backed React state.
- [x] Redesign catalog cards into a left-card/right-description layout.
- [x] Improve mobile typography and multi-line effect windows.
- [x] Fix earlier visualizer layout issues around banished and shared Extra Monster Zones.

## Still required

- [ ] Reconcile all visualizer assumptions with actual engine snapshots.
- [ ] Support both players' complete fields and hands where information is public.
- [ ] Render facedown and unknown cards without leaking hidden information.
- [ ] Render overlays/Xyz materials.
- [ ] Render equip relationships and targets.
- [ ] Render Pendulum scales and Pendulum Zone behavior from engine state.
- [ ] Render counters, tokens, temporary control changes, and card orientation.
- [ ] Render continuous restrictions and lingering effects in a readable way.
- [ ] Add a compact mobile board mode for real duel interaction.
- [ ] Add keyboard navigation and stronger screen-reader semantics.
- [ ] Add visual regression tests for major board states.
- [ ] Add browser end-to-end tests for catalog, Line Lab, and simulator flows.

---

# 4. Real `ocgcore` WebAssembly foundation

## Completed

- [x] Pin the upstream `ygopro-core` revision to `0764db0c75b3d1d574880d365aa3695ab1f13b43`.
- [x] Fetch the pinned source reproducibly.
- [x] Fetch the pinned Lua submodule revision reproducibly.
- [x] Add an Emscripten/CMake build pipeline.
- [x] Compile a real `ocgcore.js` and `ocgcore.wasm` artifact.
- [x] Enable the exception behavior required by the embedded Lua/core runtime.
- [x] Export heap views and bridge functions needed by JavaScript.
- [x] Add a C/C++ bridge for duel creation, start, processing, messages, responses, and destruction.
- [x] Add card registration bridge functions.
- [x] Add card, count, and field query bridge functions.
- [x] Validate Project Ignis API version `11.0` at runtime.
- [x] Publish the generated browser assets from CI.
- [x] Publish a machine-readable CI result/log summary back to `main`.
- [x] Load the real module from the deployed app.
- [x] Run the core inside a Web Worker.
- [x] Keep React isolated from mutable engine state through immutable `EngineSnapshot` values.
- [x] Decode the framed message buffer used by the pinned API.
- [x] Correct the startup assumption: the first meaningful startup packet in this setup is `MSG_NEW_TURN`, not a required legacy `MSG_START` packet.
- [x] Add clear worker/runtime diagnostics for load, allocation, processing, and packet failures.

## Still required

- [ ] Decide how generated WASM artifacts should be versioned for long-term releases.
- [ ] Add artifact hashes/integrity verification.
- [ ] Add a documented upstream-upgrade procedure.
- [ ] Add automated compatibility testing against a candidate newer core before changing the pin.
- [ ] Reduce or lazy-load the runtime cost where possible.
- [ ] Add robust worker cancellation and restart behavior around hung or malformed duels.
- [ ] Add memory-growth and long-session testing.
- [ ] Add structured fatal-error reporting without exposing internal implementation details to normal users.

---

# 5. Engine snapshots and board queries

## Completed

- [x] Define a worker protocol for initialization, actions, reset, status, logs, and snapshots.
- [x] Keep the simulator UI independent of direct `ocgcore` calls.
- [x] Register a real Mystical Elf card record with the core card reader.
- [x] Create deterministic one-card decks.
- [x] Draw the opening card through the real engine.
- [x] Query the real hand count.
- [x] Query the real card code and position.
- [x] Query the real monster-zone state.
- [x] Convert queried state into the shared immutable `PlaybackFrame` board model.
- [x] Render the same card identity moving from hand to field.
- [x] Map the selected engine sequence to M1–M5 instead of hard-coding M1 after every action.
- [x] Put the game board before diagnostics and logs on the Simulator page.
- [x] Replace the bootstrap-specific board builder with a generic full-field snapshot builder.
- [x] Query every occupied sequence for both players and every supported location.
- [x] Include complete LP, turn player, turn count, phase, and chain state.
- [x] Include card status, reason, owner, controller, position, type, level/rank/link, counters, and overlays.
- [x] Preserve stable card instance IDs across moves instead of relying on bootstrap-specific IDs.
- [x] Build state diffs from consecutive snapshots rather than manually declaring movement.
- [x] Make animations derive from engine-observed state transitions.
- [x] Model hidden and public information separately.
- [x] Decode the full `card::get_infos` segment format instead of reading single flags.
- [x] Decode `OCG_DuelQueryField` for life points, zone occupancy, per-location counts, and the Chain.
- [x] Transcribe the pinned core's location, position, type, phase, and query constants into one shared module.

Notes on the three items above that are easy to over-read:

- Hidden information is modelled but not yet enforced on the wire. `EngineFieldState` deliberately
  holds engine truth, and `redactFieldStateForViewer` strips what a given viewer may not know. The
  local single-viewer worker keeps full truth for diagnostics; any two-player or networked path must
  redact before sending.
- Counters and overlays are decoded and carried in the state. The visualizer does not draw them yet;
  that work is tracked in section 3.
- Separate Pendulum Zones (spell sequences 6 and 7) have no visual slot. With the duel flags this
  project uses, the core places Pendulum cards in spell sequence 0 or 4, which already map to S1/S5.

## Still required

- [ ] Include priority in the snapshot; the pinned core does not expose it through any query.
- [ ] Add snapshot serialization fixtures for tests and replay/debug reports.
- [ ] Add `OCG_DuelQueryLocation` to the bridge so a location is read in one call instead of per sequence.
- [ ] Reconcile turn and phase tracking with the engine after actions that skip or repeat a phase.

---

# 6. Interactive engine choice resolver

## Completed

- [x] Replace the single hard-coded action button with a typed prompt model.
- [x] Represent a prompt title, detail, kind, card code, and legal options.
- [x] Send both the active prompt ID and selected option ID to the worker.
- [x] Reject stale prompts and stale options.
- [x] Decode the initial `MSG_SELECT_IDLECMD` Normal Summon option.
- [x] Decode `MSG_SELECT_PLACE` into legal M1–M5 options.
- [x] Encode the selected place as the real three-byte place response.
- [x] Decode `MSG_SELECT_POSITION` into only the positions allowed by the engine mask.
- [x] Encode position responses as real engine response bytes.
- [x] Render the choice resolver directly under the board.
- [x] Add responsive action, zone, and position option layouts.
- [x] Keep the event log and lower-level engine diagnostics below the game and choice UI.
- [x] Add a CI smoke test that resolves Normal Summon → choose M1 → verify hand count 0 → verify monster count 1 → verify Mystical Elf in M1.
- [x] Give every prompt option an explicit board target, so the interface never infers one from a label.
- [x] Direct board interaction: tap the card in hand for its actions, tap the zone itself to place.
- [x] Highlight legal cards and legal destination zones instead of listing them only as buttons.
- [x] Bind a tap to the prompt it was offered for, so a stale tap cannot resolve against a newer prompt.

A battle position is deliberately **not** a board target: it is a property of a summon rather than a
place you can point at, so it stays a labelled option. The button list is hidden only when every
option in a prompt is anchored, which keeps unanchored options reachable.

## Manual verification pending

- [x] Confirm the latest deployed flow on desktop.
- [ ] Confirm the latest deployed flow on iPhone/mobile Safari. Chromium at a phone viewport passes,
      but that is not Safari and does not count.
- [ ] Confirm selecting each of M1–M5 renders the card in the chosen zone. M4 is covered
      automatically; the other four are offered but only spot-checked.
- [ ] Confirm a future scenario with multiple legal positions displays and resolves the position chooser correctly.

## Still required prompt types

- [ ] Generic idle commands: Set, activate Spell/Trap, activate monster effect, change position, move to Battle Phase, move to End Phase.
- [ ] `MSG_SELECT_BATTLECMD`.
- [ ] `MSG_SELECT_EFFECTYN`.
- [ ] `MSG_SELECT_YESNO`.
- [ ] `MSG_SELECT_OPTION`.
- [ ] `MSG_SELECT_CARD`.
- [ ] `MSG_SELECT_UNSELECT_CARD`.
- [ ] Tribute selection.
- [ ] Chain selection and optional chain pass.
- [ ] Sum/material selection.
- [ ] Counter selection.
- [ ] Sort-card and sort-chain choices.
- [ ] Announce card, number, race, and attribute choices.
- [ ] Field disabling and other place-selection variants.
- [ ] Cancel, finish, retry, and invalid-response behavior.
- [ ] Multi-step prompt history and breadcrumbs.
- [ ] Clear presentation of required versus optional choices.
- [ ] Extend board targets to the remaining prompt types as they are implemented; card selection and
      tribute selection are the next two that clearly belong on the board.

---

# 7. Card database and Lua script resolver

## Current limitation

The simulator currently registers one scriptless bootstrap card directly in memory. It does **not** yet load the real Yu-Gi-Oh! card database or resolve real card scripts.

## Still required

- [ ] Choose and document the authoritative card-data source and update process.
- [ ] Add a build-time or runtime card database package compatible with the pinned core.
- [ ] Implement the card reader against real card records.
- [ ] Implement the script reader/resolver expected by `ocgcore`.
- [ ] Package required constants and utility scripts.
- [ ] Package individual `c<card-code>.lua` scripts.
- [ ] Add deterministic script lookup diagnostics.
- [ ] Add tests for missing scripts, malformed scripts, and script errors.
- [ ] Add a card-data/script version manifest.
- [ ] Verify card codes, aliases, types, levels/ranks/links, races, attributes, ATK/DEF, scales, and link markers.
- [ ] Confirm legal licensing/distribution boundaries for bundled data and scripts.

---

# 8. First real Mitsurugi vertical slice

## Goal

Replace Mystical Elf with a small, real Pure Mitsurugi opening that exercises scripts, searches, Ritual Summons, tributes, triggered effects, and choice resolution.

## Still required

- [ ] Load real records and scripts for the minimum Mitsurugi card set.
- [ ] Add Mitsurugi no Miko, Aramasa.
- [ ] Add Mitsurugi Prayers.
- [ ] Add Ame no Habakiri no Mitsurugi.
- [ ] Add Ame no Murakumo no Mitsurugi.
- [ ] Add the required Ritual Spell(s) and remaining minimum engine pieces.
- [ ] Define a deterministic opening hand and deck order.
- [ ] Render real card scans for the loaded simulator deck.
- [ ] Decode Aramasa's legal activation/summon choices.
- [ ] Decode Prayers and Ritual-material selections.
- [ ] Resolve tribute-trigger ordering correctly.
- [ ] Resolve simultaneous triggers and Chain construction through the choice UI.
- [ ] Query and render every resulting move from the engine.
- [ ] Complete one verified Mitsurugi line from opening hand to end board.
- [ ] Compare the engine-produced line with the authored DLN line.
- [ ] Add a CI smoke scenario for that exact Mitsurugi line.

---

# 9. General playable duel loop

## Still required

- [ ] Load a complete main deck and Extra Deck.
- [ ] Support deterministic and randomized shuffling.
- [ ] Support mulligan/opening procedures required by the selected format, if any.
- [ ] Support Draw, Standby, Main, Battle, Main 2, and End Phase progression.
- [ ] Support Normal Summon/Set.
- [ ] Support Special Summons from all relevant locations.
- [ ] Support Ritual, Fusion, Synchro, Xyz, Pendulum, and Link Summoning.
- [ ] Support Spell/Trap setting and activation.
- [ ] Support Ignition, Trigger, Quick, Continuous, and replacement effects.
- [ ] Support Chains, responses, priority windows, and passing.
- [ ] Support attacks, damage calculation, destruction, and battle replays.
- [ ] Support win/loss/draw states.
- [ ] Support both players making choices.
- [ ] Add a basic opponent controller: manual second player first, automation later.
- [ ] Add save/load of deterministic engine scenarios.
- [ ] Add a debug inspector for raw packets and normalized state.

---

# 10. DLN + engine unification

## Goal

The authored notation, visual playback, and real rules engine should converge on one state model instead of becoming three separate products.

## Still required

- [ ] Define the mapping between a DLN statement and one or more engine prompts/responses.
- [ ] Execute a DLN line against the engine from a declared starting state.
- [ ] Reject a line at the first illegal action with a useful source diagnostic.
- [ ] Compare declared DLN end state with queried engine end state.
- [ ] Produce an engine trace from a successful DLN execution.
- [ ] Generate `PlaybackFrame` transitions from engine diffs.
- [ ] Let the visualizer replay a recorded engine trace without rerunning the core.
- [ ] Preserve deterministic seeds, deck order, and chosen options in the trace.
- [ ] Add a “notation versus engine” diff view.
- [ ] Add regression fixtures for every published verified combo.
- [ ] Upgrade catalog verification status automatically when the engine trace passes.

---

# 11. Replay ingestion and analysis

## Still required

- [ ] Research supported public replay formats and their licensing/availability.
- [ ] Add YGOPro/Project Ignis-compatible replay ingestion where feasible.
- [ ] Add YGO Omega replay ingestion where feasible.
- [ ] Determine whether Master Duel replay data can be obtained reliably and legally; do not assume a public official API exists.
- [ ] Normalize imported replay actions into the shared engine/trace model.
- [ ] Reconstruct public state without inventing hidden information.
- [ ] Generate DLN drafts from imported replays.
- [ ] Identify deviations from a known combo line.
- [ ] Surface missed triggers, unused legal actions, sequencing errors, and illegal assumptions.
- [ ] Add shareable replay-analysis reports.

---

# 12. Combo discovery and search

## Still required

- [ ] Define a serializable engine search state.
- [ ] Enumerate legal actions through the same prompt model used by the UI.
- [ ] Clone/restart deterministic states efficiently enough for search.
- [ ] Add transposition-table/state hashing.
- [ ] Add loop detection.
- [ ] Add depth, time, and node budgets.
- [ ] Add goal predicates such as damage, interaction count, card advantage, specific end boards, or recovery.
- [ ] Add pruning for dominated and obviously irrelevant branches.
- [ ] Add scoring that separates legal certainty from strategic value.
- [ ] Generate human-readable DLN from discovered paths.
- [ ] Preserve exact response choices so paths are replayable.
- [ ] Add combo deduplication and canonicalization.
- [ ] Add puzzle generation from reachable states.
- [ ] Add optional AI assistance only after deterministic engine search is trustworthy.

---

# 13. Misplay detection and decision support

## Still required

- [ ] Define what counts as a misplay versus a strategic alternative.
- [ ] Compare a played line with the set of legal actions at each decision point.
- [ ] Detect objectively illegal actions separately from suboptimal actions.
- [ ] Detect missed mandatory and optional triggers.
- [ ] Detect lost value from tribute triggers and Chain ordering.
- [ ] Detect lines that unnecessarily lose to known interaction.
- [ ] Explain alternatives using reproducible engine paths, not unsupported prose.
- [ ] Add configurable goals so “best” can mean safety, damage, resources, or a specific end board.
- [ ] Add confidence levels and avoid claiming solved optimal play when search was incomplete.

---

# 14. Testing and engineering quality

## Completed

- [x] TypeScript build checks.
- [x] Parser/validator tests.
- [x] Repository check command.
- [x] Vite production build.
- [x] Vercel deployment checks.
- [x] Real pinned-core WebAssembly compile in CI.
- [x] Real engine boot smoke test.
- [x] Real card registration and field-query smoke test.
- [x] Real legal Normal Summon prompt smoke test.
- [x] Real action + monster-zone choice + resulting field-state smoke test.
- [x] Golden packet, card-query, and field-query fixtures captured from the pinned core.
- [x] A reproducible capture script (`npm run ocgcore:fixtures`) that regenerates those fixtures.
- [x] Snapshot tests for normalized engine states, including JSON round-tripping.
- [x] Unit tests for the message framer, the card-query decoder, and the field-query decoder.
- [x] An end-to-end test that drives the shipping runtime against the published core in Node.

## Still required

- [ ] Unit tests for the remaining prompt decoders: idle command, place, and position.
- [ ] Unit tests for every response encoder.
- [ ] A drift check that fails CI when the golden fixtures no longer match a freshly published core.
- [ ] Browser end-to-end test for the Simulator choice flow.
- [ ] Mobile viewport end-to-end test.
- [ ] Tests for stale prompt rejection and double taps.
- [ ] Tests for `MSG_RETRY` and invalid responses.
- [ ] Tests for worker crashes and recovery.
- [ ] Tests for missing/corrupt WASM assets.
- [ ] Tests for script errors.
- [ ] Tests for hidden-information boundaries.
- [ ] Performance budgets for load time, memory, and engine-search operations.
- [ ] A release checklist that records core, card-data, script, DLN, and database versions.

---

# 15. UX and product work

## Completed

- [x] Catalog-first product structure.
- [x] Responsive combo detail and board views.
- [x] Real card scans with safe fallback rendering.
- [x] Simulator status and event log.
- [x] Board-first Simulator layout.
- [x] Dedicated choice resolver under the game.
- [x] Mobile-responsive action and zone buttons.
- [x] Make legal cards and zones tappable directly on the board.
- [x] Highlight legal targets and legal destination zones.

## Still required

- [ ] Replace milestone/developer copy with a normal player-facing simulator experience when the engine is ready.
- [ ] Add a deck picker and scenario picker.
- [ ] Add opening-hand and seed controls for testing.
- [ ] Enlarge zone tap targets on phones. At a 390px viewport a Main Monster Zone hotspot measures
      about 38×55px, under the 44px minimum; five zones across a phone screen needs a layout answer,
      not a bigger button.
- [ ] Add cancel/back behavior only where the engine allows it.
- [ ] Add prompt history and an undo/restart-from-checkpoint workflow for practice scenarios.
- [ ] Add a compact rules explanation for each engine choice without overwhelming experienced players.
- [ ] Add clear separation between engine truth, DLN annotations, and strategic recommendations.
- [ ] Add loading progress for the WASM, card data, scripts, and scans.
- [ ] Add friendly recovery actions for unsupported packets rather than only displaying an error.
- [ ] Add accessibility review for touch targets, focus order, contrast, motion, and screen readers.

---

# 16. Documentation, release, and community

## Completed

- [x] README with the product overview and local setup.
- [x] Draft language specification.
- [x] Contribution guidance.
- [x] Source/provenance documentation.
- [x] Automated database setup notes.
- [x] Initial `ocgcore` package diagnostics and build scripts.

## Still required

- [ ] Keep this checklist current after every meaningful checkpoint.
- [ ] Link this checklist from the README.
- [ ] Document Simulator architecture and worker protocol.
- [ ] Document the bridge ABI.
- [ ] Document packet normalization and response encoding.
- [ ] Document card-data and script packaging.
- [ ] Add a troubleshooting guide for local WASM builds.
- [ ] Add contributor fixtures for new packet and prompt types.
- [ ] Add a public roadmap that separates committed work from speculative research.
- [ ] Add release notes and version tags once the first real Mitsurugi line is reproducible.
- [ ] Review attribution, trademarks, card images, database data, scripts, and replay-source obligations before broader publication.

---

# Immediate execution order

These are the next practical milestones, in order:

1. [ ] Manually verify the deployed action → zone → summon flow on mobile and desktop.
2. [ ] Add browser end-to-end coverage for that flow.
3. [x] Generalize snapshot construction beyond the one-card bootstrap.
4. [ ] Add the real card database and Lua script resolver.
5. [ ] Load the minimum real Mitsurugi card/script set.
6. [ ] Implement the next required prompt types encountered by that line, rather than implementing every protocol message speculatively.
7. [ ] Complete and CI-lock one real Mitsurugi opening.
8. [ ] Execute the corresponding DLN line against the engine and compare end states.
9. [ ] Expand from one line to a reusable playable turn loop.
10. [ ] Begin replay validation and deterministic combo-search work only after the engine/snapshot layer is trustworthy.

# Working agreement

- Commit directly to `main` unless there is a compelling safety reason not to.
- Prefer thin, reusable vertical slices over throwaway demos.
- Keep React dependent on immutable snapshots, not mutable core internals.
- Do not claim a behavior is complete merely because the UI displays it.
- Use automated engine verification wherever possible.
- Ask for manual testing only at meaningful player-visible checkpoints.
- Record limitations explicitly so bootstrap behavior is not mistaken for a general duel simulator.
