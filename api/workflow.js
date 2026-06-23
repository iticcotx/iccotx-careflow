// Secure server-side endpoint: generates a 9-stage ED workflow with Claude.
// The Anthropic API key stays in process.env (never sent to the browser).
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'AI not configured (no ANTHROPIC_API_KEY set).' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const complaint = ((body && body.complaint) || '').toString().trim().slice(0, 120);
  if (!complaint) return res.status(400).json({ error: 'complaint required' });

  const STAGES = ['triage','nursing','labs','imaging','meds','reassess','dispo','discharge','followup'];
  const tool = {
    name: 'emit_workflow',
    description: 'Return a structured 9-stage emergency-department order-set workflow.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise chief-complaint title' },
        summary: { type: 'string', description: 'One-line scope (e.g. differential / setting)' },
        acuity: { type: 'string', description: 'Typical ESI range, e.g. "2-3"' },
        stages: {
          type: 'object',
          properties: Object.fromEntries(STAGES.map(s => [s, { type: 'array', items: { type: 'string' } }])),
          required: STAGES
        },
        redflags: { type: 'array', items: { type: 'string' }, description: 'Escalate/transfer triggers' }
      },
      required: ['title', 'stages', 'redflags']
    }
  };

  const system = `You are an emergency-medicine clinical decision-support assistant for a Texas freestanding ER (FSED).
For the given chief complaint, produce a standardized order-set workflow across exactly these 9 stages: Triage, Nursing, Labs, Imaging, Medications, Reassessment, Disposition, Discharge, Follow-Up.
Guidance: adult-focused, evidence-based (ACEP/AHA/IDSA/Surviving Sepsis style), concise bullet items (3-7 per stage), mark optional items with * and "if indicated". Include realistic meds with typical adult doses where appropriate. This is decision support and does NOT replace physician judgment. Output ONLY via the emit_workflow tool.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 2000,
        system,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'emit_workflow' },
        messages: [{ role: 'user', content: `Chief complaint: "${complaint}"` }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Anthropic error', detail: data });
    const block = (data.content || []).find(c => c.type === 'tool_use');
    if (!block) return res.status(502).json({ error: 'No workflow returned' });
    return res.status(200).json(block.input);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
