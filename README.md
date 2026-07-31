# Lucky Seven

A realtime, mobile-first push-your-luck card game inspired by Flip 7. Create a table, share its link, and race friends to 200 points without flipping the same number twice.

**Live game:** [Play Lucky Seven](https://flipseven-flipseven-dev-ethanpotts-rglfh4ctd6kj2lxs.ethanmpotts.workers.dev)

## Stack

- TanStack Start and React 19
- Cloudflare Workers provisioned with Alchemy v2
- One SQLite-backed Durable Object per game
- Hibernatable WebSockets with serialized player attachments
- TypeScript and pnpm

## Features

- Create games and join with a code or share link
- Private device-local player sessions
- Realtime game state with automatic reconnects
- Host start and next-round controls
- Number, bonus, double, Second Chance, Freeze, and Flip Three cards
- Clickable opponent rows when an attack card needs a target
- Live deck count, round scores, total scores, and win state
- Horizontally scrollable player and card lists on mobile
- A device-local scorekeeper for games played with physical cards

## Local development

```bash
pnpm install
pnpm dev
```

Alchemy development uses the Cloudflare account configured by its CLI. To validate without deploying:

```bash
pnpm typecheck
pnpm build
```

## Deploy

```bash
pnpm alchemy deploy --yes
```

The stack in [`alchemy.run.ts`](./alchemy.run.ts) deploys the frontend Worker, backend Worker, service binding, and Durable Object namespace together.

## Game flow

The host starts each round and the dealer rotates. Everyone receives one opening card, then play moves around the table in order: on your turn, flip one card or stay. A repeated number busts the hand unless a Second Chance blocks it. Freeze banks any active player's hand; Flip Three forces any active player to draw up to three cards. Seven unique number cards immediately ends the round for everyone and awards a 15-point bonus. The deck carries between rounds and is reshuffled only when it runs out. At the end of a round, the unique high scorer at 200 or more wins; ties continue.

Visit `/score` to keep totals for a physical game. Add players, enter each round's score or mark a bust, and the scoreboard is saved in local storage on that device.

## License

MIT. This project uses original branding and interface artwork and is not affiliated with the creators or publishers of Flip 7.
