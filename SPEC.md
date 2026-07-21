# DLN v0.1 specification

## Document structure

Every line contains a deck declaration, line declaration, starting state, numbered steps, and ending state.

```ebnf
document      = deck-decl, line-decl, start-decl, { step }, end-decl ;
deck-decl     = "@deck", slug ;
line-decl     = "@line", slug ;
start-decl    = "@start", state ;
end-decl      = "@end", state ;
step          = action-step | chain-step ;
action-step   = integer, expression ;
chain-step    = integer, "CHAIN", "{", { chain-link }, "}" ;
chain-link    = "CL", integer, expression ;
```

Blank lines and lines beginning with `//` are ignored.

## Card references

Deck manifests define local uppercase aliases. A reference may select a named effect:

```text
ARA       the card aliased as ARA
ARA#S     ARA's on-Summon effect
ARA#T     ARA's on-Tribute effect
RIT#2     the second bulleted effect of Mitsurugi Ritual
```

Effect selectors are deck-local documentation. The following conventions are recommended:

| Selector | Meaning |
| --- | --- |
| `#S` | Summoned trigger |
| `#T` | Tributed trigger |
| `#G` | sent-to-GY or GY trigger |
| `#Q` | Quick Effect |
| `#1`, `#2` | numbered/bulleted effect |

## Zones and movement

| Symbol | Zone |
| --- | --- |
| `H` | hand |
| `D` | Main Deck |
| `F` | field |
| `G` | Graveyard |
| `B` | banishment |
| `X` | Extra Deck |

Movement is written `ALIAS:FROM>TO`. It describes observable card movement; the operation describes why it moved.

```text
ADD ARA:D>H
SS ARA:H>F
TR HAB:H>G
```

## Operations

The v0.1 core vocabulary is:

| Operation | Meaning |
| --- | --- |
| `NS` | Normal Summon |
| `SS` | Special Summon |
| `RS` | Ritual Summon |
| `FS` | Fusion Summon |
| `XS` | Xyz Summon |
| `LS` | Link Summon |
| `SY` | Synchro Summon |
| `TR` | Tribute |
| `ADD` | add from Deck to hand |
| `REC` | recover to hand from another public zone |
| `SEND` | send to the GY |
| `SET` | Set a card |
| `BAN` | banish |
| `DISCARD` | discard |
| `DMG` | take or inflict damage, according to context |
| `ACT` | activate a card |
| `ATK` | declare or resolve an attack |
| `DRAW` | draw from the Deck |
| `LOOK` | inspect hidden information |
| `PLACE` | place a card without treating it as an activation |
| `RETURN` | return a card to a specified zone |
| `REV` | reveal a card |
| `SHUF` | shuffle a card into the Deck |

An activation is divided into costs and resolution:

```text
CARD#effect [cost operations] => resolved operations
```

Semicolons sequence operations within one resolving effect. A numbered line beginning after the expression represents the next open-game-state action or trigger window.

## Chains

Chain Links appear in activation order:

```dln
2 CHAIN {
  CL1 HAB#T => ADD RIT:D>H
  CL2 ARA#S => ADD MUR:D>H
}
```

Therefore `CL2` resolves first. A validator must require contiguous Chain Link numbers beginning at 1.

## State declarations

State declarations record only facts relevant to the documented line:

```text
@start LP=8000; H=[PRY,HAB]
@end LP=7200; H=[RIT]; F=[MUR@8,ARA@4,NSS@4]
```

`@8` is a level annotation in a state list, not a zone. Future versions may add counters, face orientation, once-per-turn ledgers, known opponent state, and lingering restrictions.

## Intentionally unresolved in v0.1

- simultaneous-effects ordering beyond explicit Chain notation
- optional versus mandatory activation markers
- opponent response branches
- target selection and target legality
- lingering locks and once-per-turn ledgers
- probabilistic or alternative starting states
- loops and recursively named sub-lines

Those features should be designed against representative decks before their syntax is standardized.
