import { buildService } from "./container";
import { newRouter, type Env } from "./app/http/router";

const app = newRouter(buildService);

export default {
  fetch: app.fetch,

  // Cron-driven cleanup. Links expire logically on read, but nothing removes the
  // rows, so without this they accumulate against the 50,000 cap.
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const purged = await buildService(env).purgeExpired();
    if (purged > 0) {
      console.log(`purged ${purged} expired links`);
    }
  },
} satisfies ExportedHandler<Env>;
