// لوحة الأسرة: GET /api/dashboard?t=TOKEN. كل الأرقام من بيانات الأسرة الحقيقية، ولا نرجّع أي بيانات أسرة ثانية ولا معرّف الأسرة.
const { limited } = require('./_util');
const { db, ready, q, TOKEN } = require('./_db');

const RICE = /رز|أرز|كبسة|مندي|مضغوط|برياني|مقلوبة|مجبوس/;
const r1 = x => Math.round((Number(x) || 0) * 10) / 10;

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (limited(req, res, 40)) return;
  const t = String((req.query && req.query.t) || '');
  if (!TOKEN.test(t)) return res.status(404).json({ error: 'not_found' });
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });

  try {
    const fr = await db.select('families', `dash_token=eq.${q(t)}&select=id,is_demo,household_size,cook_language,city,created_at&limit=1`);
    const fam = fr && fr[0];
    if (!fam) return res.status(404).json({ error: 'not_found' });
    const id = fam.id, now = Date.now();
    const since = new Date(now - 29 * 864e5).toISOString().slice(0, 10);
    const sel = 'id,dish_name,status,total_grams,total_value_sar,created_at,closed_at,meal_items(name,grams,value_sar,safe_until,outcome,state)';
    const [stR, dailyR, mealsR, donsR, gathR, obsR] = await Promise.all([
      db.select('family_stats', `family_id=eq.${id}&limit=1`),
      db.select('family_daily', `family_id=eq.${id}&day=gte.${since}&order=day.asc`),
      db.select('meals', `family_id=eq.${id}&select=${encodeURIComponent(sel)}&order=created_at.desc&limit=300`),
      db.select('donations', `family_id=eq.${id}&select=charity_name,charity_city,distance_km,grams,status,contact_method,cooked_window,created_at&order=created_at.desc&limit=20`),
      db.select('gatherings', `family_id=eq.${id}&select=guests_min,guests_max,rice_kg,meat_kg,created_at&order=created_at.desc&limit=10`),
      fam.city && !fam.is_demo ? db.select('observatory_city', `city=eq.${q(fam.city)}&limit=1`) : Promise.resolve([]),
    ]);

    const s = (stR && stR[0]) || {};
    const stats = {
      meals_analyzed: Number(s.meals_analyzed) || 0, kg_saved: r1(s.kg_saved), sar_saved: Math.round(Number(s.sar_saved) || 0),
      kg_donated: r1(s.kg_donated), kg_thrown: r1(s.kg_thrown), kg_leftovers_total: r1(s.kg_leftovers_total),
    };

    // آخر 30 يوم بدون فجوات
    const byDay = {}; (dailyR || []).forEach(d => { byDay[String(d.day).slice(0, 10)] = d });
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const day = new Date(now - i * 864e5).toISOString().slice(0, 10), d = byDay[day] || {};
      daily.push({ day, grams_left: Math.round(Number(d.grams_left) || 0), grams_saved: Math.round(Number(d.grams_saved) || 0) });
    }

    const meals = (mealsR || []).map(m => ({ ...m, meal_items: m.meal_items || [] }));
    const recent = meals.slice(0, 10).map(m => ({
      dish_name: m.dish_name, created_at: m.created_at, status: m.status, total_grams: m.total_grams, total_value_sar: m.total_value_sar,
      items: m.meal_items.map(i => ({ name: i.name, grams: i.grams, outcome: i.outcome })),
    }));

    // في ثلاجتكم الحين: أصناف وجبات in_fridge اللي ما انتهى safe_until حقها، الأقرب انتهاءً أول
    const fridge = [];
    for (const m of meals) if (m.status === 'in_fridge') for (const i of m.meal_items) {
      const ts = i.safe_until ? Date.parse(i.safe_until) : NaN;
      if (!isNaN(ts) && ts > now) fridge.push({ name: i.name, grams: i.grams, dish_name: m.dish_name, safe_until: i.safe_until, hours_left: r1((ts - now) / 36e5) });
    }
    fridge.sort((a, b) => a.hours_left - b.hours_left);

    // أكثر 3 أصناف تزيد + توصية مقدار
    const agg = {}; let riceG = 0, nMeals = 0;
    for (const m of meals) { if (!m.meal_items.length) continue; nMeals++; for (const i of m.meal_items) { const g = Number(i.grams) || 0; agg[i.name] = (agg[i.name] || 0) + g; if (RICE.test(i.name)) riceG += g } }
    const top_items = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, grams]) => ({ name, grams: Math.round(grams) }));
    const cups = nMeals ? Math.round(riceG / nMeals / 600 * 2) / 2 : 0;
    const maqdar = cups >= .5 ? { cups, rice_avg_g: Math.round(riceG / nMeals), meals: nMeals } : null;

    // مقارنة مع المدينة: فقط لو 3 أسر أو أكثر والأسرة مو تجريبية
    const o = obsR && obsR[0];
    const city_compare = o && !fam.is_demo && Number(o.families) >= 3 ? {
      city: o.city, families: Number(o.families),
      avg_leftover_kg: r1(Number(o.kg_leftovers) / Number(o.families)), avg_donated_kg: r1(Number(o.kg_donated) / Number(o.families)),
      avg_meals: r1(Number(o.meals) / Number(o.families)), you_leftover_kg: stats.kg_leftovers_total, you_meals: stats.meals_analyzed,
    } : null;

    // شارات الإنجاز من البيانات
    const firstTs = meals.length ? Math.min(...meals.map(m => Date.parse(m.created_at))) : null;
    const thrownRecent = meals.some(m => (m.status === 'thrown' || m.meal_items.some(i => i.outcome === 'thrown')) && now - Date.parse(m.closed_at || m.created_at) < 7 * 864e5);
    const streakOk = firstTs != null && now - firstTs >= 7 * 864e5 && !thrownRecent;
    const badges = [
      { id: 'first_donation', title: 'أول تبرع', desc: 'تبرعتوا بأكلكم لجمعية', earned: (donsR || []).length > 0, progress: Math.min(1, (donsR || []).length) },
      { id: 'no_waste_7', title: '7 أيام بلا رمي', desc: 'أسبوع كامل بدون رمي أكل', earned: streakOk, progress: firstTs == null ? 0 : thrownRecent ? 0 : Math.min(1, (now - firstTs) / (7 * 864e5)) },
      { id: 'meals_10', title: '10 وجبات محللة', desc: 'حللتوا 10 وجبات مع سُفرة', earned: stats.meals_analyzed >= 10, progress: Math.min(1, stats.meals_analyzed / 10) },
      { id: 'saved_5kg', title: '5 كجم منقذة', desc: 'أنقذتوا 5 كجم أكل', earned: stats.kg_saved >= 5, progress: Math.min(1, stats.kg_saved / 5) },
    ];

    return res.status(200).json({
      family: { city: fam.city, household_size: fam.household_size, cook_language: fam.cook_language, is_demo: !!fam.is_demo },
      stats, carbon_kg: r1(stats.kg_saved * 2.5),
      saved_ratio: stats.kg_leftovers_total > 0 ? Math.min(1, stats.kg_saved / stats.kg_leftovers_total) : 0,
      daily, meals: recent, fridge, top_items, maqdar, city_compare, badges,
      donations: donsR || [], gatherings: gathR || [], generated_at: new Date(now).toISOString(),
    });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
