import { env as cloudflareEnv } from "cloudflare:workers";
import type { WebsiteEnv } from "../alchemy.run.ts";

export const env = new Proxy({} as WebsiteEnv, {
  get(_, prop) {
    return cloudflareEnv[prop as keyof typeof cloudflareEnv];
  },
});
