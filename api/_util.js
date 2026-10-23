// أدوات مشتركة للخادم: تطبيع اللهجة السعودية، قاموس الأطباق، وحد الطلبات لكل IP

/* ---------- اللهجة السعودية ---------- */
const AR = '\\u0621-\\u064A'; // الحروف فقط (بدون علامات الترقيم العربية)
const PRE = '((?:[وفبكل]|ال|لل){0,3})';
const WORDS = [
  ['بندورة', 'طماطم'], ['أرز', 'رز'], ['ارز', 'رز'], ['معكرونة', 'مكرونة'], ['بطاطا', 'بطاطس'], ['كوسا', 'كوسة'],
  ['هلق', 'الحين'], ['هيك', 'كذا'], ['كتير', 'كثير'], ['عايز', 'ابغى'], ['ليه', 'ليش'], ['منيح', 'زين'], ['كمان', 'بعد'],
];
const RES = WORDS.map(([a, b]) => [new RegExp('(?<![' + AR + '])' + PRE + a + '(?![' + AR + '])', 'g'), b]);

// استبدال على حدود الكلمة فقط (مع قبول السوابق: ال، ب، و، ل...)
function saudi(t) {
  if (typeof t !== 'string' || !t) return t;
  let s = t;
  for (const [re, b] of RES) s = s.replace(re, (m, p) => p + b);
  return s;
}

/* ---------- قاموس الأطباق ---------- */
const DISHES = [
  [/بيض.*طماطم|طماطم.*بيض/, 'شكشوكة'],
  [/رز بخاري|رز (?:ب)?(?:ال)?دجاج/, 'كبسة دجاج'],
  [/رز (?:ب)?(?:ال)?لحم/, 'كبسة لحم'],
  [/قمح مطحون/, 'جريش'],
  [/رقائق خبز/, 'مرقوق'],
  [/رز مقلوب/, 'مقلوبة'],
  [/فول مدمس/, 'فول'],
];
function dish(name) {
  const s = saudi(String(name == null ? '' : name).trim());
  for (const [re, v] of DISHES) if (re.test(s)) return v;
  return s.replace(/(^|\s)كبد(?=\s|$)/g, '$1كبدة');
}
// استنتاج اسم الطبق من الأصناف لو المحرك ما رجّعه
function inferDish(items) {
  const names = items.map(i => i.name);
  const has = k => names.some(n => n.includes(k));
  if (has('شكشوكة') || (has('بيض') && has('طماطم'))) return 'شكشوكة';
  if (has('رز') && has('دجاج')) return 'كبسة دجاج';
  if (has('رز') && has('لحم')) return 'كبسة لحم';
  return null;
}

function clientIp(req) { return String((req.headers && req.headers['x-forwarded-for']) || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim() || '?' }

/* ---------- حد الطلبات: 20 طلب بالدقيقة لكل IP (في الذاكرة) ---------- */
const hits = new Map();
function limited(req, res, max = 20) {
  const key = clientIp(req);
  const now = Date.now();
  const a = (hits.get(key) || []).filter(t => now - t < 60000);
  if (a.length >= max) {
    hits.set(key, a);
    res.setHeader('retry-after', String(Math.max(1, Math.ceil((60000 - (now - a[0])) / 1000))));
    res.status(429).json({ error: 'rate_limited' });
    return true;
  }
  a.push(now); hits.set(key, a);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60000) hits.delete(k);
  return false;
}

module.exports = { saudi, dish, inferDish, limited, clientIp };
