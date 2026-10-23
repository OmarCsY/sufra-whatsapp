// أداة مشتركة: نداء Gemini من الخادم فقط (المفتاح في متغيرات Vercel، لا يصل للمتصفح)
const MODELS = () => [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite']
  .filter((m, i, a) => m && a.indexOf(m) === i);

async function fetchT(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

async function gemini(body, { timeout = 20000 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  let lastErr;
  for (const m of MODELS()) {
    try {
      const r = await fetchT(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      }, timeout);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = new Error(`${m} ${r.status} ${(j.error && j.error.message) || ''}`.slice(0, 300)); continue; }
      const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
      const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
      if (!text) { lastErr = new Error(`${m} empty`); continue; }
      return { text, model: m };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('no model');
}

function parseJSON(t) {
  if (!t) return null;
  try { return JSON.parse(String(t).replace(/```json|```/g, '').trim()); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  return null;
}

module.exports = { gemini, parseJSON, fetchT };
