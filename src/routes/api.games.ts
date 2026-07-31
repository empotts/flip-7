import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";

export const Route = createFileRoute("/api/games")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        env.BACKEND.fetch(new Request("https://backend/games", request)),
    },
  },
});
