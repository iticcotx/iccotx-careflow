/**
 * GET /api/staff/export?entity=applications&... — CSV of the current filter set.
 * Takes the same query parameters as /api/staff/submissions. Capped at 5,000 rows
 * so a stray click cannot pull the whole database into a spreadsheet by accident.
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/runtime';
import { listSubmissions, isEntity, audit } from '../../../lib/db';
import { json } from '../../../lib/validate';

export const prerender = false;

const MAX_ROWS = 5000;

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // Neutralise spreadsheet formula injection from free-text fields.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async ({ url, locals }) => {
  const env = getEnv(locals);
  const actor = locals.staffUser?.email ?? 'unknown';

  const entity = url.searchParams.get('entity') ?? 'applications';
  if (!isEntity(entity)) return json({ error: 'unknown_entity' }, 400);

  const rows: Record<string, unknown>[] = [];
  let page = 1;
  while (rows.length < MAX_ROWS) {
    const res = await listSubmissions(env.DB, {
      entity,
      q: url.searchParams.get('q') ?? '',
      status: url.searchParams.get('status') ?? 'all',
      type: url.searchParams.get('type') ?? 'all',
      from: url.searchParams.get('from') ?? '',
      to: url.searchParams.get('to') ?? '',
      page,
      per: 100,
      sort: 'created_at',
      dir: 'desc',
    });
    rows.push(...res.rows);
    if (page >= res.pages || res.rows.length === 0) break;
    page += 1;
  }

  await audit(env.DB, { actor, action: 'export', entity, detail: `${rows.length} rows` });

  if (rows.length === 0) {
    return new Response('No rows matched the current filters.\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')),
  ].join('\r\n');

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="icco-${entity}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
