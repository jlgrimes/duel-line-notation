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
