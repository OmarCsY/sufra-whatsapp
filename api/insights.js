// رؤى وتوصيات حملات توعوية: نرسل JSON المرصد (أرقام مجمعة بدون هوية) لـ Gemini، ونرجّع 3 رؤى و3 توصيات، كل وحدة تذكر رقمها.
// كاش 10 دقائق، ولو فشل أي شي نرجّع قوائم فاضية (الصفحة تخفي القسم).
const { limited, saudi } = require('./_util');
const { ready } = require('./_db');
const { gemini, parseJSON } = require('./_gemini');
const { getObservatory } = require('./_obs');

const TTL = 10 * 60e3, cache = new Map();
const EMPTY = { insights: [], campaigns: [] };
const ITEM = { type: 'OBJECT', properties: { title: { type: 'STRING' }, text: { type: 'STRING' }, figure: { type: 'STRING' } }, required: ['title', 'text', 'figure'] };
const SCHEMA = { type: 'OBJECT', properties: { insights: { type: 'ARRAY', items: ITEM }, campaigns: { type: 'ARRAY', items: ITEM } }, required: ['insights', 'campaigns'] };
const clean = a => (Array.isArray(a) ? a : []).slice(0, 3).map(x => ({ title: saudi(String(x.title || '').slice(0, 80)), text: saudi(String(x.text || '').slice(0, 400)), figure: String(x.figure || '').slice(0, 40) })).filter(x => x.title && x.text && x.figure);

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'public, s-maxage=300');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (limited(req, res, 10)) return;
  const q = req.query || {}, days = [7, 30, 90].includes(Number(q.days)) ? Number(q.days) : 30, demo = q.demo === '1' || q.demo === 'true', region = q.region ? String(q.region).slice(0, 30) : null;
  const key = `${days}|${demo ? 1 : 0}|${region || ''}`, hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return res.status(200).json(hit.data);
  let out = EMPTY;
  try {
    if (!ready() || !process.env.GEMINI_API_KEY) return res.status(200).json(EMPTY);
    const d = await getObservatory({ days, demo, region });
    if (!d.kpis || !d.kpis.meals) return res.status(200).json(EMPTY);
    const brief = { الفترة_بالأيام: days, بيانات_توضيحية: demo, المنطقة: region || 'كل المناطق', المؤشرات: d.kpis, تغير_السلوك: d.behavior_change, المدن: (d.by_city || []).slice(0, 8), المناطق: (d.by_region || []).filter(r => !r.hidden && !r.empty), الفئات: (d.by_category || []).slice(0, 7), الأصناف: d.top_items, يوم_الأسبوع: d.by_weekday, الوجبات: d.by_slot, المناسبات: d.by_occasion, المصائر: d.outcomes, الرز: d.rice, التبرعات: (d.donations || []).slice(0, 6) };
    const { text } = await gemini({
      systemInstruction: { parts: [{ text: 'أنت محلل بيانات في فريق «ذُخر»، تقترح رؤى وحملات توعوية لبرنامج وطني للحد من هدر الطعام (لوحة مقترحة، مو رسمية). اكتب بالعربي ولهجة سعودية بيضاء مختصرة.\nقواعد صارمة: اعتمد على أرقام JSON المرفق فقط ولا تخترع أي رقم أو نسبة أو مقارنة غير موجودة فيه. كل رؤية وكل توصية لازم تذكر رقمها الفعلي في حقل figure (مثل «41%» أو «2.5 كجم») وفي النص. لو البيانات توضيحية لا تقل إنها حقيقية.\nأرجع بالضبط 3 رؤى (insights): ملاحظات عن السلوك والبواقي. و3 توصيات لحملات توعوية (campaigns): كل وحدة فيها فكرة حملة عملية، والفئة المستهدفة، والرقم اللي تستند عليه.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(brief) }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }, { timeout: 30000 });
    const j = parseJSON(text) || {};
    const r = { insights: clean(j.insights), campaigns: clean(j.campaigns) };
    if (r.insights.length || r.campaigns.length) out = r;
  } catch (e) { out = EMPTY }
  if (out !== EMPTY) { cache.set(key, { ts: Date.now(), data: out }); if (cache.size > 40) cache.delete(cache.keys().next().value) }
  return res.status(200).json(out);
};
