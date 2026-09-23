/** POST /api/budget { action: generate|afford } */
const APP_ORIGIN = 'https://rccg-kingdom-parish-app.pages.dev';
const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: CORS });
const err = (message, status = 400) => ok({ error: message }, status);

async function setting(DB, key) {
  try {
    const row = await DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first();
    if (!row?.value) return '';
    try { return JSON.parse(row.value); } catch { return String(row.value); }
  } catch { return ''; }
}

function coercePlan(raw, pack) {
  const lines = Array.isArray(raw?.lines) ? raw.lines.map(l => ({
    key: String(l.key || l.expenseCategory || 'other'),
    label: String(l.label || l.key || 'Item'),
    amount: Math.max(0, Math.round(Number(l.amount || 0))),
    cadence: ['usual', 'occasional', 'annual', 'once'].includes(l.cadence) ? l.cadence : 'usual',
    why: String(l.why || ''),
    expenseCategory: String(l.expenseCategory || l.key || 'other'),
  })).filter(l => l.amount > 0) : [];
  const cushion = Math.max(0, Math.round(Number(raw?.cushion || 0)));
  const recommendedBudget = lines.reduce((s, l) => s + l.amount, 0) + cushion;
  const parish = Math.round(Number(pack?.expectedParishIncome ?? raw?.expectedParishIncome ?? 0));
  const remittance = Math.round(Number(pack?.expectedRemittance ?? raw?.expectedRemittance ?? 0));
  let statusLabel = raw?.statusLabel;
  if (!['enough', 'tight', 'short'].includes(statusLabel)) {
    statusLabel = recommendedBudget > parish ? 'short' : recommendedBudget > parish * 0.95 ? 'tight' : 'enough';
  }
  return {
    monthKey: String(raw?.monthKey || pack?.monthKey || ''),
    expectedGrossIncome: Math.round(Number(pack?.expectedGrossIncome ?? 0)),
    expectedRemittance: remittance,
    expectedParishIncome: parish,
    recommendedBudget,
    cushion,
    statusLabel,
    summary: String(raw?.summary || ''),
    ignored: Array.isArray(raw?.ignored) ? raw.ignored.map(String) : [],
    remittanceStrip: { label: 'Already spoken for (RCCG remittance)', amount: remittance },
    lines,
  };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI did not return JSON');
  return JSON.parse(body.slice(start, end + 1));
}

async function chat(DB, env, messages) {
  const dsKey = String(await setting(DB, 'ai_deepseek_key') || '').trim();
  const dsModel = String(await setting(DB, 'ai_deepseek_model') || 'deepseek-chat').trim() || 'deepseek-chat';
  if (dsKey) {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + dsKey },
      body: JSON.stringify({ model: dsModel, messages, temperature: 0.2, max_tokens: 1800 }),
    });
    const data = await resp.json().catch(() => ({}));
    if (resp.ok && data.choices?.[0]?.message?.content) {
      return { text: data.choices[0].message.content, model: dsModel };
    }
  }
  let oaKey = String(await setting(DB, 'ai_openai_key') || '').trim();
  if (!oaKey) oaKey = String(env?.OPENAI_API_KEY || '').trim();
  if (!oaKey) throw new Error('No DeepSeek API key configured. Add it under KPSC Settings.');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + oaKey },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.2, max_tokens: 1800 }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.error?.message || 'OpenAI fallback failed');
  return { text: data.choices?.[0]?.message?.content || '', model: 'gpt-4o-mini' };
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const DB = env.DB;
  if (!DB) return err('Database binding DB not found', 503);
  try {
    if (request.method === 'GET') {
      const month = new URL(request.url).searchParams.get('month');
      const all = (await setting(DB, 'monthlyBudgets')) || {};
      return ok(month ? { plan: all[month] || null } : { plans: all });
    }
    if (request.method !== 'POST') return err('Method not allowed', 405);
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'generate';
    if (action === 'generate') {
      const pack = body.pack || {};
      const monthKey = body.monthKey || pack.monthKey;
      const sys = 'You are the parish budget advisor for RCCG Kingdom Parish. Remittance is cost-of-collections and must NEVER be listed as an operating expense. Children dept and satellite funds are not spendable. Recommend ONE exact integer naira operating budget. Ignore one-off emergencies and harvest spikes. JSON only: {"recommendedBudget":0,"cushion":0,"statusLabel":"enough|tight|short","summary":"plain English","ignored":["..."],"lines":[{"key":"power","label":"Power & Energy","amount":0,"cadence":"usual","why":"...","expenseCategory":"power"}]}. recommendedBudget must equal sum(lines)+cushion. Do not invent income; use pack.expectedParishIncome.';
      const { text, model } = await chat(DB, env, [
        { role: 'system', content: sys },
        { role: 'user', content: 'Target month: ' + monthKey + '\nHistory pack:\n' + JSON.stringify(pack).slice(0, 14000) },
      ]);
      const raw = extractJson(text);
      raw.monthKey = monthKey;
      const plan = coercePlan(raw, { ...pack, monthKey });
      plan.model = model;
      plan.historyMonthsUsed = Array.isArray(pack.months) ? pack.months.length : 6;
      return ok({ plan });
    }
    if (action === 'afford') {
      const math = body.math || {};
      let explanation = '';
      try {
        const { text } = await chat(DB, env, [
          { role: 'system', content: 'Advise a church admin officer in simple English. Remittance is not spare cash. Use the provided math. JSON only: {"explanation":"short"}' },
          { role: 'user', content: JSON.stringify({ idea: body.idea, amount: body.amount, math }) },
        ]);
        explanation = extractJson(text).explanation || text;
      } catch (e) {
        explanation = math.verdict === 'yes'
          ? 'Yes. That still fits inside the operating budget left this month.'
          : 'Not from spare parish money this month without cutting a usual line.';
      }
      return ok({ verdict: math.verdict || 'no', safeAmount: Math.round(Number(math.safeExtra || 0)), explanation: String(explanation) });
    }
    return err('Unknown action');
  } catch (e) {
    return err(e.message || String(e), 500);
  }
}
