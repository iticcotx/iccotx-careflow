/**
 * Cloudflare Access verification.
 *
 * Cloudflare Zero Trust authenticates the user at the edge and forwards a signed
 * JWT in the `Cf-Access-Jwt-Assertion` header. Verifying it here is what stops
 * someone from reaching /staff by hitting the origin directly, and it is what
 * gives us the staff member's email for the audit trail.
 *
 * Validate the HEADER, not the CF_Authorization cookie — the cookie is not
 * guaranteed to be forwarded.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from './runtime';

export type AccessIdentity = {
  email: string;
  sub: string;
  /** identity-provider name, when Access supplies it */
  idp?: string;
};

export type AccessResult =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; status: 401 | 403; reason: string };

/** createRemoteJWKSet caches keys in-process; keep one instance per team domain. */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`), {
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes
      cooldownDuration: 30 * 1000,
    });
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export async function verifyAccess(request: Request, env: Env): Promise<AccessResult> {
  // Local development escape hatch. Fails closed: it only applies when the flag is
  // explicitly "true" AND no Access config is present, so it cannot fire in production.
  if (env.STAFF_DEV_BYPASS === 'true' && !env.CF_ACCESS_AUD) {
    return { ok: true, identity: { email: 'dev@localhost', sub: 'dev', idp: 'bypass' } };
  }

  const teamDomain = (env.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/+$/, '');
  const aud = env.CF_ACCESS_AUD;

  if (!teamDomain || !aud) {
    // Misconfiguration must never read as "allowed".
    return { ok: false, status: 403, reason: 'Access is not configured for this deployment.' };
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ??
    readCookie(request.headers.get('Cookie'), 'CF_Authorization');

  if (!token) {
    return { ok: false, status: 401, reason: 'No Cloudflare Access token on the request.' };
  }

  let payload: JWTPayload & { email?: string; identity_nonce?: string; idp?: { type?: string } };
  try {
    const verified = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: teamDomain,
      audience: aud,
      clockTolerance: 30,
    });
    payload = verified.payload as typeof payload;
  } catch (err) {
    return { ok: false, status: 401, reason: `Invalid Access token: ${(err as Error).message}` };
  }

  const email = String(payload.email ?? '').toLowerCase();
  if (!email) {
    return { ok: false, status: 403, reason: 'Access token carries no email claim.' };
  }

  // Optional belt-and-braces allow-list, independent of the Access policy.
  const allow = (env.STAFF_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length > 0 && !allow.includes(email)) {
    return { ok: false, status: 403, reason: `${email} is not on the staff allow-list.` };
  }

  return {
    ok: true,
    identity: { email, sub: String(payload.sub ?? ''), idp: payload.idp?.type },
  };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
