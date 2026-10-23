// عميل Supabase من الخادم فقط (REST مباشر بدون مكتبات). المفتاح السري بالصيغة الجديدة sb_secret_ يُرسل في الهيدر apikey فقط.
// RLS مفعّل بدون policies، فالوصول الوحيد من هنا بالمفتاح السري، والمفتاح ما يوصل للمتصفح أبدًا.
const crypto = require('crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{3,64}$/;
const ready = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
const q = v => encodeURIComponent(String(v));
const newToken = () => crypto.randomBytes(18).toString('base64url');

async function sb(method, path, { body, prefer, timeout = 8000 } = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const headers = { apikey: process.env.SUPABASE_SERVICE_KEY, 'content-type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(process.env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: c.signal });
    const txt = await r.text();
    let data = null; try { data = txt ? JSON.parse(txt) : null } catch (e) { data = txt }
    if (!r.ok) { const e = new Error((data && data.message) || 'db ' + r.status); e.status = r.status; e.code = data && data.code; throw e }
    return data;
  } finally { clearTimeout(t) }
}

const db = {
  select: (table, query) => sb('GET', table + '?' + query),
  insert: (table, rows) => sb('POST', table, { body: rows, prefer: 'return=representation' }),
  update: (table, filter, patch) => sb('PATCH', table + '?' + filter, { body: patch, prefer: 'return=representation' }),
  remove: (table, filter) => sb('DELETE', table + '?' + filter, { prefer: 'return=minimal' }),
};

// التحقق من الأسرة: family_id + dash_token معًا
async function family(id, token) {
  if (!UUID.test(String(id || '')) || !TOKEN.test(String(token || ''))) return null;
  const rows = await db.select('families', `id=eq.${q(id)}&dash_token=eq.${q(token)}&select=id,dash_token,is_demo,household_size,cook_language,city&limit=1`);
  return (rows && rows[0]) || null;
}

// التحقق بالرمز وحده (للوحة الأسرة: الصفحة ما تعرف family_id). نستخدمه فقط لإجراءات الثلاجة.
async function familyByToken(token) {
  if (!TOKEN.test(String(token || ''))) return null;
  const rows = await db.select('families', `dash_token=eq.${q(token)}&select=id,dash_token,is_demo,household_size,cook_language,city&limit=1`);
  return (rows && rows[0]) || null;
}

// أدوات تحقق من المدخلات
const str = (x, n) => { const s = String(x == null ? '' : x).trim().slice(0, n); return s || null };
const num = (x, min, max) => { if (x === '' || x == null) return null; const v = Number(x); return isFinite(v) && v >= min && v <= max ? v : null };
const int = (x, min, max) => { const v = num(x, min, max); return v == null ? null : Math.round(v) };
const oneOf = (x, list) => (list.includes(x) ? x : null);

module.exports = { db, ready, family, familyByToken, newToken, q, UUID, TOKEN, str, num, int, oneOf };
