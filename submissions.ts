/**
 * GET /api/staff/submissions
 *   ?entity=applications|enquiries   (required)
 *   &q=            free-text search
 *   &status=       one of the entity's statuses, or "all"
 *   &type=         role_applied (applications) / enquiry_type (enquiries), or "all"
 *   &from=YYYY-MM-DD &to=YYYY-MM-DD
 *   &page=1 &per=25 &sort=created_at &dir=desc
 *   &id=<row id>   returns the single full record instead of a page
 *
 * Reached only through src/middleware.ts, which has already verified the
 * Cloudflare Access JWT and populated locals.staffUser.
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/runtime';
import { listSubmissions, getSubmission, isEntity, audit, STATUSES } from '../../../lib/db';
import { json } from '../../../lib/validate';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const env = getEnv(locals);
  const actor = locals.staffUser?.email ?? 'unknown';

  const entity = url.searchParams.get('entity') ?? 'applications';
  if (!isEntity(entity)) return json({ error: 'unknown_entity' }, 400);

  const id = url.searchParams.get('id');
  if (id) {
    const row = await getSubmission(env.DB, entity, id);
    if (!row) return json({ error: 'not_found' }, 404);
    await audit(env.DB, { actor, action: 'view', entity, entityId: id });
    return json({ row, statuses: STATUSES[entity] });
  }

  const result = await listSubmissions(env.DB, {
    entity,
    q: url.searchParams.get('q') ?? '',
    status: url.searchParams.get('status') ?? 'all',
    type: url.searchParams.get('type') ?? 'all',
    from: url.searchParams.get('from') ?? '',
    to: url.searchParams.get('to') ?? '',
    page: Number(url.searchParams.get('page') ?? 1),
    per: Number(url.searchParams.get('per') ?? 25),
    sort: url.searchParams.get('sort') ?? 'created_at',
    dir: url.searchParams.get('dir') ?? 'desc',
  });

  // One audit row per search, not per result — enough for "who was looking at what".
  await audit(env.DB, {
    actor,
    action: 'list',
    entity,
    detail: url.search.slice(0, 300),
  });

  return json({ ...result, statuses: STATUSES[entity] });
};
