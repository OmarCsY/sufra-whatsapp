// تجميعات المرصد: بدون هوية أبدًا (ما نرجّع family_id ولا dash_token ولا إحداثيات).
// الأساس من RPC observatory(p_days, p_include_demo)، ونضيف من الخادم: مصفوفة يوم×وجبة، Sankey، التجميع حسب المنطقة، والفلترة بالمنطقة.
const { db } = require('./_db');
const fsafe = require('./_foodsafety');
const { REGIONS } = require('./_regions');

const MAX_DAYS = 92, TTL = 60e3;
const WEIGHT = { eaten: 1, half: 0.5, donated: 1 };          // وزن «المنقذ» لكل مصير
const KSA = 3 * 36e5;
const ksa = ms => new Date(ms + KSA);                          // نقرأ منه بـ getUTC* (توقيت السعودية)
const dayKey = ms => ksa(ms).toISOString().slice(0, 10);
const dowOf = ms => { const d = ksa(ms).getUTCDay(); return d === 0 ? 7 : d };   // 1 = الإثنين ... 7 = الأحد
const slotOf = ms => { const h = ksa(ms).getUTCHours(); return h >= 5 && h < 11 ? 'فطور' : h >= 11 && h < 17 ? 'غداء' : 'عشاء' };   // يطابق تصنيف RPC (بعد 5 فجرًا فطور، وبعد المغرب وحتى الفجر عشاء)
const WEEKDAYS = { 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' };
const r1 = x => Math.round((Number(x) || 0) * 10) / 10;
const r2 = x => Math.round((Number(x) || 0) * 100) / 100;
const RICE_CAT = 'rice';
const CATEGORY_LABELS = Object.fromEntries([...fsafe.CATEGORIES, fsafe.DEFAULT_CAT].map(c => [c.id, c.label]));

async function pageAll(table, query, size = 1000, max = 60) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const rows = await db.select(table, `${query}&limit=${size}&offset=${i * size}`);
    out.push(...rows); if (rows.length < size) break;
  }
  return out;
}

/* ---------- تحميل البيانات الخام (كاش 60 ثانية لكل نوع demo) ---------- */
const rawCache = {};
async function loadRaw(demo) {
  const hit = rawCache[demo ? 1 : 0]; if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const since = new Date(Date.now() - MAX_DAYS * 864e5).toISOString();
  const sel = encodeURIComponent('name,grams,value_sar,outcome,storage,food_category,meals!inner(id,created_at,occasion,guests,family_id)');
  const [fams, items, dons] = await Promise.all([
    pageAll('families', 'select=id,region,city,is_demo&order=id.asc'),
    pageAll('meal_items', `select=${sel}&meals.created_at=gte.${since}&order=id.asc`),
    pageAll('donations', `select=charity_name,charity_city,grams,status,created_at,family_id&created_at=gte.${since}&order=id.asc`),
  ]);
  const famMap = new Map(fams.filter(f => demo || !f.is_demo).map(f => [f.id, f]));
  const data = { famMap, items: items.filter(i => famMap.has(i.meals.family_id)), dons: dons.filter(d => famMap.has(d.family_id)) };
  rawCache[demo ? 1 : 0] = { ts: Date.now(), data };
  return data;
}

/* ---------- الحساب من البيانات الخام (يطابق صيغة RPC، ويدعم فلتر المنطقة) ---------- */
function compute(raw, { days, region }) {
  const now = Date.now(), start = now - days * 864e5;
  const fams = [...raw.famMap.values()].filter(f => !region || f.region === region), famIds = new Set(fams.map(f => f.id));
  const items = raw.items.filter(i => famIds.has(i.meals.family_id) && Date.parse(i.meals.created_at) >= start);
  const meals = new Map();
  for (const i of items) {
    const m = i.meals; let o = meals.get(m.id);
    if (!o) meals.set(m.id, o = { ts: Date.parse(m.created_at), fam: m.family_id, occasion: m.occasion || 'daily', grams: 0, items: [] });
    o.grams += Number(i.grams) || 0; o.items.push(i);
  }
  const catOf = i => i.food_category || fsafe.categorize(i.name).id;
  let obsG = 0, savedG = 0, lostG = 0, donG = 0, sarSaved = 0, sarObs = 0;
  const outc = {}, byCat = {}, byItem = {}, daily = {}, byOcc = {}, byDow = {}, bySlot = {}, cell = {}, sankeyA = {}, sankeyB = {};
  const famAgg = {};
  for (const i of items) {
    const g = Number(i.grams) || 0, v = Number(i.value_sar) || 0, w = WEIGHT[i.outcome] || 0, oc = i.outcome || 'open', ts = Date.parse(i.meals.created_at);
    obsG += g; sarObs += v; savedG += g * w; sarSaved += v * w;
    if (i.outcome === 'thrown' || i.outcome === 'expired') lostG += g;
    if (i.outcome === 'donated') donG += g;
    (outc[oc] = outc[oc] || { outcome: oc, kg: 0, items: 0 }); outc[oc].kg += g / 1000; outc[oc].items++;
    const c = catOf(i); (byCat[c] = byCat[c] || { category: c, kg: 0 }).kg += g / 1000;
    const it = (byItem[i.name] = byItem[i.name] || { name: i.name, kg: 0, n: 0, g: 0 }); it.kg += g / 1000; it.n++; it.g += g;
    const dk = dayKey(ts); const d = (daily[dk] = daily[dk] || { day: dk, meals: new Set(), kg_saved: 0, kg_observed: 0 }); d.meals.add(i.meals.id); d.kg_observed += g / 1000; d.kg_saved += g * w / 1000;
    const st = i.storage === 'fridge' ? 'ثلاجة' : i.storage === 'freezer' ? 'فريزر' : 'بدون تخزين', ou = { eaten: 'أُكل', half: 'أُكل نصه', donated: 'تبرعنا به', thrown: 'انرمى', expired: 'انتهت مدته' }[i.outcome] || 'مفتوح';
    sankeyA[st] = (sankeyA[st] || 0) + g; const k = st + '>' + ou; sankeyB[k] = (sankeyB[k] || 0) + g;
    const fa = (famAgg[i.meals.family_id] = famAgg[i.meals.family_id] || { kg: 0 }); fa.kg += g / 1000;
  }
  const riceMeals = [];
  for (const m of meals.values()) {
    const oc = (byOcc[m.occasion] = byOcc[m.occasion] || { occasion: m.occasion, meals: 0, g: 0, kg: 0 }); oc.meals++; oc.g += m.grams; oc.kg += m.grams / 1000;
    const dw = dowOf(m.ts), sl = slotOf(m.ts);
    (byDow[dw] = byDow[dw] || { dow: dw, meals: 0, g: 0 }); byDow[dw].meals++; byDow[dw].g += m.grams;
    (bySlot[sl] = bySlot[sl] || { slot: sl, meals: 0, g: 0 }); bySlot[sl].meals++; bySlot[sl].g += m.grams;
    const ck = dw + '|' + sl; (cell[ck] = cell[ck] || { dow: dw, slot: sl, meals: 0, g: 0 }); cell[ck].meals++; cell[ck].g += m.grams;
    const rice = m.items.filter(i => catOf(i) === RICE_CAT).reduce((s, i) => s + (Number(i.grams) || 0), 0); if (rice > 0) riceMeals.push(rice);
  }
  // الأسر النشطة وتجميع المدن/المناطق (الأقل من 3 أسر ما نعرض أرقامها)
  const activeFam = new Set([...meals.values()].map(m => m.fam));
  const groupBy = key => {
    const g = {};
    for (const f of fams) if (activeFam.has(f.id)) { const k = f[key]; if (!k) continue; (g[k] = g[k] || { name: k, fams: new Set() }).fams.add(f.id) }
    const famKey = new Map(fams.map(f => [f.id, f[key]]));
    for (const i of items) { const k = famKey.get(i.meals.family_id); if (!k || !g[k]) continue; const gi = Number(i.grams) || 0, w = WEIGHT[i.outcome] || 0; g[k].kg_observed = (g[k].kg_observed || 0) + gi / 1000; g[k].kg_saved = (g[k].kg_saved || 0) + gi * w / 1000; if (i.outcome === 'donated') g[k].kg_donated = (g[k].kg_donated || 0) + gi / 1000; g[k].meal_ids = g[k].meal_ids || new Set(); g[k].meal_ids.add(i.meals.id) }
    return Object.values(g);
  };
  const months = Math.max(days / 30, 0.1);
  const pack = (name, fam, kObs, kSav, kDon, meals) => ({ [name.key]: name.val, families: fam, meals, kg_saved: r1(kSav), kg_donated: r1(kDon), kg_observed: r1(kObs), kg_per_family_month: r1(kObs / Math.max(fam, 1) / months) });
  const city = groupBy('city'), big = city.filter(c => c.fams.size >= 3), small = city.filter(c => c.fams.size < 3);
  const by_city = big.map(c => pack({ key: 'city', val: c.name }, c.fams.size, c.kg_observed || 0, c.kg_saved || 0, c.kg_donated || 0, (c.meal_ids || new Set()).size));
  if (small.length) { const f = small.reduce((s, c) => s + c.fams.size, 0); by_city.push(pack({ key: 'city', val: 'مدن أخرى' }, f, ...['kg_observed', 'kg_saved', 'kg_donated'].map(k => small.reduce((s, c) => s + (c[k] || 0), 0)), small.reduce((s, c) => s + (c.meal_ids || new Set()).size, 0))) }
  by_city.sort((a, b) => b.kg_per_family_month - a.kg_per_family_month);
  const reg = groupBy('region'), byRegion = REGIONS.map(name => {
    const c = reg.find(x => x.name === name); if (!c) return { region: name, families: 0, hidden: false, empty: true };
    if (c.fams.size < 3) return { region: name, families: c.fams.size, hidden: true };       // خصوصية: أقل من 3 أسر
    return { ...pack({ key: 'region', val: name }, c.fams.size, c.kg_observed || 0, c.kg_saved || 0, c.kg_donated || 0, (c.meal_ids || new Set()).size), hidden: false };
  });

  // التغيّر السلوكي: متوسط جرامات الوجبة في أول أسبوع مقابل آخر أسبوع لكل أسرة (فترة ≥ 14 يوم)، ثم متوسط الأسر
  const perFam = {};
  for (const m of meals.values()) (perFam[m.fam] = perFam[m.fam] || []).push(m);
  const firsts = [], lasts = [];
  for (const arr of Object.values(perFam)) {
    const ts = arr.map(m => m.ts), t0 = Math.min(...ts), t1 = Math.max(...ts); if (t1 - t0 < 14 * 864e5) continue;
    const avg = a => a.reduce((s, m) => s + m.grams, 0) / a.length;
    const a = arr.filter(m => m.ts < t0 + 7 * 864e5), b = arr.filter(m => m.ts > t1 - 7 * 864e5); if (a.length && b.length) { firsts.push(avg(a)); lasts.push(avg(b)) }
  }
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  const fw = mean(firsts), lw = mean(lasts);
  const behavior_change = { families: firsts.length, first_week_avg_g: fw == null ? null : Math.round(fw), last_week_avg_g: lw == null ? null : Math.round(lw), change_pct: fw ? Math.round((lw - fw) / fw * 100) : null };

  // الأيام بدون فجوات
  const dailyArr = []; for (let t = start; t <= now; t += 864e5) { const k = dayKey(t), d = daily[k]; dailyArr.push({ day: k, meals: d ? d.meals.size : 0, kg_saved: r2(d ? d.kg_saved : 0), kg_observed: r2(d ? d.kg_observed : 0) }) }
  const seen = new Set(); const dailyOut = dailyArr.filter(d => !seen.has(d.day) && seen.add(d.day));

  const riceAvg = riceMeals.length ? riceMeals.reduce((s, x) => s + x, 0) / riceMeals.length : null;
  const donBy = {}; for (const d of raw.dons.filter(d => famIds.has(d.family_id) && Date.parse(d.created_at) >= start)) { const k = d.charity_name; const o = (donBy[k] = donBy[k] || { charity: k, city: d.charity_city, count: 0, agreed: 0, kg: 0 }); o.count++; o.kg += (Number(d.grams) || 0) / 1000; if (d.status === 'agreed') o.agreed++ }

  const kgObs = obsG / 1000, kgSaved = savedG / 1000;
  const nodes = ['محلَّل', 'ثلاجة', 'فريزر', 'بدون تخزين', 'أُكل', 'أُكل نصه', 'تبرعنا به', 'انرمى', 'انتهت مدته', 'مفتوح'];
  const links = [...Object.entries(sankeyA).map(([k, v]) => ({ source: 'محلَّل', target: k, value: r2(v / 1000) })), ...Object.entries(sankeyB).map(([k, v]) => { const [s, t] = k.split('>'); return { source: s, target: t, value: r2(v / 1000) } })].filter(l => l.value > 0);
  return {
    kpis: { meals: meals.size, kg_observed: r1(kgObs), kg_saved: r1(kgSaved), kg_lost: r1(lostG / 1000), kg_donated: r1(donG / 1000), sar_observed: Math.round(sarObs), sar_saved: Math.round(sarSaved), save_rate_pct: kgObs ? r1(kgSaved / kgObs * 100) : null, families_total: fams.length, families_active: activeFam.size },
    behavior_change, by_city, by_region: byRegion,
    by_category: Object.values(byCat).sort((a, b) => b.kg - a.kg).map(c => ({ category: c.category, label: CATEGORY_LABELS[c.category] || c.category, kg: r1(c.kg), share_pct: kgObs ? r1(c.kg / kgObs * 100) : 0 })),
    top_items: Object.values(byItem).sort((a, b) => b.kg - a.kg).slice(0, 8).map(x => ({ name: x.name, kg: r1(x.kg), avg_g: Math.round(x.g / x.n), times: x.n })),
    daily: dailyOut,
    by_weekday: Object.values(byDow).sort((a, b) => a.dow - b.dow).map(x => ({ dow: x.dow, meals: x.meals, avg_g_per_meal: Math.round(x.g / x.meals) })),
    by_slot: Object.values(bySlot).map(x => ({ slot: x.slot, meals: x.meals, avg_g_per_meal: Math.round(x.g / x.meals) })),
    by_occasion: Object.values(byOcc).map(x => ({ occasion: x.occasion, meals: x.meals, kg: r1(x.kg), avg_g_per_meal: Math.round(x.g / x.meals) })),
    outcomes: Object.values(outc).map(o => ({ outcome: o.outcome, kg: r1(o.kg), items: o.items })),
    donations: Object.values(donBy).map(d => ({ ...d, kg: r1(d.kg) })).sort((a, b) => b.kg - a.kg),
    rice: { avg_rice_left_g: riceAvg == null ? null : Math.round(riceAvg), meals_with_rice: riceMeals.length, extra_cups_per_meal: riceAvg == null ? null : Math.round(riceAvg / 600 * 2) / 2 },
    matrix: Object.values(cell).map(c => ({ dow: c.dow, slot: c.slot, meals: c.meals, avg_g: Math.round(c.g / c.meals) })),
    sankey: { nodes, links },
  };
}

/* ---------- الدالة العامة: RPC + إضافات الخادم، بكاش 60 ثانية ---------- */
const outCache = new Map();
async function getObservatory({ days = 30, demo = false, region = null }) {
  days = [7, 30, 90].includes(days) ? days : 30; region = REGIONS.includes(region) ? region : null;
  const key = `${days}|${demo ? 1 : 0}|${region || ''}`, hit = outCache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const raw = await loadRaw(demo);
  const c = compute(raw, { days, region });
  let source = 'computed', base = c;
  if (!region) {   // بدون فلتر المنطقة: نعتمد أرقام RPC الرسمية للحقول اللي يغطيها
    try {
      const r = await db.rpc('observatory', { p_days: days, p_include_demo: demo });
      if (r && r.kpis) {
        source = 'rpc';
        base = { ...c, kpis: r.kpis, behavior_change: r.behavior_change || c.behavior_change, by_city: r.by_city || c.by_city, by_weekday: r.by_weekday || c.by_weekday, by_slot: r.by_slot || c.by_slot, by_occasion: r.by_occasion || c.by_occasion, outcomes: r.outcomes || c.outcomes, donations: r.donations || c.donations, rice: r.rice || c.rice, top_items: r.top_items || c.top_items,
          by_category: (r.by_category || c.by_category).map(x => ({ ...x, label: CATEGORY_LABELS[x.category] || x.category })) };
      }
    } catch (e) { /* نكمل بالحساب من الخادم */ }
  }
  const data = {
    generated_at: new Date().toISOString(), days, demo, region, source, regions: REGIONS, category_labels: CATEGORY_LABELS,
    weekdays: WEEKDAYS, ...base,
    safety_rules: fsafe.RULES.map(r => ({ id: r.id, text: r.text, sources: r.src.map(s => ({ name: fsafe.SOURCES[s].name, url: fsafe.SOURCES[s].url, conservative: !fsafe.SOURCES[s].url })) })),
  };
  outCache.set(key, { ts: Date.now(), data }); if (outCache.size > 60) outCache.delete(outCache.keys().next().value);
  return data;
}

module.exports = { getObservatory, compute, loadRaw, WEIGHT, CATEGORY_LABELS, WEEKDAYS };
