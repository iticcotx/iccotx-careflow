/**
 * POST /api/applications — public intake for the "Apply" form.
 * Point your existing form at this route: <form method="post" action="/api/applications">
 * or fetch() it with JSON. Returns { ok: true, id } or { ok: false, errors }.
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/runtime';
import { insertRow, newId, nowIso, isThrottled, hashIp } from '../../lib/db';
import { readBody, validate, looksAutomated, json } from '../../lib/validate';
import { notifyNewSubmission } from '../../lib/notify';

export const prerender = false;

const ROLES = [
  'RN', 'LVN', 'LPN', 'CNA', 'CMA', 'Medical Assistant', 'Physical Therapist',
  'Occupational Therapist', 'Respiratory Therapist', 'Caregiver', 'Other',
] as const;

const AVAILABILITY = ['immediate', '2_weeks', '30_days', 'flexible'] as const;
const SHIFTS = ['day', 'night', 'weekend', 'any'] as const;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = getEnv(locals);
  const body = await readBody(request);

  // Bots first — cheapest rejection, and it never touches the database.
  if (looksAutomated(body)) {
    return json({ ok: true, id: null }); // answer 200 so bots do not learn anything
  }

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await hashIp(ip, env.CF_ACCESS_AUD || 'icco');
  if (await isThrottled(env.DB, ipHash, 'applications', 5, 60)) {
    return json({ ok: false, errors: { _form: 'Too many submissions. Try again shortly.' } }, 429);
  }

  const parsed = validate<Record<string, unknown>>(body, [
    { key: 'first_name', required: true, max: 80 },
    { key: 'last_name', required: true, max: 80 },
    { key: 'email', required: true, type: 'email', max: 160 },
    { key: 'phone', type: 'phone', max: 32 },
    { key: 'city', max: 80 },
    { key: 'state', max: 40 },
    { key: 'role_applied', type: 'enum', values: ROLES },
    { key: 'license_type', max: 60 },
    { key: 'license_state', max: 40 },
    { key: 'years_experience', type: 'int' },
    { key: 'availability', type: 'enum', values: AVAILABILITY },
    { key: 'shift_preference', type: 'enum', values: SHIFTS },
    { key: 'resume_url', type: 'url', max: 500 },
    { key: 'message', max: 4000 },
    { key: 'utm_source', max: 120 },
    { key: 'utm_medium', max: 120 },
    { key: 'utm_campaign', max: 120 },
    { key: 'source_page', max: 300 },
  ]);

  if (!parsed.ok) return json({ ok: false, errors: parsed.errors }, 422);

  const ts = nowIso();
  const id = newId('app');

  try {
    await insertRow(env.DB, 'applications', {
      id,
      created_at: ts,
      updated_at: ts,
      status: 'new',
      ...parsed.value,
      ip_country: request.headers.get('cf-ipcountry'),
      user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
    });
  } catch (err) {
    console.error('application insert failed', err);
    return json({ ok: false, errors: { _form: 'Could not save your application. Please try again.' } }, 500);
  }

  await notifyNewSubmission(env, {
    kind: 'Application',
    who: `${parsed.value.first_name} ${parsed.value.last_name}`,
    summary: `${parsed.value.role_applied ?? 'Role not specified'} · ${parsed.value.email}`,
    dashboardUrl: `${url.origin}/staff/?tab=applications`,
  });

  // Plain <form> posts get a redirect; fetch() callers get JSON.
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json')) {
    return new Response(null, { status: 303, headers: { location: '/thank-you/?type=application' } });
  }
  return json({ ok: true, id });
};
