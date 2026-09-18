/**
 * POST /api/staff/update
 * Body (JSON): { entity, id, status?, assigned_to?, staff_notes? }
 *
 * Every change is written to admin_audit with the Access identity of whoever
 * made it. Origin is checked in middleware before this route runs.
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/runtime';
import { updateSubmission, isEntity, audit, STATUSES } from '../../../lib/db';
import { json } from '../../../lib/validate';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals);
  const actor = locals.staffUser?.email ?? 'unknown';

  const body = (await request.json().catch(() => null)) as {
    entity?: string;
    id?: string;
    status?: string;
    assigned_to?: string;
    staff_notes?: string;
  } | null;

  if (!body?.entity || !body?.id) return json({ error: 'missing_fields' }, 400);
  if (!isEntity(body.entity)) return json({ error: 'unknown_entity' }, 400);
  if (body.status && !STATUSES[body.entity].includes(body.status)) {
    return json({ error: 'invalid_status', allowed: STATUSES[body.entity] }, 400);
  }

  let changed = false;
  try {
    changed = await updateSubmission(env.DB, body.entity, body.id, {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.assigned_to !== undefined ? { assigned_to: body.assigned_to } : {}),
      ...(body.staff_notes !== undefined ? { staff_notes: body.staff_notes } : {}),
    });
  } catch (err) {
    return json({ error: 'update_failed', message: (err as Error).message }, 400);
  }

  if (!changed) return json({ error: 'not_found' }, 404);

  await audit(env.DB, {
    actor,
    action: body.status ? 'status_change' : 'note',
    entity: body.entity,
    entityId: body.id,
    detail: JSON.stringify({
      status: body.status,
      assigned_to: body.assigned_to,
      notes_len: body.staff_notes?.length ?? 0,
    }),
  });

  return json({ ok: true });
};
