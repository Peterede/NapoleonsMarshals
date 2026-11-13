# Napoleon's Marshals

> A turn-based Napoleonic war game of columns, squares and cannon smoke.

Command the French army through three historic battles — Lodi, Austerlitz and Waterloo — on a hex grid, against a coalition AI that manoeuvres, fires and charges.

Built with TypeScript and Canvas 2D. No runtime dependencies, no external assets, no accounts. Campaign progress is saved in the browser.

---

## The campaign

| Battle | Date | Command | Objectives | Turn limit | Your force vs. allies |
| --- | --- | --- | --- | --- | --- |
| **The Bridge at Lodi** | 10 May 1796 | Armée d'Italie | 2 | 10 | 6 vs. 5 regiments |
| **The Sun of Austerlitz** | 2 December 1805 | Grande Armée | 3 | 12 | 9 vs. 8 regiments |
| **The Last Square** | 18 June 1815 | Armée du Nord | 3 | 13 | 10 vs. 10 regiments |

Each battle opens with a briefing, a short historical note and the full order of battle. Victories unlock the next engagement; earn up to three honours per battle by winning quickly and keeping the army intact.

---

## Features

- **Hex warfare** — terrain costs, cover, chokepoints and disengagement penalties.
- **Napoleonic formations** — line, column and square, each with distinct strengths and vulnerabilities.
- **Combined arms** — musketry, canister, long-range batteries, and cavalry charges that reward distance and punish squares.
- **Morale model** — regiments break from losses and flanking, not just casualties; commanders steady the line and can sound one rally per battle.
- **Objective-based battles** — take and physically hold every objective at the end of a full turn.
- **A reactive AI opponent** — garrisons threatened objectives, focuses weakened regiments, keeps its guns at range, forms square against cavalry, and counter-attacks lost ground.
- **Hand-drawn battlefield** — procedurally textured terrain, animated movement, muzzle flashes, cannon smoke, floating casualties and waving standards, all rendered on a canvas.
- **Quality-of-life** — undo, hover combat forecasts, dispatch log, synthesised sound, keyboard shortcuts and a responsive layout.

---

## Quick start

### Requirements

- Node.js 20 or newer
- npm 10 or newer

### Run locally

```bash
# from the repository root
npm install
npm run dev
```

Open **http://localhost:3000**.

### Production build

```bash
npm run build
npm run preview
```

The static build is written to `dist/` and can be hosted on any static host.

---

## How to play

You command the French army. The allied AI takes the opposing side.

### Victory

Take **every objective** on the field and hold all of them at the end of a full turn.

You lose the field if:

- the turn limit expires with any objective still outside French hands, or
- your army is broken.

Objectives are only held while a regiment is standing on them — a fast cavalry raid can touch every objective, but it cannot claim a victory unless the line holds.

### Controls

| Action | Input |
| --- | --- |
| Select a regiment | Left-click |
| March | Select a regiment, then click a highlighted hex |
| Fire or charge | Select a regiment, then click a marked enemy |
| Deselect | `Esc` or right-click |
| End turn | `Space` or the **End Turn** button |
| Undo last order | `U` or the **Undo** button |
| Change formation | `1` Line · `2` Column · `3` Square |
| Sound the rally | `R` |
| Mute | `M` |

Hover over an enemy to read the expected casualties and morale loss before committing to an attack.

### The battlefield

| Terrain | Effect |
| --- | --- |
| Open ground | No cover, fastest movement |
| Wheat field | Slight cover |
| Wood | Good cover; slow; blocks artillery movement |
| Height | Cover and commanding ground; extra movement cost |
| Village | Strongest cover; ideal for a garrison |
| Ford / bridge | The only river crossing; a deadly choke point |
| Marsh | Slow, exposed going |

Leaving a hex adjacent to an enemy costs **+2 MP**. Lines are sticky once engaged.

### Regiments

| Unit | Men | Move | Range | Role |
| --- | ---: | ---: | ---: | --- |
| Line Infantry | 620 | 3 | 2 | Steady volleys; the backbone of the army |
| Light Infantry | 470 | 4 | 3 | Skirmishers; at home in woods and villages |
| Guard Infantry | 540 | 3 | 2 | Elite quality and stubborn morale |
| Cavalry | 380 | 6 | — | Fast shock troops; charges adjacent enemies |
| Artillery | 240 | 2 | 4 | Devastating bombardment, but cannot fire on a turn it moved |
| Commander | 40 | 5 | — | Inspires nearby regiments; one rally per battle |

### Formations

| Formation | Strengths | Weaknesses |
| --- | --- | --- |
| **Line** | Best volleys, steady defence | Vulnerable to a determined charge |
| **Column** | Melee bonus for assaults | Vulnerable to artillery fire |
| **Square** | Near-immune to cavalry | Weak fire, slow movement |

Reforming ends a regiment's movement for the turn, but it may still fire. Each regiment may attack or reform once per turn.

### Morale and command

Morale is the real currency of the battlefield.

- Losses, flanking attacks, concentrated fire and the fall of a commander sap morale.
- A regiment at **zero morale breaks** and leaves the field, even if it still has men.
- Regiments recover a little morale when they begin a turn out of contact.
- A commander within two hexes grants a **+7%** attack bonus to nearby regiments.
- Each commander can sound **one rally per battle**, restoring morale to all friendly regiments within two hexes.

Artillery cannot fire on the turn it moves. Cavalry must charge to fight; a charge launched from three or more hexes away is far deadlier — except into a square.

---

## The AI

The coalition commander is not scripted to sit still. Each turn it:

1. Assigns regiments to objectives, detaching units to contest any objective the French are occupying.
2. Prefers weakened and low-morale targets, while valuing guns and headquarters.
3. Keeps batteries at effective range and away from adjacent infantry.
4. Forms square when French cavalry closes, unless a decisive attack is available.
5. Uses its own commander to rally wavering regiments.
6. Advances or counter-attacks according to the scenario's stance.

The AI uses only the same information and rules available to the player — it has no hidden bonuses or extra actions.

---

## Tech stack

- **TypeScript** throughout, strict mode.
- **Vite** for development and production builds.
- **Canvas 2D** for the entire battlefield and its effects.
- **Web Audio API** for synthesised musketry, cannon and rally calls.
- **Vitest** for engine and AI tests.
- **localStorage** for campaign progress and honours.

No runtime dependencies and no external image, audio or font assets.

---

## Project structure

```text
.
├── index.html
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts              # entry point
│   ├── style.css            # campaign, battlefield and modal styling
│   ├── storage.ts           # campaign progress in localStorage
│   ├── game/
│   │   ├── ai.ts            # coalition battle AI
│   │   ├── combat.ts        # attack maths, forecasts and resolution
│   │   ├── game.ts          # turns, movement, orders, objectives, victory
│   │   ├── hex.ts           # axial hex geometry and canvas helpers
│   │   ├── scenarios.ts     # maps, orders of battle and briefings
│   │   ├── types.ts         # shared game types
│   │   └── units.ts         # unit stats, terrain and formations
│   └── ui/
│       ├── app.ts           # title, campaign, briefing and result screens
│       ├── audio.ts         # small synthesised sound engine
│       ├── battle.ts        # battle controller and HUD
│       └── render.ts        # canvas battlefield renderer
└── tests/
    └── game.test.ts         # engine, scenario and AI tests
```

The engine under `src/game/` is deliberately free of DOM code, so it can be tested or reused headlessly. The UI layer owns rendering, input, animation and persistence.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server at `http://localhost:3000` |
| `npm run build` | Type-check the project and build `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite |

### Tests

The suite covers:

- axial hex distance and pixel round-tripping,
- every scenario's map dimensions, deployments and objectives,
- movement allowances, pathfinding and blocking,
- formation restrictions and square-versus-cavalry combat,
- the artillery movement rule,
- attack resolution and casualty accounting,
- complete AI-vs-AI battles for all three scenarios, including a stall guard.

```bash
npm test
```

---

## Design notes

- Maps are authored as ASCII rows using odd-r offset coordinates; the engine converts them to axial coordinates.
- Combat and morale use deterministic formulas with small random rolls. Attack forecasts expose the expected result before an order is confirmed.
- The AI evaluates every reachable destination, scoring attacks, cover, objective distance, danger and formation.
- The entire interface is drawn or styled locally; fonts use system serif and sans-serif stacks for offline reliability.
- Campaign progress and the current sound setting are the only persisted data.

---

## Contributing

Contributions are welcome.

1. Fork the repository and create a feature branch.
2. Keep engine logic in `src/game/` free of DOM access.
3. Add or update tests for rules changes.
4. Run `npm test` and `npm run build` before opening a pull request.

---

## License

No license file is currently included. Add one before distributing or publishing this project.
