import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = 'C:/Users/imada/Desktop/ICCOTX-Protocols';
const SRC = [
  { dir: BASE + '/data', setting: 'ER' },
  { dir: BASE + '/data-uc', setting: 'Urgent Care' }
];
const OUT = BASE + '/catalog.json';
const STAGE_KEYS = ['triage','nursing','keyOrders','labs','imaging','meds','reassess','disposition','discharge','followup'];

// Urgent Care Top 10 — matched by name keyword.
const UC_TOP = ['upper respiratory','sore throat','urinary tract','sprain','laceration','rash','ear pain','influenza','nausea','mild allergic'];

// ===== ER TOP 10 — EXACT content transcribed from ICCOTX_FSER_Clinical_Protocols.pdf =====
const ER_TOP = [
  { id:'chest-pain', name:'Chest Pain / Chest Discomfort', category:'Cardiovascular', top:1, acuity:'2',
    synonyms:['chest pain','chest discomfort','acs','angina','heart attack','chest pressure'],
    summary:'Cardiac risk, ACS, PE, dissection', replaces:['chest pain'],
    redFlags:['Crushing pain or radiation','Diaphoresis or syncope','Abnormal vitals or ECG','Known CAD or stents'],
    stages:{ keyOrders:['Cardiac monitor','12-lead ECG in 10 min','IV access x1-2','Repeat vitals q15-30 min','O2 if SpO2 <94%'],
      labs:['CBC, CMP','Troponin x2, repeat per protocol','BNP, PT/INR/PTT','D-dimer if indicated','Lipase when GI overlap'],
      imaging:['Chest X-ray','CTA chest if PE/dissection concern'],
      meds:['Aspirin 324 mg chewable','Nitroglycerin SL if appropriate','GI cocktail or reflux suspicion','Morphine or fentanyl PRN'],
      disposition:['Discharge with cards follow-up when low risk','Observation or transfer if ACS'] },
    riskTools:['HEART score','Wells criteria / PERC'] },

  { id:'migraine-headache', name:'Migraine / Headache', category:'Neurological', top:2, acuity:'3',
    synonyms:['headache','migraine','head pain','cephalgia','worst headache'],
    summary:'Red flags, cocktail, neuro screen', replaces:['headache'],
    redFlags:['Worst headache of life','Neuro deficits or altered mental status','Fever or meningismus','Trauma or anticoagulation'],
    stages:{ keyOrders:['Dark, quiet room','IV access','Neuro checks','Fall precautions when sedating meds are used'],
      labs:['CBC, CMP','Pregnancy test if applicable'],
      imaging:['CT head without contrast if red flag','CTA/MRI selectively'],
      meds:['Migraine cocktail: IV fluids','Metoclopramide','Diphenhydramine','Ketorolac','Magnesium sulfate PRN','Dexamethasone'],
      disposition:['Neurology referral if recurrent','Return precautions for neurologic symptoms'] } },

  { id:'uri-shortness-of-breath', name:'URI / Shortness of Breath', category:'Respiratory', top:3, acuity:'2-3',
    synonyms:['shortness of breath','sob','dyspnea','uri','cough','asthma','copd','pneumonia','cant breathe','breathing'],
    summary:'Respiratory distress and infection', replaces:['shortness of breath'],
    includes:['Viral URI, influenza, COVID','Asthma, bronchitis','COPD exacerbation','Pneumonia'],
    redFlags:['Severe respiratory distress','Hypoxia','Chest pain with dyspnea','Sepsis signs or altered mental status'],
    stages:{ keyOrders:['Pulse oximetry','Cardiac monitor if severe','Respiratory assessment','Nebulizer readiness'],
      labs:['CBC, CMP','COVID/Flu/RSV PCR','BNP/troponin as indicated','Lactate','Blood cultures if sepsis concern'],
      imaging:['Chest X-ray','CTA chest if PE concern'],
      meds:['DuoNeb/albuterol','Steroids, magnesium','Oxygen therapy'],
      disposition:['Home with instructions when stable','Admission or transfer if severe','Asthma action plan'] } },

  { id:'gi-stomach-issues', name:'GI / Stomach Issues', category:'Gastrointestinal', top:4, acuity:'3',
    synonyms:['abdominal pain','stomach pain','belly pain','nausea','vomiting','diarrhea','pancreatitis','gi'],
    summary:'Abdominal pain, N/V/D, pancreatitis', replaces:['abdominal pain (general'],
    includes:['Nausea/vomiting, gastritis','Gastroenteritis','Appendicitis, diverticulitis','Gallbladder disease','Pancreatitis'],
    redFlags:['Peritoneal signs','GI bleeding','Persistent hypotension','Severe dehydration','Concern for surgical abdomen'],
    stages:{ keyOrders:['NPO','IV fluids','Pain and nausea control'],
      labs:['CBC, CMP, lipase','UA, pregnancy test','Lactate when indicated'],
      imaging:['CT abdomen/pelvis','RUQ ultrasound','Pelvic ultrasound'],
      meds:['Ondansetron','Ketorolac','GI cocktail','Antibiotics if indicated'],
      disposition:['Transfer if surgical concern','Clear return precautions'] } },

  { id:'uti', name:'UTI', category:'Genitourinary', top:5, acuity:'3',
    synonyms:['uti','dysuria','urinary','cystitis','pyelonephritis','bladder infection','burning urination'],
    summary:'Cystitis, pyelonephritis, complicated UTI', replaces:['dysuria','urinary tract infection'],
    includes:['Cystitis','Pyelonephritis','Complicated UTI'],
    redFlags:['Sepsis','Pregnancy','Obstructing stone','Immunocompromised','Persistent vomiting'],
    stages:{ keyOrders:['Urine specimen','Hydration assessment'],
      labs:['UA with reflex culture','CBC, CMP','Lactate and blood cultures if febrile'],
      imaging:['CT if obstruction or stone concern','Renal ultrasound'],
      meds:['Oral antibiotics for simple UTI','IV ceftriaxone when complicated or pyelo','Pyridium PRN','IV fluids'],
      disposition:['PCP follow-up','Culture callback workflow','Return if worsening'] } },

  { id:'kidney-stones-flank-pain', name:'Kidney Stones / Flank Pain', category:'Genitourinary', top:6, acuity:'3',
    synonyms:['kidney stone','flank pain','renal colic','stone'],
    summary:'Renal colic and infected stone screen', replaces:['flank pain','renal colic'],
    redFlags:['Obstructed infected stone','AKI or solitary kidney','Fever/sepsis','Uncontrolled pain'],
    stages:{ keyOrders:['IV access','Pain score assessment','Urine strainer'],
      labs:['UA, CBC, CMP','Creatinine'],
      imaging:['CT stone protocol','Ultrasound'],
      meds:['Ketorolac','IV fluids','Tamsulosin','Antiemetics','Opioids sparingly'],
      disposition:['Urology referral','Stone passage instructions','Return if worse or fever'] } },

  { id:'general-body-pain-fatigue-dehydration', name:'General Body Pain / Fatigue / Dehydration', category:'General / Metabolic / Infectious', top:7, acuity:'3-4',
    synonyms:['fatigue','weakness','dehydration','body pain','malaise','viral syndrome','electrolyte'],
    summary:'Viral syndrome, weakness, electrolyte imbalance', replaces:['fatigue / generalized weakness','dehydration'],
    includes:['Viral syndrome','Dehydration','Electrolyte imbalance','Weakness or fatigue'],
    redFlags:['Sepsis','Rhabdomyolysis','AKI','Cardiac symptoms','Neurologic deficits'],
    stages:{ keyOrders:['Orthostatic vitals','IV hydration assessment'],
      labs:['CBC, CMP, magnesium','CK','COVID/Flu PCR','TSH and UA when indicated'],
      meds:['IV fluids','Ketorolac or acetaminophen','Electrolyte replacement','Antipyretics'],
      disposition:['Hydration education','PCP follow-up','Return if worse'] } },

  { id:'stroke-suspected-stroke', name:'Stroke / Suspected Stroke', category:'Neurological', top:8, acuity:'1',
    synonyms:['stroke','facial droop','slurred speech','one-sided weakness','tpa','cva','fast'],
    summary:'FAST, door-to-needle, transfer readiness', replaces:['suspected stroke','stroke'],
    redFlags:['Face drooping','Arm weakness','Speech difficulty','Time to call 911 or activate protocol'],
    stages:{ keyOrders:['Activate stroke protocol','Last known well documentation','Point-of-care glucose','Neuro checks','NPO until swallow screen'],
      labs:['CBC, CMP, PT/INR/PTT','Troponin, type and screen','Pregnancy test if applicable'],
      imaging:['CT head without contrast STAT','CTA head/neck','CT perfusion if available'],
      meds:['tPA eligibility: door-to-needle 60 min if eligible','Blood pressure management per protocol'],
      disposition:['Transfer to comprehensive stroke center','Admit if post-tPA','Neurology consult'] },
    eligibility:['Ischemic vs hemorrhagic','tPA window <=4.5 hours','Mechanical thrombectomy <=24 hours when LVO suspected'] },

  { id:'orthopedic-injury-musculoskeletal', name:'Orthopedic Injury / Musculoskeletal', category:'Musculoskeletal', top:9, acuity:'3-4',
    synonyms:['fracture','sprain','dislocation','joint pain','back pain','neck pain','injury','musculoskeletal','overuse'],
    summary:'Fracture, sprain, back pain, neurovascular checks', replaces:['extremity injury'],
    includes:['Fractures','Dislocations','Sprains and strains','Joint pain','Back and neck pain','Overuse injuries'],
    redFlags:['Open fracture','Neurovascular compromise','Compartment syndrome','Spine injury','Severe deformity'],
    stages:{ keyOrders:['Pain score','Neurovascular check','Immobilize as needed','Ice/elevation','NPO if sedation likely'],
      imaging:['X-ray appropriate area','CT/MRI if needed','Ultrasound for soft tissue'],
      meds:['Acetaminophen','NSAIDs','Opioids for severe pain only','Muscle relaxants'],
      disposition:['Splint/immobilization','Ortho referral','Crutches/instructions','Return precautions'] } }
];

function normalize(w, setting){
  w.setting = setting;
  w.stages = w.stages || {};
  for (const k of STAGE_KEYS) if (!Array.isArray(w.stages[k])) w.stages[k] = [];
  for (const k of ['redFlags','compliance','synonyms','includes','riskTools','eligibility']) if (!Array.isArray(w[k])) w[k] = [];
  if (typeof w.top !== 'number') w.top = 0;
  if (typeof w.approved !== 'boolean') w.approved = false;
  return w;
}

let all = [], report = [];
for (const { dir, setting } of SRC) {
  if (!existsSync(dir)) { report.push(`${setting}: dir missing`); continue; }
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try {
      const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (!Array.isArray(arr)) { report.push(`${setting}/${f}: NOT ARRAY`); continue; }
      let bad = 0;
      for (const w of arr) { if (!w.id || !w.name || !w.category) { bad++; continue; } all.push(normalize(w, setting)); }
      report.push(`${setting}/${f}: ${arr.length}${bad ? ` (${bad} skipped)` : ''}`);
    } catch (e) { report.push(`${setting}/${f}: PARSE ERROR -> ${e.message}`); }
  }
}

// Remove ER AI entries that the PDF Top-10 protocols replace
const replaceKw = ER_TOP.flatMap(t => t.replaces || []);
const before = all.length;
all = all.filter(w => !(w.setting === 'ER' && replaceKw.some(kw => w.name.toLowerCase().includes(kw))));
report.push(`Removed ${before - all.length} ER AI entries replaced by PDF Top 10`);

// Add the exact PDF Top-10 ER protocols
ER_TOP.forEach(t => { const { replaces, ...keep } = t; const n = normalize(keep, 'ER'); n.approved = true; all.push(n); });

// de-dupe by setting+id (keep first)
const seen = new Set();
all = all.filter(w => { const k = w.setting + '|' + w.id; if (seen.has(k)) return false; seen.add(k); return true; });

// Urgent Care Top 10 by keyword
const uc = all.filter(w => w.setting === 'Urgent Care');
UC_TOP.forEach((kw, i) => { const hit = uc.find(w => w.name.toLowerCase().includes(kw) && !w.top); if (hit) hit.top = i + 1; else report.push(`UC TOP not matched -> "${kw}"`); });

writeFileSync(OUT, JSON.stringify(all));
console.log(report.join('\n'));
console.log('---');
for (const s of [...new Set(all.map(w => w.setting))])
  console.log(`${s}: ${all.filter(w => w.setting === s).length} workflows, top=${all.filter(w => w.setting === s && w.top).length}`);
console.log('TOTAL ' + all.length + ' | bytes ' + readFileSync(OUT, 'utf8').length);
