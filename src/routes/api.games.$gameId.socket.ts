import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";

export const Route = createFileRoute("/api/games/$gameId/socket")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const source = new URL(request.url);
        return env.BACKEND.fetch(
          new Request(
            `https://backend/games/${params.gameId.toUpperCase()}/socket${source.search}`,
            request,
          ),
        );
      },
    },
  },
});
