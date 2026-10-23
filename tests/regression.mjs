// اختبار انحدار على الموقع المنشور: node tests/regression.mjs   (أو BASE=https://... node tests/regression.mjs)
// يتحقق من فهم القصد (action/value/number) ومن خلو الردود من الكلمات الممنوعة (اللهجة السعودية)، ويختبر /api/analyze بصورتين.
// الخادم يحدّ الطلبات بـ 20 بالدقيقة لكل IP، فالسكربت يتمهّل بين الطلبات ويعيد المحاولة عند 429. لا يحتوي أي مفاتيح.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = (process.env.BASE || 'https://sufra-whatsapp.vercel.app').replace(/\/$/, '');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GAP = 3300; // ≈ 18 طلب بالدقيقة

// كلمات ممنوعة (لهجات ثانية، أو ألفاظ نستبدلها): بحدود الكلمة العربية
const BANNED = ['بندورة', 'كتير', 'هلق', 'هيك', 'عايز', 'إزيك', 'ليه', 'بدّك', 'بدك', 'منيح', 'كمان', 'تمام قوي', 'أرز', 'ارز'];
const bannedRe = new RegExp('(?<![ء-ي])(?:' + BANNED.join('|') + ')(?![ء-ي])');
const hasBanned = s => { const m = String(s || '').match(bannedRe); return m ? m[0] : null };

async function post(path, body, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429) { const w = Number(r.headers.get('retry-after')) || 15; await sleep((w + 1) * 1000); continue; }
    if (!r.ok && r.status >= 500 && i < tries - 1) { await sleep(2500); continue; }
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }
  return { status: 429, json: {} };
}

const NONE = ['none', null, undefined, ''];
const P = (kind, options, pending) => ({ kind, options, pending });
const SIZE = P('size', ['1 – 3', '4 – 6', '7 أو أكثر'], 'كم عدد أفراد البيت؟');
const GUESTS = P('guests', ['10 – 20', '20 – 30', 'أكثر من 30'], 'كم عدد الضيوف تقريبًا؟');
const CITY = P('city', ['📍 مشاركة الموقع', '🏙️ أكتب مدينتي'], 'اكتبوا اسم مدينتكم');
const AGE = P('', ['أقل من ساعتين', 'من ساعتين لـ4', 'أكثر من 4 ساعات'], 'متى انطبخ الأكل؟');

// كل حالة: نص، سياق معلّق (اختياري)، والتحقق
const CASES = [
  // لتدوم بأربع صيغ
  ['لتدوم 1', 'عطني رابط تطبيق لتدوم', null, r => r.action === 'litadoom'],
  ['لتدوم 2', 'ابغى برنامج لتدوم وين انزله', null, r => r.action === 'litadoom'],
  ['لتدوم 3', 'لينك لتدوم', null, r => r.action === 'litadoom'],
  ['لتدوم 4 (إنجليزي)', 'how can I download the Litadoom app', null, r => r.action === 'litadoom'],
  // تبرع بصيغتين
  ['تبرع 1', 'عندي اكل زايد وين اودّيه', null, r => r.action === 'charity'],
  ['تبرع 2', 'ابغى اتبرع بالفايض واني في جده', null, r => r.action === 'charity' && /جد/.test(r.city || '')],
  // عزيمة بعدد وبدون
  ['عزيمة بعدد', 'جاينا ضيوف الليلة حوالي 35', null, r => r.action === 'gathering' && r.number === 35],
  ['عزيمة بدون عدد', 'عازمين ناس بكرة', null, r => r.action === 'gathering' && !r.number],
  // أرقام بالكلام (الخطوة المعلقة)
  ['رقم: احنا خمسة', 'احنا خمسة بالبيت', SIZE, r => (r.action === 'answer' && (r.number === 5 || /5|خمس/.test(r.value || ''))) || (r.action === 'choose' && r.choice === 2)],
  ['رقم: عشرين ضيف', 'عشرين ضيف', GUESTS, r => ['answer', 'gathering'].includes(r.action) && r.number === 20],
  ['رقم: ثلاثين تقريبًا', 'ثلاثين تقريبًا', GUESTS, r => ['answer', 'gathering'].includes(r.action) && r.number === 30],
  ['رقم: درزن', 'درزن', GUESTS, r => ['answer', 'gathering'].includes(r.action) && r.number === 12],
  // مدن فيها أخطاء إملائية
  ['مدينة: الياض', 'الياض', CITY, r => r.action === 'answer' && /الرياض/.test((r.value || '') + (r.city || ''))],
  ['مدينة: جده', 'جده', CITY, r => r.action === 'answer' && /جد[ةه]/.test((r.value || '') + (r.city || ''))],
  ['مدينة: بريده', 'بريده', CITY, r => r.action === 'answer' && /بريد/.test((r.value || '') + (r.city || ''))],
  // أسئلة عامة
  ['تسخين', 'كيف اسخن الرز', null, r => NONE.includes(r.action) && r.reply.length > 10],
  ['خارج الموضوع', 'من فاز بكأس العالم 2018؟', null, r => NONE.includes(r.action) && r.reply.length > 5],
  ['إنجليزي', 'How should I store leftover rice?', null, r => NONE.includes(r.action) && /[A-Za-z]{4,}/.test(r.reply)],
  // وش أثري
  ['أثري 1', 'وش اثري', null, r => r.action === 'impact'],
  ['أثري 2', 'كم وفرت لين الحين', null, r => r.action === 'impact'],
  ['أثري 3', 'ابي ملخص انجازاتي مع سفرة', null, r => r.action === 'impact'],
  ['لوحة الأسرة 1', 'وين اشوف لوحة اسرتي', null, r => r.action === 'dashboard'],
  ['لوحة الأسرة 2', 'ابي ارجع لسجل وجباتنا', null, r => ['dashboard', 'impact'].includes(r.action)],
  // صورة وإعادة
  ['صورة', 'كيف ارسل لكم صورة الاكل', null, r => r.action === 'photo'],
  ['إعادة', 'خلنا نبدأ من الاول', null, r => r.action === 'restart'],
  // اختيار زر بكلام حر (سؤال متى انطبخ)
  ['اختيار: قبل ساعة', 'انطبخ قبل ساعة تقريبا', AGE, r => r.action === 'choose' && r.choice === 1],
  ['اختيار: من الصبح', 'من الصبح وهو برا', AGE, r => r.action === 'choose' && r.choice === 3],
  // لهجة: الرد ما فيه كلمات ممنوعة (بالسؤال عن الطماطم والرز)
  ['لهجة: بندورة', 'كيف احفظ البندورة المطبوخة', null, r => NONE.includes(r.action)],
  ['لهجة: أرز', 'وش اسوي بالارز الزايد من امس', null, r => NONE.includes(r.action)],
];

const rows = [];
let n = 0;
for (const [name, text, ctx, check] of CASES) {
  n++;
  const profile = ctx ? { kind: ctx.kind, options: ctx.options, pending: ctx.pending } : {};
  let res, why = '';
  for (let attempt = 0; attempt < 2; attempt++) {   // النموذج غير حتمي: نعيد الحالة مرة وحدة قبل ما نسجّل فشل
    res = await post('/api/chat', { text, history: [], profile });
    await sleep(GAP);
    const j = res.json || {};
    const bad = hasBanned(j.reply) || (j.buttons || []).map(hasBanned).find(Boolean);
    const pass = res.status === 200 && check({ reply: '', buttons: [], ...j }) && !bad;
    why = pass ? '' : (res.status !== 200 ? `HTTP ${res.status}` : bad ? `كلمة ممنوعة: ${bad}` : `action=${j.action} choice=${j.choice} number=${j.number} value=${j.value} city=${j.city}`);
    if (pass) break;
  }
  rows.push([n, name, why ? 'FAIL' : 'PASS', why]);
}

// /api/analyze بصورتين
const img = f => readFileSync(join(ROOT, f)).toString('base64');
{
  const r = await post('/api/analyze', { image: img('s-shakshuka.jpg'), mime: 'image/jpeg' }); await sleep(GAP);
  const j = r.json || {}, names = [j.dish_name, ...(j.items || []).map(i => i.name)].filter(Boolean).join(' | ');
  const pass = r.status === 200 && (/شكشوكة/.test(names) || (/بيض/.test(names) && /طماطم/.test(names))) && !hasBanned(names);
  rows.push([++n, 'analyze: s-shakshuka.jpg', pass ? 'PASS' : 'FAIL', `via=${j.via} ${names}`]);
}
{
  const r = await post('/api/analyze', { image: img('s-chair.jpg'), mime: 'image/jpeg' });
  const j = r.json || {};
  const pass = r.status === 200 && Array.isArray(j.items) && j.items.length === 0;
  rows.push([++n, 'analyze: s-chair.jpg (items فاضية)', pass ? 'PASS' : 'FAIL', `via=${j.via} items=${(j.items || []).length}`]);
}

console.log('\n# | الحالة | النتيجة | ملاحظة');
for (const r of rows) console.log(r.join(' | '));
const failed = rows.filter(r => r[2] === 'FAIL').length;
console.log(`\n${rows.length - failed}/${rows.length} نجحت`);
process.exit(failed ? 1 : 0);
