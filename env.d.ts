/// <reference types="astro/client" />

// If you already have src/env.d.ts, merge the App.Locals block into it.
// Generate the Cloudflare binding types with:  npx wrangler types
// (that writes worker-configuration.d.ts, which declares D1Database etc.)

type StaffUser = {
  email: string;
  sub: string;
  idp?: string;
};

declare namespace App {
  interface Locals {
    /** Set by src/middleware.ts after the Cloudflare Access JWT is verified. */
    staffUser?: StaffUser;

    // ── Astro 5 + @astrojs/cloudflare v11/v12 only ──────────────────────
    // Astro 6 removes this; delete the next line if you are on Astro 6.
    runtime: import('@astrojs/cloudflare').Runtime<import('./lib/runtime').Env>;

    // ── Astro 6 + @astrojs/cloudflare v13/v14 ───────────────────────────
    // cfContext: ExecutionContext;
  }
}
