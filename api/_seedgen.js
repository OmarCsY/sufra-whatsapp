// مولّد بيانات الأسر التجريبية (is_demo): أسرة العرض 'demo' + 60 أسرة موزعة على 8 مدن. بيانات واقعية بمولّد أرقام ثابت.
// مدد الحفظ والتصنيف من _foodsafety.js (عبر _prices.safety)، وكل شي مكتوب is_demo = true.
const { rule, safety } = require('./_prices');
const { regionOf } = require('./_regions');

const H = 36e5, D = 864e5;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

// المدن + جمعية المدينة الحقيقية (الأسماء مطابقة لقائمة البوت). المدينة بدون جمعية = بدون تبرعات.
const CITY_DEF = {
  'بريدة': { lat: 26.326, lng: 43.975, charity: { name: 'طعامي لحفظ النعمة', city: 'بريدة', km: [4, 20] } },
  'عنيزة': { lat: 26.084, lng: 43.993, charity: { name: 'طعامي لحفظ النعمة', city: 'بريدة', km: [27, 27] } },
  'الرياض': { lat: 24.7136, lng: 46.6753, charity: { name: 'خيرات لحفظ النعمة', city: 'الرياض', km: [3, 25] } },
  'الدمام': { lat: 26.4207, lng: 50.0888, charity: { name: 'إطعام (بنك الطعام السعودي)', city: 'الدمام', km: [3, 20] } },
  'جدة': { lat: 21.4858, lng: 39.1925, charity: { name: 'حفظ النعمة «استدامة»', city: 'جدة', km: [4, 28] } },
  'الطائف': { lat: 21.2703, lng: 40.4158, charity: { name: 'أرزاق لحفظ النعمة', city: 'الطائف', km: [3, 15] } },
  'الأفلاج': { lat: 22.28, lng: 46.73, charity: { name: 'صون لحفظ النعمة', city: 'الأفلاج', km: [2, 12] } },
  'المدينة': { lat: 24.5247, lng: 39.5692, charity: null },
};
// عدد الأسر التجريبية الإضافية (المجموع 60)
const PLAN = [['الرياض', 14], ['جدة', 10], ['الدمام', 8], ['بريدة', 8], ['عنيزة', 6], ['الطائف', 5], ['المدينة', 5], ['الأفلاج', 4]];

// أطباق سعودية: [اسم الصنف، أقل جرام، أعلى جرام]
const DISHES = {
  'كبسة دجاج': [['رز', 300, 800], ['دجاج', 170, 450]],
  'كبسة لحم': [['رز', 300, 800], ['لحم', 170, 500]],
  'مندي': [['مندي', 350, 900], ['لحم', 170, 500]],
  'جريش': [['جريش', 250, 700], ['لحم', 150, 350]],
  'مرقوق': [['مرقوق', 280, 700], ['لحم', 150, 300]],
  'قرصان': [['قرصان', 280, 650], ['لحم', 150, 300]],
  'صالونة': [['صالونة', 250, 550], ['رز', 250, 600]],
  'شكشوكة': [['شكشوكة', 200, 450], ['خبز', 150, 220]],
  'مقلوبة': [['مقلوبة', 350, 850], ['سلطة', 150, 240]],
  'مكرونة': [['مكرونة', 250, 650]],
  'خبز وتميس': [['تميس', 150, 420]],
  'فواكه': [['فواكه', 200, 520]],
  'تمر': [['تمر', 150, 400]],
};
const LUNCH = [['كبسة دجاج', 18], ['كبسة لحم', 9], ['مندي', 8], ['جريش', 8], ['مرقوق', 8], ['قرصان', 5], ['صالونة', 9], ['مقلوبة', 9], ['مكرونة', 7], ['خبز وتميس', 4], ['فواكه', 3]];
const DINNER = [['شكشوكة', 20], ['مكرونة', 12], ['خبز وتميس', 10], ['فواكه', 9], ['صالونة', 8], ['جريش', 6], ['كبسة دجاج', 10], ['تمر', 5], ['مقلوبة', 6], ['مرقوق', 4]];
const BREAKFAST = [['شكشوكة', 30], ['خبز وتميس', 28], ['تمر', 20], ['فواكه', 22]];
const NEXT = { 'كبسة دجاج': 'كبسة باقية بالخضار', 'كبسة لحم': 'رز باللحم بالفرن', 'جريش': 'جريش بالحليب', 'صالونة': 'رز بالصالونة', 'مقلوبة': 'مقلوبة بالبيض' };
const pick = (list, R) => { const t = list.reduce((s, x) => s + x[1], 0); let r = R() * t; for (const [v, w] of list) { if ((r -= w) <= 0) return v } return list[0][0] };
const MEAL_STATUS = { eaten: 'eaten', half: 'partly_eaten', thrown: 'thrown', expired: 'thrown', donated: 'donated' };

// قدور العزائم: [اسم الطبق، [الأصناف]] والنسب من إجمالي الكمية
const POTS = [['كبسة لحم', [['رز', .55], ['لحم', .45]]], ['مندي', [['مندي', .55], ['لحم', .45]]], ['جريش', [['جريش', .6], ['لحم', .4]]], ['مرقوق', [['مرقوق', .6], ['لحم', .4]]]];

// يولّد أسرة واحدة بكل وجباتها. opts: { city, size, lang, span, token, seed, showcase }
function genFamily(o, now) {
  const R = rng(o.seed), def = CITY_DEF[o.city], span = o.span;
  const delta = 0.18 + R() * 0.17;                              // تحسّن البواقي بين أول وآخر أسبوع (15–30% مقاس)
  const sizeF = 0.8 + (o.size - 3) * 0.07;                      // الأسرة الأكبر بواقيها أكثر
  const iso = ms => new Date(ms).toISOString();
  const at = (daysAgo, hourLocal) => { const d = new Date(now - daysAgo * D); d.setUTCHours(Math.floor(hourLocal) - 3, Math.round((hourLocal % 1) * 60), 0, 0); return d.getTime() };  // توقيت السعودية UTC+3
  const meals = [], donations = [], gatherings = [];

  const makeItem = (name, grams, created, outcome, closed, forceStorage) => {
    const r = rule(name);
    const st = forceStorage !== undefined ? forceStorage : (() => { const x = R(); return x < 0.72 ? 'fridge' : x < 0.75 ? 'freezer' : null })();
    const s = safety(name, { storage: st || 'fridge', from: new Date(created) });
    return { name, grams: Math.round(grams), value_sar: Math.round(grams * r.price / 10) / 100, safe_until: s.safe_until, state: 'باقي', confidence: Math.round((0.78 + R() * 0.19) * 100) / 100, outcome,
      storage: st, food_category: s.food_category, cooked_at: st ? iso(created - H) : null, stored_at: st ? iso(created) : null, safety_source: s.safety_source, removed_at: outcome && closed ? iso(closed) : null };
  };
  const addMeal = (created, dish, items, outcomeKind, closed, extra = {}) => {
    const total = items.reduce((s, i) => s + i.grams, 0), value = items.reduce((s, i) => s + i.value_sar, 0);
    let status = outcomeKind ? MEAL_STATUS[outcomeKind] : (items.some(i => i.storage) ? 'in_fridge' : 'analyzed');
    if (outcomeKind === 'mixed') status = 'partly_eaten';
    meals.push({ meal: { dish_name: dish, source: 'demo', analyzed_via: 'demo', engine_meal_id: null, total_grams: total, total_value_sar: Math.round(value * 100) / 100, servings_left: Math.round(total / 300), next_day_suggestion: NEXT[dish] || null, status, created_at: iso(created), closed_at: outcomeKind && closed ? iso(closed) : null, occasion: extra.occasion || 'daily', guests: extra.guests || null }, items });
    return meals.length - 1;
  };
  const outcomeFor = t => {   // مصير الوجبة: الرمي والانتهاء يقلّون مع الوقت
    const x = R(), pT = (0.15 - 0.10 * t) * 1, pE = 0.045 * (1 - 0.75 * t);
    return x < pT ? 'thrown' : x < pT + pE ? 'expired' : x < pT + pE + 0.14 ? 'half' : 'eaten';
  };

  // العزائم: كل 8 إلى 14 يوم
  const gatherDays = new Set(); let g = 3 + Math.floor(R() * 8);
  while (g < span - 1) { gatherDays.add(g); g += 8 + Math.floor(R() * 7) }
  if (o.showcase) { gatherDays.clear(); [25, 14, 6].forEach(x => gatherDays.add(x)) }   // العرض: عزائم متباعدة ثابتة

  let donated = 0;
  for (let d = span - 1; d >= 0; d--) {
    const t = span > 1 ? (span - 1 - d) / (span - 1) : 1, f = 1 - delta * t;
    const dow = new Date(at(d, 12)).getUTCDay(), wk = dow === 5 || dow === 6;      // الجمعة والسبت أعلى
    const gather = gatherDays.has(d);
    if (gather) {
      const guests = 15 + Math.floor(R() * 46), total = Math.max(2000, Math.min(8000, (3000 + R() * 5000) * f));
      const created = at(d, 16.5 + R()), [dishName, parts] = POTS[Math.floor(R() * POTS.length)];
      const wantDonate = !!def.charity && (o.showcase ? true : R() < 0.5);
      const status = wantDonate ? (R() < 0.85 ? 'agreed' : R() < 0.5 ? 'contacted' : 'no_answer') : null;
      const kind = status === 'agreed' ? 'donated' : (status ? (R() < 0.6 ? 'thrown' : 'expired') : (R() < 0.7 ? 'eaten' : 'half'));
      const closed = created + (kind === 'expired' ? 50 : 4 + R() * 20) * H;
      const items = parts.map(([n, share]) => makeItem(n, total * share, created, closed < now ? kind : null, closed, 'fridge'));
      const idx = addMeal(created, dishName, items, closed < now ? kind : null, closed, { occasion: !o.showcase && R() < 0.1 ? 'other' : 'gathering', guests });
      gatherings.push({ guests_min: guests, guests_max: guests, rice_kg: Math.round(guests * .24 * 10) / 10, meat_kg: Math.round(guests * .12 * 10) / 10, created_at: iso(created - 8 * H) });
      if (wantDonate && def.charity) {
        donated++;
        donations.push({ mealIdx: idx, row: { charity_name: def.charity.name, charity_city: def.charity.city, distance_km: Math.round(def.charity.km[0] + R() * (def.charity.km[1] - def.charity.km[0])), grams: Math.round(total), cooked_window: R() < 0.8 ? 'أقل من ساعتين' : 'من ساعتين لـ4', contact_method: ['call', 'whatsapp', 'map'][Math.floor(R() * 3)], status, created_at: iso(created + H) } });
      }
    }
    // وجبات اليوم العادية: الغداء أكثر وجبة، والجمعة والسبت أعلى
    const slots = [];
    if (R() < (wk ? 0.95 : 0.8)) slots.push(['lunch', 13 + R() * 1.6, LUNCH]);
    if (R() < (wk ? 0.55 : 0.3)) slots.push(['dinner', 20.3 + R() * 1.7, DINNER]);
    if (R() < (wk ? 0.22 : 0.08)) slots.push(['breakfast', 8 + R() * 1.5, BREAKFAST]);
    if (!slots.length) slots.push(['lunch', 13 + R() * 1.6, LUNCH]);
    for (const [slot, hour, pool] of slots.slice(0, 2)) {
      const created = at(d, hour); if (created > now - 40 * 60e3) continue;
      const dish = pick(pool, R), tpl = DISHES[dish], boost = (wk ? 1.3 : 1) * (slot === 'lunch' ? 1.1 : 0.85);
      const kind = outcomeFor(t), mixed = R() < 0.12 && tpl.length > 1;
      const age = (now - created) / H;
      const closed = created + (kind === 'expired' ? 28 + R() * 30 : 6 + R() * 24) * H;
      const open = age < 30 && R() < 0.85;                                     // آخر ~30 ساعة: غالبًا لسا بالثلاجة
      const items = tpl.map(([n, lo, hi], k) => {
        const grams = Math.min(900, Math.max(150, (lo + (hi - lo) * R()) * f * sizeF * boost));
        const oc = open || closed > now ? null : (mixed && k > 0 ? 'thrown' : kind);
        return makeItem(n, grams, created, oc, closed, open ? 'fridge' : undefined);
      });
      const finalKind = open || closed > now ? null : (mixed ? 'mixed' : kind);
      addMeal(created, dish, items, finalKind, closed);
    }
  }

  if (o.showcase) {   // أسرة العرض: أصناف تنتهي قريبًا + فريزر + أكل انتهى (تظهر في «في ثلاجتكم الحين» و«انتهى قبل ما ينأكل»)
    const fr = (agoH, dish, list) => { const created = now - agoH * H; const items = list.map(([n, gm, left, st]) => ({ ...makeItem(n, gm, created, null, null, st || 'fridge'), safe_until: iso(now + left * H) })); addMeal(created, dish, items, null, null) };
    fr(22, 'صالونة', [['رز', 300, 9], ['صالونة', 380, 50]]);
    fr(4, 'كبسة دجاج', [['رز', 520, 20], ['دجاج', 280, 68]]);
    { const created = now - 5 * D; addMeal(created, 'مرقوق', [{ ...makeItem('مرقوق', 1800, created, null, null, 'freezer'), safe_until: safety('مرقوق', { storage: 'freezer', from: new Date(created) }).safe_until }], null, null) }
    for (const [dd, dish, n, gm] of [[12, 'صالونة', 'صالونة', 420], [9, 'سلطة', 'سلطة', 260]]) { const created = at(dd, 14), closed = created + 3 * D; addMeal(created, dish, [makeItem(n, gm, created, 'expired', closed, 'fridge')], 'expired', closed) }
  }

  const first = meals.length ? Math.min(...meals.map(m => Date.parse(m.meal.created_at))) : now, last = meals.length ? Math.max(...meals.map(m => Date.parse(m.meal.created_at))) : now;
  const jit = () => (R() - 0.5) * 0.08;
  return {
    family: { dash_token: o.token, household_size: o.size, cook_language: o.lang, city: o.city, region: regionOf(o.city), lat: Math.round((def.lat + jit()) * 1e4) / 1e4, lng: Math.round((def.lng + jit()) * 1e4) / 1e4, is_demo: true, created_at: iso(first - H), last_seen_at: iso(last) },
    meals, donations, gatherings,
  };
}

// يبني كل الأسر التجريبية. الأولى: أسرة العرض 'demo' (45 يوم). ثم 60 أسرة (21 إلى 45 يوم لكل وحدة).
function buildAll(now) {
  const fams = [genFamily({ city: 'عنيزة', size: 6, lang: 'عربي', span: 45, token: 'demo', seed: 20260101, showcase: true }, now)];
  const R = rng(777); let n = 0;
  for (const [city, count] of PLAN) for (let i = 0; i < count; i++) {
    n++;
    fams.push(genFamily({ city, size: 3 + Math.floor(R() * 7), lang: R() < 0.9 ? 'عربي' : ['English', 'Tagalog', 'اردو'][Math.floor(R() * 3)], span: 21 + Math.floor(R() * 25), token: 'demo-' + String(n).padStart(2, '0'), seed: 1000 + n * 37 }, now));
  }
  return fams;
}

module.exports = { buildAll, genFamily, CITY_DEF, PLAN };
