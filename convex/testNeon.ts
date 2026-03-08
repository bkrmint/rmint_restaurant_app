"use node";

import { action } from "./_generated/server";
import { neon } from "@neondatabase/serverless";

/**
 * Verify Neon connection. Set NEON_DATABASE_URL in Convex dashboard (Settings → Environment Variables).
 * Call from dashboard or remove after testing.
 */
export const ping = action({
  args: {},
  handler: async () => {
    const url = process.env.NEON_DATABASE_URL;
    if (!url) {
      return { ok: false, error: "NEON_DATABASE_URL not set" };
    }
    const sql = neon(url);
    const result = await sql`SELECT NOW()::text as now`;
    return { ok: true, now: result[0]?.now ?? null };
  },
});
