// أسرة تجريبية للعرض (dash_token = 'demo'): 30 يوم بيانات واقعية. محمية بـ SEED_SECRET.
// POST /api/seed  (هيدر x-seed-secret)  ← ينشئها لو غير موجودة.  وللإعادة من الصفر: {"reset": true}
const crypto = require('crypto');
const { limited } = require('./_util');
const { db, ready } = require('./_db');
const { rule, safety } = require('./_prices');

const secretOk = given => {
  if (!process.env.SEED_SECRET) return false;
  const h = s => crypto.createHash('sha256').update(String(s || '')).digest();
  return crypto.timingSafeEqual(h(given), h(process.env.SEED_SECRET));
};
// مولّد أرقام عشوائية ثابت: نفس البيانات في كل مرة
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// أطباق سعودية وأصنافها (نطاق الجرامات للبواقي)
const DISHES = [
  { dish: 'كبسة دجاج', items: [['رز', 350, 750], ['دجاج', 150, 420]], next: 'كبسة باقية بالخضار' },
  { dish: 'جريش', items: [['جريش', 300, 700], ['لحم', 100, 300]], next: 'جريش بالحليب' },
  { dish: 'مرقوق', items: [['مرقوق', 300, 650], ['لحم', 80, 250]], next: null },
  { dish: 'شكشوكة', items: [['شكشوكة', 200, 450], ['خبز', 60, 160]], next: null },
  { dish: 'صالونة', items: [['صالونة', 250, 550], ['رز', 250, 600]], next: 'رز بالصالونة' },
  { dish: 'مقلوبة', items: [['مقلوبة', 400, 800], ['سلطة', 80, 200]], next: null },
  { dish: 'خبز وتميس', items: [['تميس', 80, 220], ['خبز', 60, 160]], next: null },
  { dish: 'فواكه', items: [['فواكه', 120, 350]], next: null },
];
const MEAL_STATUS = { eaten: 'eaten', half: 'partly_eaten', thrown: 'thrown', donated: 'donated' };
const POTS = [  // قدور عزايم: تُتبرع كاملة
  { daysAgo: 24, dish: 'كبسة لحم', items: [['رز', 4200], ['لحم', 1800]], method: 'call' },
  { daysAgo: 14, dish: 'جريش', items: [['جريش', 3600], ['لحم', 1500]], method: 'whatsapp' },
  { daysAgo: 6, dish: 'مندي', items: [['مندي', 3800], ['لحم', 1600]], method: 'call' },
];
const GATHERINGS = [{ daysAgo: 25, guests: 25 }, { daysAgo: 7, guests: 40 }];

function build(now) {
  const R = rng(20260101), H = 36e5, D = 864e5;
  const meals = [], donations = [], gatherings = [];
  const at = (daysAgo, hourLocal) => { const d = new Date(now - daysAgo * D); d.setUTCHours(Math.floor(hourLocal) - 3, Math.round((hourLocal % 1) * 60), 0, 0); return d.getTime() };
  const iso = ms => new Date(ms).toISOString();
  const mk = (created, dish, items, status, closed, next) => {
    const total = items.reduce((s, i) => s + i.grams, 0), value = items.reduce((s, i) => s + i.value_sar, 0);
    items.forEach(i => { if (i.outcome) i.removed_at = closed ? iso(closed) : null });
    meals.push({ meal: { dish_name: dish, source: 'demo', analyzed_via: 'demo', engine_meal_id: null, total_grams: total, total_value_sar: Math.round(value * 100) / 100, servings_left: Math.round(total / 300), next_day_suggestion: next || null, status, created_at: iso(created), closed_at: closed ? iso(closed) : null }, items });
    return meals.length - 1;
  };
  // مدة الحفظ والتصنيف والمصدر من قاعدة سلامة الغذاء (نفس منطق البوت)
  const item = (name, grams, created, outcome, storage = 'fridge') => {
    const r = rule(name), s = safety(name, { storage, from: new Date(created) });
    return { name, grams, value_sar: Math.round(grams * r.price / 10) / 100, safe_until: s.safe_until, state: 'باقي', confidence: Math.round((0.8 + R() * 0.15) * 100) / 100, outcome,
      storage, food_category: s.food_category, cooked_at: iso(created - H), stored_at: iso(created), safety_source: s.safety_source, removed_at: null };
  };

  const potDays = POTS.map(p => p.daysAgo);
  for (let d = 29; d >= 1; d--) {
    const t = (29 - d) / 28;                          // 0 = أقدم يوم، 1 = أحدث يوم
    const factor = (1.15 - 0.6 * t) * (0.85 + 0.3 * R());   // البواقي تقل مع الأيام (أثر «مقدار»)
    const pThrown = d <= 8 ? 0 : 0.22 - 0.19 * t;   // آخر أسبوع بلا رمي (تظهر شارة «7 أيام بلا رمي»)
    const slots = R() < 0.5 ? [13 + R() * 1.5, 20.5 + R() * 1.5] : [R() < 0.7 ? 13 + R() * 1.5 : 20.5 + R() * 1.5];
    for (const hour of slots) {
      if (potDays.includes(d) && hour < 16) continue; // غداء يوم العزيمة ينحل محله قدور التبرع
      const tpl = DISHES[Math.floor(R() * DISHES.length)];
      const created = at(d, hour);
      const rr = R(), outcome = rr < pThrown ? 'thrown' : rr < pThrown + 0.15 ? 'half' : 'eaten';
      const items = tpl.items.map(([n, lo, hi]) => item(n, Math.max(40, Math.round((lo + (hi - lo) * R()) * factor)), created, outcome));
      mk(created, tpl.dish, items, MEAL_STATUS[outcome], created + (8 + R() * 22) * H, tpl.next);
    }
  }
  // أكل انتهت مدته قبل ما ينأكل (يظهر في مؤشر «انتهى قبل ما ينأكل»)
  for (const [d, dish, list] of [[12, 'صالونة', [['صالونة', 420]]], [9, 'سلطة', [['سلطة', 260]]]]) {
    const created = at(d, 14); mk(created, dish, list.map(([n, g]) => item(n, g, created, 'expired')), 'thrown', created + 3 * D, null);
  }
  for (const p of POTS) {
    const created = at(p.daysAgo, 16);
    const items = p.items.map(([n, g]) => item(n, g, created, 'donated'));
    const mi = mk(created, p.dish, items, 'donated', created + 3 * H, null);
    donations.push({ mealIdx: mi, row: { charity_name: 'طعامي لحفظ النعمة', charity_city: 'بريدة', distance_km: 27, grams: items.reduce((s, i) => s + i.grams, 0), cooked_window: 'أقل من ساعتين', contact_method: p.method, status: 'agreed', created_at: iso(created + H) } });
  }
  for (const g of GATHERINGS) gatherings.push({ guests_min: g.guests, guests_max: g.guests, rice_kg: Math.round(g.guests * 0.24 * 10) / 10, meat_kg: Math.round(g.guests * 0.12 * 10) / 10, created_at: iso(at(g.daysAgo, 12)) });

  // اليوم: وجبتان في الثلاجة (واحدة قريبة من انتهاء الصلاحية عشان يظهر التحذير)
  const fridge = (agoH, dish, list) => { const created = now - agoH * H; const items = list.map(([n, g, leftH]) => ({ ...item(n, g, created, null), safe_until: iso(now + leftH * H) })); mk(created, dish, items, 'in_fridge', null, 'كبسة باقية بالخضار'); };
  // مرقوق بالفريزر (فيه آيقونة الفريزر وعدّاد بالأيام)
  { const created = now - 5 * D; mk(created, 'مرقوق', [item('مرقوق', 1800, created, null, 'freezer')], 'in_fridge', null, null); }
  fridge(22, 'صالونة', [['رز', 300, 9], ['صالونة', 380, 50]]);
  fridge(4, 'كبسة دجاج', [['رز', 520, 20], ['دجاج', 280, 68]]);
  return { meals, donations, gatherings };
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 5)) return;
  const b = req.body || {};
  if (!secretOk(req.headers['x-seed-secret'] || b.secret)) return res.status(401).json({ error: 'unauthorized' });
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  try {
    const ex = await db.select('families', 'dash_token=eq.demo&select=id&limit=1');
    let famId = ex[0] && ex[0].id;
    if (famId && !b.reset) return res.status(200).json({ ok: true, existed: true, note: 'أرسل {"reset": true} لإعادة البناء' });
    if (famId) {  // مسح بيانات الأسرة التجريبية فقط (بالترتيب بسبب المفاتيح الأجنبية)
      const old = await db.select('meals', `family_id=eq.${famId}&select=id`);
      await db.remove('donations', `family_id=eq.${famId}`); await db.remove('gatherings', `family_id=eq.${famId}`); await db.remove('events', `family_id=eq.${famId}`);
      for (let i = 0; i < old.length; i += 40) await db.remove('meal_items', `meal_id=in.(${old.slice(i, i + 40).map(m => m.id).join(',')})`);
      await db.remove('meals', `family_id=eq.${famId}`);
      await db.update('families', `id=eq.${famId}`, { household_size: 6, cook_language: 'عربي', city: 'عنيزة', lat: 26.084, lng: 43.993, is_demo: true, last_seen_at: new Date().toISOString() });
    } else {
      const f = await db.insert('families', { dash_token: 'demo', household_size: 6, cook_language: 'عربي', city: 'عنيزة', lat: 26.084, lng: 43.993, is_demo: true, last_seen_at: new Date().toISOString() });
      famId = f[0].id;
    }
    const data = build(Date.now());
    const inserted = await db.insert('meals', data.meals.map(m => ({ family_id: famId, ...m.meal })));   // يرجع بنفس الترتيب
    const allItems = [];
    data.meals.forEach((m, idx) => m.items.forEach(i => allItems.push({ meal_id: inserted[idx].id, ...i })));
    await db.insert('meal_items', allItems);
    await db.insert('donations', data.donations.map(d => ({ family_id: famId, meal_id: inserted[d.mealIdx].id, ...d.row })));
    await db.insert('gatherings', data.gatherings.map(g => ({ family_id: famId, ...g })));
    return res.status(200).json({ ok: true, reset: !!ex[0], counts: { meals: inserted.length, items: allItems.length, donations: data.donations.length, gatherings: data.gatherings.length } });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable', detail: String(e && e.message || e).slice(0, 160) });
  }
};
