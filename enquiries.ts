/**
 * POST /api/enquiries — public intake for the contact / "request staff" form.
 */

import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/runtime';
import { insertRow, newId, nowIso, isThrottled, hashIp } from '../../lib/db';
import { readBody, validate, looksAutomated, json } from '../../lib/validate';
import { notifyNewSubmission } from '../../lib/notify';

export const prerender = false;

const TYPES = ['staffing', 'general', 'partnership', 'billing', 'careers', 'other'] as const;

export const POST: APIRoute = async ({ request, locals, url }) => {
  const env = getEnv(locals);
  const body = await readBody(request);

  if (looksAutomated(body)) return json({ ok: true, id: null });

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const ipHash = await hashIp(ip, env.CF_ACCESS_AUD || 'icco');
  if (await isThrottled(env.DB, ipHash, 'enquiries', 8, 60)) {
    return json({ ok: false, errors: { _form: 'Too many messages. Try again shortly.' } }, 429);
  }

  const parsed = validate<Record<string, unknown>>(body, [
    { key: 'name', required: true, max: 120 },
    { key: 'email', required: true, type: 'email', max: 160 },
    { key: 'phone', type: 'phone', max: 32 },
    { key: 'organization', max: 160 },
    { key: 'enquiry_type', type: 'enum', values: TYPES },
    { key: 'subject', max: 200 },
    { key: 'message', required: true, max: 5000 },
    { key: 'utm_source', max: 120 },
    { key: 'utm_medium', max: 120 },
    { key: 'utm_campaign', max: 120 },
    { key: 'source_page', max: 300 },
  ]);

  if (!parsed.ok) return json({ ok: false, errors: parsed.errors }, 422);

  const ts = nowIso();
  const id = newId('enq');

  try {
    await insertRow(env.DB, 'enquiries', {
      id,
      created_at: ts,
      updated_at: ts,
      status: 'new',
      ...parsed.value,
      enquiry_type: parsed.value.enquiry_type ?? 'general',
      ip_country: request.headers.get('cf-ipcountry'),
      user_agent: (request.headers.get('user-agent') || '').slice(0, 300),
    });
  } catch (err) {
    console.error('enquiry insert failed', err);
    return json({ ok: false, errors: { _form: 'Could not send your message. Please try again.' } }, 500);
  }

  await notifyNewSubmission(env, {
    kind: 'Enquiry',
    who: String(parsed.value.name),
    summary: `${parsed.value.enquiry_type ?? 'general'} · ${parsed.value.email}\n\n${String(parsed.value.message).slice(0, 500)}`,
    dashboardUrl: `${url.origin}/staff/?tab=enquiries`,
  });

  const accept = request.headers.get('accept') || '';
  if (!accept.includes('application/json')) {
    return new Response(null, { status: 303, headers: { location: '/thank-you/?type=enquiry' } });
  }
  return json({ ok: true, id });
};
