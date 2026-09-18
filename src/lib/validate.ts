/**
 * Dependency-free validation for the two public forms.
 * Accepts either application/json or multipart/urlencoded form posts so the same
 * endpoint works for a fetch() submit and a plain <form action="..."> fallback.
 */

export type Field = {
  key: string;
  required?: boolean;
  max?: number;
  type?: 'text' | 'email' | 'phone' | 'int' | 'enum' | 'url';
  values?: readonly string[];
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export async function readBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = v == null ? '' : String(v);
    return out;
  }
  const fd = await request.formData().catch(() => new FormData());
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}

export function validate<T extends Record<string, unknown>>(
  body: Record<string, string>,
  fields: Field[]
): ParseResult<T> {
  const errors: Record<string, string> = {};
  const value: Record<string, unknown> = {};

  for (const f of fields) {
    const raw = (body[f.key] ?? '').toString().trim();

    if (!raw) {
      if (f.required) errors[f.key] = 'Required.';
      value[f.key] = null;
      continue;
    }

    const max = f.max ?? 1000;
    if (raw.length > max) {
      errors[f.key] = `Must be ${max} characters or fewer.`;
      continue;
    }

    switch (f.type) {
      case 'email':
        if (!EMAIL_RE.test(raw)) errors[f.key] = 'Enter a valid email address.';
        else value[f.key] = raw.toLowerCase();
        break;
      case 'phone': {
        const digits = raw.replace(/[^\d+]/g, '');
        if (digits.replace(/\D/g, '').length < 7) errors[f.key] = 'Enter a valid phone number.';
        else value[f.key] = digits;
        break;
      }
      case 'int': {
        const n = Number.parseInt(raw, 10);
        if (Number.isNaN(n) || n < 0 || n > 80) errors[f.key] = 'Enter a whole number of years.';
        else value[f.key] = n;
        break;
      }
      case 'enum':
        if (!f.values?.includes(raw)) errors[f.key] = 'Choose one of the listed options.';
        else value[f.key] = raw;
        break;
      case 'url':
        if (!/^https:\/\//i.test(raw)) errors[f.key] = 'Must be an https:// link.';
        else value[f.key] = raw;
        break;
      default:
        // Strip control characters; everything is stored as text and escaped on output.
        value[f.key] = raw.replace(/[
