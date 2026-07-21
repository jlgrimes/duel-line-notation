# Contributing

DLN is being designed from concrete combo lines. Contributions should ideally add or improve a real line and explain which missing language feature it exposes.

## Adding a deck

Create this structure:

```text
decks/<slug>/
  deck.json
  lines/
    <line-slug>.dln
```

`deck.json` contains a stable slug, display name, format notes, and a map of local aliases to card definitions. Copy `decks/_template` for a minimal example.

Keep aliases short enough to scan but unambiguous within that deck. Card names should match the official English database spelling.

## Proposing syntax

Include:

1. The interaction that current DLN cannot represent.
2. One compact syntax proposal.
3. At least one real before/after example.
4. Parser and validator tests when the syntax is machine-readable.

Avoid adding a symbol merely to shorten one card name. Syntax should represent reusable game concepts.

## Validation

```sh
npm install
npm run ci
```

`npm run ci` validates every deck fixture, runs the parser tests, type-checks the React Line Lab, and produces its Vite production build. Add current metagame metadata to `decks/meta.json` only when the deck should appear in the sandbox navigation.
