import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";

export const Route = createFileRoute("/api/games/$gameId/join")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        env.BACKEND.fetch(
          new Request(`https://backend/games/${params.gameId.toUpperCase()}/join`, request),
        ),
    },
  },
});
