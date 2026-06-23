import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DIR = 'C:/Users/imada/Desktop/ICCOTX-Protocols/data';
const OUT = 'C:/Users/imada/Desktop/ICCOTX-Protocols/catalog.json';
const STAGE_KEYS = ['triage','nursing','keyOrders','labs','imaging','meds','reassess','disposition','discharge','followup'];

let all = [];
let report = [];
const files = readdirSync(DIR).filter(f => f.endsWith('.json'));
for (const f of files) {
  try {
    const arr = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
    if (!Array.isArray(arr)) { report.push(`${f}: NOT AN ARRAY`); continue; }
    let bad = 0;
    for (const w of arr) {
      if (!w.id || !w.name || !w.category) { bad++; continue; }
      w.stages = w.stages || {};
      for (const k of STAGE_KEYS) if (!Array.isArray(w.stages[k])) w.stages[k] = [];
      if (!Array.isArray(w.redFlags)) w.redFlags = [];
      if (!Array.isArray(w.compliance)) w.compliance = [];
      if (!Array.isArray(w.synonyms)) w.synonyms = [];
      all.push(w);
    }
    report.push(`${f}: ${arr.length} items${bad ? ' ('+bad+' malformed skipped)' : ''}`);
  } catch (e) {
    report.push(`${f}: PARSE ERROR -> ${e.message}`);
  }
}
// de-dupe ids
const seen = new Set();
all = all.filter(w => { if (seen.has(w.id)) return false; seen.add(w.id); return true; });

writeFileSync(OUT, JSON.stringify(all));
console.log(report.join('\n'));
console.log('---');
console.log('TOTAL workflows: ' + all.length);
console.log('Categories: ' + [...new Set(all.map(w => w.category))].length);
console.log('catalog.json bytes: ' + readFileSync(OUT, 'utf8').length);
