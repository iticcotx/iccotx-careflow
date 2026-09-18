/**
 * The ONE file that differs between Astro 5 and Astro 6.
 *
 * Astro 5 + @astrojs/cloudflare v11/v12 -> bindings live on `Astro.locals.runtime.env`
 * Astro 6 + @astrojs/cloudflare v13/v14 -> `Astro.locals.runtime` was removed; bindings
 *                                          come from the `cloudflare:workers` module.
 *
 * Everything else in this feature imports `getEnv(locals)` from here, so switching
 * versions is a two-line change in this file and nothing else.
 *
 * Check which you are on:  npx astro --version  &&  npm ls @astrojs/cloudflare
 */

export interface Env {
  /** D1 binding — must match the "binding" name in wrangler.jsonc */
  DB: D1Database;

  /** https://<your-team>.cloudflareaccess.com  (no trailing slash) */
  CF_ACCESS_TEAM_DOMAIN: string;
  /** Application Audience (AUD) tag of the Access application protecting /staff */
  CF_ACCESS_AUD: string;

  /** Optional second gate: comma-separated allow-list checked after JWT verification */
  STAFF_ALLOWED_EMAILS?: string;
  /** Optional: set to "true" ONLY in local `wrangler dev` to skip the Access check */
  STAFF_DEV_BYPASS?: string;

  /** Optional outbound notification (Resend, Postmark, etc.) */
  NOTIFY_FROM?: string;
  NOTIFY_TO?: string;
  RESEND_API_KEY?: string;

  /** "production" | "staging" — set per environment in wrangler.jsonc */
  ENVIRONMENT?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
   ASTRO 5 (@astrojs/cloudflare v11 / v12) — this is the active version.
   ──────────────────────────────────────────────────────────────────────── */
export function getEnv(locals: App.Locals): Env {
  const env = (locals as any)?.runtime?.env as Env | undefined;
  if (!env?.DB) {
    throw new Error(
      'Cloudflare bindings unavailable. Run the site with `wrangler dev` (or `astro dev` ' +
        'with platformProxy enabled) and confirm the D1 binding named "DB" exists in wrangler.jsonc.'
    );
  }
  return env;
}

/* ────────────────────────────────────────────────────────────────────────────
   ASTRO 6 (@astrojs/cloudflare v13 / v14) — delete the function above, then
   uncomment these two lines. `locals` stays in the signature so no caller changes.

   import { env } from 'cloudflare:workers';
   export function getEnv(_locals?: App.Locals): Env { return env as unknown as Env; }
   ──────────────────────────────────────────────────────────────────────── */
