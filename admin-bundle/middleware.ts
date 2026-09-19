/**
 * Edge gate for the staff area.
 *
 * Cloudflare Access already blocks unauthenticated users before the request
 * reaches this Worker. This middleware is the second lock: it proves the request
 * really came through Access (signed JWT), pins the identity onto `locals` for
 * the audit log, and fails closed if Access is misconfigured or bypassed.
 *
 * If your project already has a src/middleware.ts, merge the `onRequest` body
 * into yours rather than replacing the file — or use Astro's `sequence()`.
 */

import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './lib/runtime';
import { verifyAccess } from './lib/access';

const PROTECTED = [/^\/staff(\/|$)/, /^\/api\/staff(\/|$)/];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (!PROTECTED.some((re) => re.test(pathname))) {
    return next();
  }

  let env;
  try {
    env = getEnv(context.locals);
  } catch (err) {
    return new Response('Staff area is not configured on this deployment.', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const result = await verifyAccess(context.request, env);

  if (!result.ok) {
    const wantsJson =
      pathname.startsWith('/api/') ||
      (context.request.headers.get('accept') || '').includes('application/json');

    return new Response(
      wantsJson
        ? JSON.stringify({ error: 'unauthorized', message: result.reason })
        : `Not authorised.\n\n${result.reason}\n\nSign in through Cloudflare Access and try again.`,
      {
        status: result.status,
        headers: {
          'content-type': wantsJson
            ? 'application/json; charset=utf-8'
            : 'text/plain; charset=utf-8',
          'cache-control': 'no-store',
        },
      }
    );
  }

  // Same-origin check for state-changing staff requests (defence in depth on top
  // of Access; the Access cookie alone should never be enough to mutate data).
  const method = context.request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = context.request.headers.get('origin');
    if (origin && new URL(origin).host !== context.url.host) {
      return new Response(JSON.stringify({ error: 'bad_origin' }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
  }

  context.locals.staffUser = result.identity;

  const response = await next();
  response.headers.set('cache-control', 'no-store, private');
  response.headers.set('x-robots-tag', 'noindex, nofollow');
  response.headers.set('referrer-policy', 'no-referrer');
  return response;
});
