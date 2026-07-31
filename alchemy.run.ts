import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import type { GameRoom } from "./src/worker.ts";

export class Backend extends Cloudflare.Worker<Backend>()("FlipSevenApi", {
  main: "./src/worker.ts",
  env: {
    GAMES: Cloudflare.DurableObject<GameRoom>("GameRoom"),
  },
  compatibility: {
    flags: ["nodejs_compat"],
  },
}) {}

export class Website extends Cloudflare.Website.Vite<Website>()("FlipSeven", {
  compatibility: {
    flags: ["nodejs_compat"],
  },
  env: {
    BACKEND: Backend,
  },
}) {}

export type WebsiteEnv = Cloudflare.InferEnv<typeof Website>;

export default Alchemy.Stack(
  "FlipSeven",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const backend = yield* Backend;
    const website = yield* Website;

    return {
      apiUrl: backend.url.as<string>(),
      websiteUrl: website.url.as<string>(),
    };
  }),
);
