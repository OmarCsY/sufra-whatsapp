// ذكاء الثلاجة: إضافة وتحديث ونقل الأصناف، مطابقة الأسماء بتسامح إملائي، والتنبيهات.
// كل مدد الحفظ من _foodsafety.js (عبر _prices.safety) ولا يوجد جدول أيام ثاني.
const { db, q, UUID, str, num, int, oneOf } = require('./_db');
const { dish } = require('./_util');
const { priced, safety } = require('./_prices');
const fsafe = require('./_foodsafety');

const OUTCOMES = ['eaten', 'half', 'thrown', 'expired'];
const MEAL_STATUS = { eaten: 'eaten', half: 'partly_eaten', thrown: 'thrown', expired: 'thrown', donated: 'donated' };
const ITEM_COLS = 'id,name,grams,value_sar,storage,food_category,cooked_at,stored_at,safe_until,safety_source,outcome,removed_at';

/* ---------- مطابقة الأسماء ---------- */
const norm = w => String(w == null ? '' : w).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^ء-يa-z0-9 ]/gi, '').trim().replace(/^(وال|بال|فال|لل|ال)/, '').replace(/\s+/g, ' ');
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const r = [i]; for (let j = 1; j <= n; j++) r[j] = Math.min(p[j] + 1, r[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = r } return p[n] }

// يرجّع { items } لو تطابق واضح، أو { ambiguous } لو أكثر من احتمال، أو { items: [] } لو ما لقى شي
function matchItems(open, target) {
  const t = norm(target); if (!t) return { items: [] };
  const tol = t.length >= 6 ? 2 : t.length >= 4 ? 1 : 0;
  const scored = [];
  for (const i of open) {
    const n = norm(i.name), d = norm(i.dish_name);
    let s = 0, by = '';
    if (n === t) { s = 4; by = 'name' } else if (n && (n.includes(t) || t.includes(n))) { s = 3; by = 'name' } else if (n && lev(n, t) <= tol) { s = 2; by = 'name' }
    else if (d && (d === t || d.includes(t) || t.includes(d) || lev(d, t) <= tol)) { s = 1; by = 'dish' }
    if (s) scored.push({ i, s, by });
  }
  if (!scored.length) return { items: [] };
  const best = Math.max(...scored.map(x => x.s)), top = scored.filter(x => x.s === best);
  if (top[0].by === 'dish') {   // اسم طبق: كل أصناف الوجبة الوحدة، ولو أكثر من وجبة نسأل
    const meals = [...new Set(top.map(x => x.i.meal_id))];
    return meals.length === 1 ? { items: top.map(x => x.i) } : { ambiguous: top.map(x => x.i) };
  }
  const keys = new Set(top.map(x => norm(x.i.name) + '|' + x.i.meal_id));
  return keys.size === 1 || top.length === 1 ? { items: top.map(x => x.i) } : { ambiguous: top.map(x => x.i) };
}

/* ---------- القراءة ---------- */
async function loadOpen(famId) {
  const sel = `id,dish_name,status,created_at,next_day_suggestion,meal_items(${ITEM_COLS})`;
  const meals = await db.select('meals', `family_id=eq.${famId}&select=${encodeURIComponent(sel)}&order=created_at.desc&limit=300`);
  const now = Date.now(), out = [];
  for (const m of meals || []) for (const i of m.meal_items || []) {
    if (!i.storage || i.outcome || i.removed_at) continue;
    const su = i.safe_until || safety(i.name, { storage: i.storage, from: new Date(i.stored_at || m.created_at) }).safe_until;
    out.push({ ...i, id: i.id, meal_id: m.id, dish_name: m.dish_name, suggestion: m.next_day_suggestion, safe_until: su, hours_left: Math.round((Date.parse(su) - now) / 36e4) / 10 });
  }
  return out.sort((a, b) => Date.parse(a.safe_until) - Date.parse(b.safe_until));
}
function pub(i) {
  const cat = fsafe.CATEGORIES.find(c => c.id === i.food_category) || fsafe.categorize(i.name), src = fsafe.SOURCES[cat.src];
  const range = i.storage === 'freezer' ? (cat.freezer || 'شهرين (تقدير متحفظ)') : cat.fridge_range;
  const total = i.stored_at && i.safe_until ? Math.round((Date.parse(i.safe_until) - Date.parse(i.stored_at)) / 36e4) / 10 : null;
  return { item_id: i.id, meal_id: i.meal_id, name: i.name, grams: i.grams, storage: i.storage, safe_until: i.safe_until, hours_left: i.hours_left, total_hours: total, dish_name: i.dish_name || null, category: cat.label, range, source_name: src.name, source_url: src.url };
}

/* ---------- الكتابة ---------- */
async function recompute(mealId, famId) {
  const items = await db.select('meal_items', `meal_id=eq.${mealId}&select=outcome`);
  if (!items.length || items.some(i => !i.outcome)) return null;
  const set = [...new Set(items.map(i => i.outcome))];
  const status = set.length === 1 ? MEAL_STATUS[set[0]] || 'partly_eaten' : 'partly_eaten';
  await db.update('meals', `id=eq.${mealId}&family_id=eq.${famId}`, { status, closed_at: new Date().toISOString() });
  return status;
}

// إضافة أصناف من الكلام الحر أو الصوت: وجبة جديدة بالمصدر chat أو voice
async function addItems(fam, list, source) {
  const now = Date.now(), items = [];
  for (const it of (Array.isArray(list) ? list : []).slice(0, 10)) {
    const name = str(dish(it && it.name), 40); if (!name) continue;
    const storage = oneOf(it.storage, ['fridge', 'freezer']) || 'fridge';
    let grams = int(it.grams, 10, 50000), estimated = !!it.estimated;
    if (grams == null) { grams = 300; estimated = true }                       // ما ذكر الوزن: تقدير معقول ونقول إنه تقريبي
    const hrs = num(it.cooked_hours_ago, 0, 168), explicit = hrs != null;
    const cooked = new Date(now - (explicit ? hrs : 1) * 36e5), stored = new Date(now);
    const s = safety(name, { storage, from: explicit ? cooked : stored });   // لو قال متى انطبخ نحسب منه، وإلا من وقت الحفظ
    items.push({ name, grams, storage, estimated, cooked_at: cooked.toISOString(), stored_at: stored.toISOString(), safe_until: s.safe_until, food_category: s.food_category, safety_source: s.safety_source, value_sar: priced(name, grams).value_sar });
  }
  if (!items.length) return null;
  const total = items.reduce((a, i) => a + i.grams, 0);
  const meal = await db.insert('meals', {
    family_id: fam.id, dish_name: items.length === 1 ? items[0].name : null, source: oneOf(source, ['chat', 'voice', 'manual']) || 'chat', analyzed_via: 'chat', engine_meal_id: null,
    total_grams: total, total_value_sar: Math.round(items.reduce((a, i) => a + i.value_sar, 0) * 100) / 100, servings_left: Math.round(total / 300), next_day_suggestion: null, status: 'in_fridge',
  });
  const mealId = meal[0].id;
  const rows = await db.insert('meal_items', items.map(i => ({ meal_id: mealId, name: i.name, grams: i.grams, value_sar: i.value_sar, safe_until: i.safe_until, state: 'باقي', confidence: null, storage: i.storage, food_category: i.food_category, cooked_at: i.cooked_at, stored_at: i.stored_at, safety_source: i.safety_source })));
  const nowMs = Date.now();
  return { meal_id: mealId, items: items.map((i, k) => ({ ...pub({ ...i, id: rows[k].id, meal_id: mealId, hours_left: Math.round((Date.parse(i.safe_until) - nowMs) / 36e4) / 10 }), estimated: i.estimated, value_sar: i.value_sar })) };
}

// «دخل الثلاجة ✅» بعد تحليل الصورة: التخزين = ثلاجة الآن، والطبخ = قبل ساعة (افتراض متحفظ)
async function stashMeal(fam, mealId) {
  const now = Date.now(), items = await db.select('meal_items', `meal_id=eq.${mealId}&select=id,name,outcome,removed_at`);
  for (const it of items) {
    if (it.outcome || it.removed_at) continue;
    const s = safety(it.name, { storage: 'fridge', from: new Date(now) });
    await db.update('meal_items', `id=eq.${it.id}`, { storage: 'fridge', stored_at: new Date(now).toISOString(), cooked_at: new Date(now - 36e5).toISOString(), safe_until: s.safe_until, food_category: s.food_category, safety_source: s.safety_source });
  }
  await db.update('meals', `id=eq.${mealId}&family_id=eq.${fam.id}`, { status: 'in_fridge' });
}

async function closeItems(picked, outcome) {
  const ids = picked.map(i => i.id), now = new Date().toISOString();
  await db.update('meal_items', `id=in.(${ids.join(',')})`, { outcome, removed_at: now });
  const statuses = {};
  for (const mid of [...new Set(picked.map(i => i.meal_id))]) statuses[mid] = await recompute(mid, picked.find(i => i.meal_id === mid).famId || null);
  return statuses;
}

// تحديث: outcome أو نقل للفريزر. الهدف: item_id أو اسم (مع تسامح) أو all
async function updateItems(fam, { target, item_id, outcome, move_to }) {
  const open = (await loadOpen(fam.id)).map(i => ({ ...i, famId: fam.id }));
  let picked, ambiguous = null;
  if (item_id) picked = UUID.test(String(item_id)) ? open.filter(i => i.id === item_id) : [];
  else if (norm(target) === 'all' || /^(الكل|كل شي|كل شيء|كله)$/.test(String(target || '').trim())) picked = open;
  else { const m = matchItems(open, target); if (m.ambiguous) ambiguous = m.ambiguous; picked = m.items || [] }
  if (ambiguous) return { ambiguous: ambiguous.map(pub) };
  if (!picked.length) return { none: true };
  if (oneOf(outcome, OUTCOMES)) {
    const statuses = await closeItems(picked, outcome);
    return { updated: picked.map(pub), outcome, meal_statuses: statuses };
  }
  if (move_to === 'freezer') {
    const moved = [], blocked = [], now = new Date();
    for (const i of picked) {
      if (i.storage === 'freezer') continue;
      if (i.hours_left <= 0) { blocked.push(i); continue }                   // منتهي الصلاحية: ما ينفع نجمّده
      const s = safety(i.name, { storage: 'freezer', from: now });
      await db.update('meal_items', `id=eq.${i.id}`, { storage: 'freezer', stored_at: now.toISOString(), safe_until: s.safe_until, food_category: s.food_category, safety_source: s.safety_source });
      moved.push({ ...i, storage: 'freezer', stored_at: now.toISOString(), safe_until: s.safe_until, hours_left: Math.round((Date.parse(s.safe_until) - Date.now()) / 36e4) / 10 });
    }
    return { moved: moved.map(pub), blocked: blocked.map(pub), move_to: 'freezer' };
  }
  return { none: true };
}

// تنبيهات: أصناف تنتهي خلال 12 ساعة، وأصناف انتهت (آخر 14 يوم)
async function alerts(fam) {
  const open = await loadOpen(fam.id);
  const soon = open.filter(i => i.hours_left > 0 && i.hours_left < 12).slice(0, 3).map(i => ({ ...pub(i), suggestion: i.suggestion || null }));
  const expired = open.filter(i => i.hours_left <= 0 && i.hours_left > -14 * 24).slice(0, 3).map(pub);
  return { soon, expired };
}

module.exports = { OUTCOMES, MEAL_STATUS, norm, matchItems, loadOpen, pub, recompute, addItems, stashMeal, updateItems, alerts, ITEM_COLS };
