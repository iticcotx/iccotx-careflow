import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = 'C:/Users/imada/Desktop/ICCOTX-Protocols';
const SRC = [
  { dir: BASE + '/data', setting: 'ER' },
  { dir: BASE + '/data-uc', setting: 'Urgent Care' }
];
const OUT = BASE + '/catalog.json';
const STAGE_KEYS = ['triage','nursing','keyOrders','labs','imaging','meds','reassess','disposition','discharge','followup'];

// Top 10 per setting — matched by name keyword (case-insensitive substring), in rank order.
const TOP = {
  'ER': ['chest pain','shortness of breath','abdominal pain (general','headache','suspected stroke','sepsis','syncope','nausea & vomiting','fever','low back pain'],
  'Urgent Care': ['upper respiratory','sore throat','urinary tract','sprain','laceration','rash','ear pain','influenza','nausea','mild allergic']
};

let all = [], report = [];
for (const { dir, setting } of SRC) {
  if (!existsSync(dir)) { report.push(`${setting}: dir missing (${dir})`); continue; }
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const f of files) {
    try {
      const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!Array.isArray(arr)) { report.push(`${setting}/${f}: NOT ARRAY`); continue; }
      let bad = 0;
      for (const w of arr) {
        if (!w.id || !w.name || !w.category) { bad++; continue; }
        w.setting = setting;
        w.stages = w.stages || {};
        for (const k of STAGE_KEYS) if (!Array.isArray(w.stages[k])) w.stages[k] = [];
        if (!Array.isArray(w.redFlags)) w.redFlags = [];
        if (!Array.isArray(w.compliance)) w.compliance = [];
        if (!Array.isArray(w.synonyms)) w.synonyms = [];
        w.top = 0;
        all.push(w);
      }
      report.push(`${setting}/${f}: ${arr.length}${bad ? ` (${bad} skipped)` : ''}`);
    } catch (e) { report.push(`${setting}/${f}: PARSE ERROR -> ${e.message}`); }
  }
}
// de-dupe by setting+id
const seen = new Set();
all = all.filter(w => { const k = w.setting + '|' + w.id; if (seen.has(k)) return false; seen.add(k); return true; });
// assign Top ranks
for (const setting of Object.keys(TOP)) {
  const items = all.filter(w => w.setting === setting);
  TOP[setting].forEach((kw, i) => {
    const hit = items.find(w => w.name.toLowerCase().includes(kw) && !w.top);
    if (hit) hit.top = i + 1; else report.push(`${setting}: TOP keyword not matched -> "${kw}"`);
  });
}
writeFileSync(OUT, JSON.stringify(all));
console.log(report.join('\n'));
console.log('---');
for (const s of [...new Set(all.map(w => w.setting))]) {
  console.log(`${s}: ${all.filter(w => w.setting === s).length} workflows, top=${all.filter(w => w.setting === s && w.top).length}`);
}
console.log('TOTAL ' + all.length + ' | bytes ' + readFileSync(OUT, 'utf8').length);
