/**
 * All D1 access for the staff admin. Every value reaching SQL goes through
 * `.bind()`; every identifier (table, sort column) is chosen from a fixed
 * allow-list. There is no string concatenation of user input into SQL anywhere.
 */

export type Entity = 'applications' | 'enquiries';

export const ENTITIES: Entity[] = ['applications', 'enquiries'];

export const STATUSES: Record<Entity, readonly string[]> = {
  applications: ['new', 'reviewing', 'interview', 'placed', 'rejected', 'archived'],
  enquiries: ['new', 'in_progress', 'responded', 'closed', 'spam'],
};

/** Columns the UI is allowed to sort by, per entity. */
const SORTABLE: Record<Entity, readonly string[]> = {
  applications: ['created_at', 'updated_at', 'last_name', 'status', 'role_applied', 'state'],
  enquiries: ['created_at', 'updated_at', 'name', 'status', 'enquiry_type', 'organization'],
};

/** Columns free-text search scans, per entity. */
const SEARCHABLE: Record<Entity, readonly string[]> = {
  applications: [
    'first_name', 'last_name', 'email', 'phone', 'city', 'state',
    'role_applied', 'license_type', 'license_state', 'message', 'staff_notes',
  ],
  enquiries: ['name', 'email', 'phone', 'organization', 'subject', 'message', 'staff_notes'],
};

/** Columns the staff list view returns. Deliberately excludes license_number. */
const LIST_COLUMNS: Record<Entity, string> = {
  applications:
    'id, created_at, updated_at, first_name, last_name, email, phone, city, state, ' +
    'role_applied, license_type, license_state, years_experience, availability, ' +
    'shift_preference, status, assigned_to, source_page, utm_source',
  enquiries:
    'id, created_at, updated_at, name, email, phone, organization, enquiry_type, ' +
    'subject, status, assigned_to, source_page, utm_source',
};

export function isEntity(v: unknown): v is Entity {
  return typeof v === 'string' && (ENTITIES as string[]).includes(v);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/* ───────────────────────────── list / search / paginate ──────────────────── */

export type ListQuery = {
  entity: Entity;
  q?: string;
  status?: string;
  type?: string;   // enquiry_type (enquiries) or role_applied (applications)
  from?: string;   // YYYY-MM-DD inclusive
  to?: string;     // YYYY-MM-DD inclusive
  page?: number;
  per?: number;
  sort?: string;
  dir?: string;
};

export type ListResult<T = Record<string, unknown>> = {
  rows: T[];
  total: number;
  page: number;
  per: number;
  pages: number;
  counts: Record<string, number>;
};

export async function listSubmissions(db: D1Database, input: ListQuery): Promise<ListResult> {
  const entity = input.entity;

  const page = Math.max(1, Math.floor(Number(input.page) || 1));
  const per = Math.min(100, Math.max(5, Math.floor(Number(input.per) || 25)));
  const offset = (page - 1) * per;

  const sort = SORTABLE[entity].includes(String(input.sort)) ? String(input.sort) : 'created_at';
  const dir = String(input.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const where: string[] = [];
  const params: unknown[] = [];

  const q = (input.q || '').trim();
  if (q) {
    const like = `%${q.toLowerCase()}%`;
    const cols = SEARCHABLE[entity];
    where.push(`(${cols.map((c) => `LOWER(COALESCE(${c},'')) LIKE ?`).join(' OR ')})`);
    cols.forEach(() => params.push(like));
  }

  const status = (input.status || '').trim();
  if (status && status !== 'all' && STATUSES[entity].includes(status)) {
    where.push('status = ?');
    params.push(status);
  }

  const type = (input.type || '').trim();
  if (type && type !== 'all') {
    where.push(entity === 'enquiries' ? 'enquiry_type = ?' : 'role_applied = ?');
    params.push(type);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input.from || '')) {
    where.push('created_at >= ?');
    params.push(`${input.from}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.to || '')) {
    where.push('created_at <= ?');
    params.push(`${input.to}T23:59:59.999Z`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rowsStmt = db
    .prepare(
      `SELECT ${LIST_COLUMNS[entity]} FROM ${entity} ${whereSql} ` +
        `ORDER BY ${sort} ${dir} LIMIT ? OFFSET ?`
    )
    .bind(...params, per, offset);

  const countStmt = db
    .prepare(`SELECT COUNT(*) AS n FROM ${entity} ${whereSql}`)
    .bind(...params);

  // Status tallies ignore the status filter so the tab badges stay stable.
  const statusStmt = db.prepare(`SELECT status, COUNT(*) AS n FROM ${entity} GROUP BY status`);

  const [rowsRes, countRes, statusRes] = await db.batch([rowsStmt, countStmt, statusStmt]);

  const total = Number((countRes.results?.[0] as { n?: number })?.n ?? 0);
  const counts: Record<string, number> = {};
  for (const r of (statusRes.results ?? []) as { status: string; n: number }[]) {
    counts[r.status] = Number(r.n);
  }

  return {
    rows: (rowsRes.results ?? []) as Record<string, unknown>[],
    total,
    page,
    per,
    pages: Math.max(1, Math.ceil(total / per)),
    counts,
  };
}

export async function getSubmission(db: D1Database, entity: Entity, id: string) {
  return db.prepare(`SELECT * FROM ${entity} WHERE id = ?`).bind(id).first();
}

/* ───────────────────────────────── mutations ─────────────────────────────── */

export async function updateSubmission(
  db: D1Database,
  entity: Entity,
  id: string,
  patch: { status?: string; assigned_to?: string | null; staff_notes?: string | null }
): Promise<boolean> {
  const sets: string[] = ['updated_at = ?'];
  const params: unknown[] = [nowIso()];

  if (patch.status !== undefined) {
    if (!STATUSES[entity].includes(patch.status)) throw new Error('Invalid status');
    sets.push('status = ?');
    params.push(patch.status);
  }
  if (patch.assigned_to !== undefined) {
    sets.push('assigned_to = ?');
    params.push(patch.assigned_to ? String(patch.assigned_to).slice(0, 120) : null);
  }
  if (patch.staff_notes !== undefined) {
    sets.push('staff_notes = ?');
    params.push(patch.staff_notes ? String(patch.staff_notes).slice(0, 8000) : null);
  }

  const res = await db
    .prepare(`UPDATE ${entity} SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();

  return (res.meta?.changes ?? 0) > 0;
}

export async function insertRow(
  db: D1Database,
  entity: Entity,
  data: Record<string, unknown>
): Promise<string> {
  const id = data.id as string;
  const keys = Object.keys(data);
  const sql =
    `INSERT INTO ${entity} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  await db.prepare(sql).bind(...keys.map((k) => data[k] ?? null)).run();
  return id;
}

/* ─────────────────────────────────── audit ───────────────────────────────── */

export async function audit(
  db: D1Database,
  entry: { actor: string; action: string; entity?: string; entityId?: string; detail?: string }
): Promise<void> {
  try {
    await db
      .prepare(
        'INSERT INTO admin_audit (created_at, actor_email, action, entity, entity_id, detail) ' +
          'VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(nowIso(), entry.actor, entry.action, entry.entity ?? null, entry.entityId ?? null, entry.detail ?? null)
      .run();
  } catch {
    // Auditing must never break the request it is recording.
  }
}

/* ──────────────────────────────── throttling ─────────────────────────────── */

/** Returns true when the caller is over the limit. Window is in minutes. */
export async function isThrottled(
  db: D1Database,
  ipHash: string,
  form: string,
  limit = 5,
  windowMinutes = 60
): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM submission_throttle WHERE ip_hash = ? AND form = ? AND created_at > ?'
    )
    .bind(ipHash, form, since)
    .first<{ n: number }>();

  if (Number(row?.n ?? 0) >= limit) return true;

  await db.batch([
    db.prepare('INSERT INTO submission_throttle (ip_hash, form, created_at) VALUES (?, ?, ?)')
      .bind(ipHash, form, nowIso()),
    db.prepare('DELETE FROM submission_throttle WHERE created_at < ?')
      .bind(new Date(Date.now() - 24 * 60 * 60_000).toISOString()),
  ]);

  return false;
}

/** Hash the IP rather than storing it — same throttling value, less PII at rest. */
export async function hashIp(ip: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
