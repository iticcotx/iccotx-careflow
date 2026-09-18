// Reference config. Do NOT paste this over your existing astro.config.mjs —
// copy in only the pieces you are missing (adapter, output, session/KV if used).

import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://iccotx.com',

  // Leave this as the default 'static'. In Astro 5+, a static site with an adapter
  // still renders any route that opts out with `export const prerender = false`
  // on demand — which is exactly what /staff/index.astro and every /api/* route in
  // this bundle do. Your existing marketing pages keep building as static HTML.
  // (Setting output: 'server' would flip the default and make the whole site
  // server-rendered, which you do not want here.)
  // output: 'static',

  adapter: cloudflare({
    platformProxy: {
      // Gives `astro dev` real local D1/KV bindings from wrangler.jsonc.
      enabled: true,
    },
    imageService: 'compile',
  }),

  // If you use Tailwind v4, it is a Vite plugin now:
  // vite: { plugins: [tailwindcss()] }
  // Tailwind v3 users keep their @astrojs/tailwind integration as-is.
});
