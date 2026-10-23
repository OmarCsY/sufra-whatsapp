// أسر تجريبية للعرض والمرصد (كلها is_demo = true): أسرة العرض dash_token = 'demo' + 60 أسرة موزعة على 8 مدن. محمية بـ SEED_SECRET.
// POST /api/seed  (هيدر x-seed-secret): يمسح كل بيانات is_demo القديمة ويعيد إنشاءها. بيانات الأسر الحقيقية ما تنلمس.
const crypto = require('crypto');
const { limited } = require('./_util');
const { db, ready } = require('./_db');
const { buildAll } = require('./_seedgen');

const secretOk = given => {
  if (!process.env.SEED_SECRET) return false;
  const h = s => crypto.createHash('sha256').update(String(s || '')).digest();
  return crypto.timingSafeEqual(h(given), h(process.env.SEED_SECRET));
};
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o };
// إدخال على دفعات (نرجّع الصفوف بنفس الترتيب)
async function bulk(table, rows, size, par = 1) {
  const parts = chunk(rows, size), out = new Array(parts.length);
  for (let i = 0; i < parts.length; i += par) await Promise.all(parts.slice(i, i + par).map(async (p, k) => { out[i + k] = await db.insert(table, p, 25000) }));
  return out.flat();
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 5)) return;
  const b = req.body || {};
  if (!secretOk(req.headers['x-seed-secret'] || b.secret)) return res.status(401).json({ error: 'unauthorized' });
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  const t0 = Date.now();
  try {
    await db.remove('families', 'is_demo=eq.true');   // الحذف يتسلسل (cascade) للوجبات والأصناف والتبرعات والعزائم والأحداث
    const all = buildAll(Date.now());
    const fams = await bulk('families', all.map(f => f.family), 100);
    const mealRows = [], owner = [];
    all.forEach((f, fi) => f.meals.forEach((m, mi) => { mealRows.push({ family_id: fams[fi].id, ...m.meal }); owner.push([fi, mi]) }));
    const meals = await bulk('meals', mealRows, 700);
    const base = all.map(() => 0); let acc = 0; all.forEach((f, fi) => { base[fi] = acc; acc += f.meals.length });
    const mealId = (fi, mi) => meals[base[fi] + mi].id;
    const itemRows = [], donRows = [], gatRows = [];
    all.forEach((f, fi) => {
      f.meals.forEach((m, mi) => m.items.forEach(i => itemRows.push({ meal_id: mealId(fi, mi), ...i })));
      f.donations.forEach(d => donRows.push({ family_id: fams[fi].id, meal_id: mealId(fi, d.mealIdx), ...d.row }));
      f.gatherings.forEach(g => gatRows.push({ family_id: fams[fi].id, ...g }));
    });
    await bulk('meal_items', itemRows, 800, 3);
    await bulk('donations', donRows, 500);
    await bulk('gatherings', gatRows, 500);
    return res.status(200).json({ ok: true, families: fams.length, counts: { meals: meals.length, items: itemRows.length, donations: donRows.length, gatherings: gatRows.length }, ms: Date.now() - t0 });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable', detail: String((e && e.message) || e).slice(0, 200) });
  }
};
