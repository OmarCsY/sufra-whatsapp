// اختبار شامل لقاعدة بيانات الأسرة على الموقع المنشور:
//   SEED_SECRET=... node tests/db-e2e.mjs        (أو BASE=https://... للتجربة على رابط ثاني)
// ينشئ أسرة تجريبية للاختبار (غير is_demo) ويتحقق أن لوحتها تطابق ما سجّلناه، ويفحص عزل الأسر والرموز الغلط وصفحة /d/demo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = (process.env.BASE || 'https://sufra-whatsapp.vercel.app').replace(/\/$/, '');
const SEED = process.env.SEED_SECRET || '';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rows = [];
const ok = (name, cond, extra = '') => rows.push([cond ? 'PASS' : 'FAIL', name, cond ? '' : String(extra).slice(0, 200)]);

async function req(method, path, body, headers = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 10) * 1000 + 500); continue; }
    const txt = await r.text(); let json = null; try { json = JSON.parse(txt) } catch (e) {}
    return { status: r.status, json, txt };
  }
}
const img = f => readFileSync(join(ROOT, f)).toString('base64');

// 0) الاتصال بالقاعدة
const probe = await req('POST', '/api/family', { household_size: 5, cook_language: 'عربي', city: 'عنيزة' });
if (!probe || probe.status !== 200) {
  console.log(`✗ القاعدة غير متاحة (HTTP ${probe && probe.status}). لو الخطأ "permission denied" شغّلوا GRANT على service_role في Supabase (انظر التقرير).`);
  process.exit(2);
}
const F = probe.json;
ok('POST /api/family creates a family', !!F.family_id && !!F.dash_token);
let r = await req('POST', '/api/family', { ...F, household_size: 6 }); ok('family update returns the same creds', r.json.family_id === F.family_id && r.json.dash_token === F.dash_token);
r = await req('POST', '/api/family', { family_id: F.family_id, dash_token: 'wrongwrongwrong' }); ok('wrong token never returns an existing family', r.json.family_id !== F.family_id);

// 1) تحليل صورة مع family → تخزين
r = await req('POST', '/api/analyze', { image: img('s-kabsa.jpg'), mime: 'image/jpeg', ...F });
const A = r.json, M = A && A.db_meal_id;
ok('analyze s-kabsa.jpg stores the meal (db_meal_id)', r.status === 200 && !!M && A.items.length > 0, r.txt);
const grams = (A.items || []).reduce((s, i) => s + i.grams, 0);
await sleep(1500);

// 2) تتبع: ثلاجة ← مصير ← تبرع (تواصل ثم اتفاق)
const tr = body => req('POST', '/api/track', { ...F, ...body });
r = await tr({ type: 'fridge', meal_id: M }); ok('track fridge', r.status === 200, r.txt);
r = await tr({ type: 'outcome', meal_id: M, outcome: 'eaten' }); ok('track outcome eaten', r.status === 200, r.txt);
const A2 = (await req('POST', '/api/analyze', { image: img('s-pots.jpg'), mime: 'image/jpeg', ...F })).json, M2 = A2 && A2.db_meal_id;
ok('second meal stored (pots)', !!M2);
const g2 = (A2.items || []).reduce((s, i) => s + i.grams, 0);
r = await tr({ type: 'donation', meal_id: M2, charity_name: 'طعامي لحفظ النعمة', charity_city: 'بريدة', distance_km: 27, grams: g2, cooked_window: 'أقل من ساعتين', contact_method: 'call', status: 'contacted' });
const DID = r.json && r.json.donation_id; ok('track donation (contacted)', r.status === 200 && !!DID, r.txt);
r = await tr({ type: 'donation', meal_id: M2, donation_id: DID, status: 'agreed' }); ok('track donation (agreed) updates same row', r.status === 200 && r.json.donation_id === DID, r.txt);
r = await tr({ type: 'gathering', guests_min: 25, guests_max: 25, rice_kg: 6, meat_kg: 3 }); ok('track gathering', r.status === 200, r.txt);
r = await tr({ type: 'voice', payload: { seconds: 5 } }); ok('track generic event (voice)', r.status === 200, r.txt);
r = await tr({ type: 'item_correction', meal_id: M, item: A.items[0].name, name: 'مرقوق', grams: A.items[0].grams, value_sar: 5 }); ok('track item_correction', r.status === 200, r.txt);
r = await req('POST', '/api/track', { family_id: F.family_id, dash_token: 'nope-nope-nope', type: 'fridge', meal_id: M }); ok('track with wrong token -> 404', r.status === 404, r.status);

// 3) اللوحة: الأرقام تطابق
r = await req('GET', '/api/dashboard?t=' + encodeURIComponent(F.dash_token));
const D = r.json || {};
ok('dashboard 200 for the same family', r.status === 200 && !!D.stats, r.txt);
ok('meals_analyzed = 2', D.stats && D.stats.meals_analyzed === 2, JSON.stringify(D.stats));
ok('kg_leftovers_total matches analyzed grams', D.stats && Math.abs(D.stats.kg_leftovers_total - (grams + g2) / 1000) < 0.2, `${D.stats && D.stats.kg_leftovers_total} vs ${(grams + g2) / 1000}`);
ok('kg_donated matches donated meal grams', D.stats && Math.abs(D.stats.kg_donated - g2 / 1000) < 0.2, `${D.stats && D.stats.kg_donated} vs ${g2 / 1000}`);
ok('kg_saved >= donated kg', D.stats && D.stats.kg_saved >= D.stats.kg_donated - 0.1, JSON.stringify(D.stats));
ok('carbon = kg_saved x 2.5', D.stats && Math.abs(D.carbon_kg - D.stats.kg_saved * 2.5) < 0.15, String(D.carbon_kg));
ok('donation + gathering visible', D.donations && D.donations.length === 1 && D.donations[0].status === 'agreed' && D.gatherings && D.gatherings.length === 1, JSON.stringify([D.donations, D.gatherings]));
ok('recent meals include both', D.meals && D.meals.length === 2);
ok('daily series has 30 days', D.daily && D.daily.length === 30);
ok('no family id leaked', !JSON.stringify(D).includes(F.family_id));
ok('badge: first donation earned', D.badges && D.badges.find(b => b.id === 'first_donation').earned === true);
ok('family info reflects update (size 6, city عنيزة)', D.family && D.family.household_size === 6 && D.family.city === 'عنيزة', JSON.stringify(D.family));

// 4) عزل الأسر والرموز الغلط
const other = (await req('POST', '/api/family', { city: 'جدة' })).json;
r = await req('GET', '/api/dashboard?t=' + encodeURIComponent(other.dash_token));
ok("other family's dashboard has none of our data", r.status === 200 && r.json.stats.meals_analyzed === 0 && r.json.meals.length === 0 && r.json.donations.length === 0, r.txt);
r = await req('GET', '/api/dashboard?t=not-a-real-token-123'); ok('wrong token -> 404', r.status === 404, r.status);
r = await req('GET', "/api/dashboard?t=x'%20or%201=1"); ok('malformed token -> 404', r.status === 404, r.status);

// 5) الأسرة التجريبية
if (SEED) {
  r = await req('POST', '/api/seed', { reset: true }, { 'x-seed-secret': SEED }); ok('seed: 61 demo families rebuilt (reset)', r.status === 200 && r.json.families === 61 && r.json.counts.meals > 2000, r.txt);
} else ok('seed skipped (no SEED_SECRET given)', true);
r = await req('POST', '/api/seed', {}, { 'x-seed-secret': 'wrong' }); ok('seed with wrong secret -> 401', r.status === 401, r.status);
r = await req('GET', '/api/dashboard?t=demo');
ok('demo dashboard is complete', r.status === 200 && r.json.family.is_demo === true && r.json.stats.meals_analyzed >= 30 && r.json.donations.length === 3 && r.json.gatherings.length === 3 && r.json.city_compare === null, r.txt && r.txt.slice(0, 200));
const page = await fetch(BASE + '/d/demo'); const html = await page.text();
ok('/d/demo page is served', page.status === 200 && html.includes('لوحة أسرتكم') && html.includes('أسرة تجريبية'), page.status);
// المرصد: بدون هوية، وبدون الأسر التجريبية إلا بطلب
const O1 = (await req('GET', '/api/observatory?days=30&demo=1')).json, O0 = (await req('GET', '/api/observatory?days=30&demo=0')).json;
const txt1 = JSON.stringify(O1);
ok('observatory (demo=1) has data + 61 demo families', O1 && O1.kpis && O1.kpis.meals > 1000 && O1.kpis.families_total >= 61, JSON.stringify(O1 && O1.kpis));
ok('observatory has no family_id / dash_token / lat / lng / uuid', !/family_id|dash_token|"lat"|"lng"|latitude|longitude/.test(txt1) && !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(txt1));
ok('observatory (demo=0) excludes demo families', O0 && O0.kpis && O0.kpis.families_total <= O1.kpis.families_total - 61 && O0.kpis.meals < 100, JSON.stringify(O0 && O0.kpis));
ok('observatory sections present (matrix, sankey, by_region, behavior)', O1.matrix.length >= 10 && O1.sankey.links.length >= 8 && O1.by_region.length === 13 && O1.behavior_change && O1.behavior_change.change_pct < 0, JSON.stringify(O1.behavior_change));
ok('regions with <3 families are hidden (no numbers)', O1.by_region.filter(x => x.hidden).every(x => x.kg_observed === undefined));
const OR = (await req('GET', '/api/observatory?days=90&demo=1&region=' + encodeURIComponent('القصيم'))).json;
ok('region filter works (القصيم only: بريدة + عنيزة)', OR && OR.region === 'القصيم' && OR.kpis.families_active > 0 && OR.kpis.families_active < O1.kpis.families_active && OR.by_city.every(c => ['بريدة', 'عنيزة', 'مدن أخرى'].includes(c.city)), JSON.stringify(OR && OR.kpis));
r = await req('GET', '/api/observatory?days=30&demo=1&region=%27%20or%201%3D1'); ok('invalid region ignored safely', r.status === 200 && r.json.region === null, r.status);
const IN = (await req('GET', '/api/insights?days=30&demo=1')).json;
ok('insights: 3 insights + 3 campaigns, each with a figure', IN && IN.insights.length === 3 && IN.campaigns.length === 3 && [...IN.insights, ...IN.campaigns].every(x => x.figure && x.text), JSON.stringify(IN).slice(0, 200));
for (const [path, must] of [['/observatory', 'مرصد سُفرة'], ['/d/demo', 'لوحة أسرتكم']]) { const pg = await fetch(BASE + path); const h = await pg.text(); ok(path + ' page served', pg.status === 200 && h.includes(must), pg.status) }
r = await req('POST', '/api/track', { family_id: 'x', dash_token: 'demo', type: 'chat' }); ok('demo cannot be written to', r.status === 404 || r.status === 403, r.status);

console.log('\nالنتيجة | الحالة | ملاحظة');
for (const x of rows) console.log(x.join(' | '));
const failed = rows.filter(x => x[0] === 'FAIL').length;
console.log(`\n${rows.length - failed}/${rows.length} نجحت`);
process.exit(failed ? 1 : 0);
