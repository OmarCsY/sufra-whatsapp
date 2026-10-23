// تحليل صورة الوجبة: نرسلها لمحرك سُفرة (n8n) أولًا، وإذا تعذّر نحللها مباشرة عبر Gemini بنفس قواعد المحرك
const { gemini, parseJSON, fetchT } = require('./_gemini');
const { saudi, dish, inferDish, limited } = require('./_util');

// جدول الأسعار (ريال/كجم) ومدة الحفظ (أيام). الأول المطابق يفوز، فالأخص قبل الأعم.
const FRUITS = ['تفاح', 'موز', 'برتقال', 'عنب', 'بطيخ', 'شمام', 'فراولة', 'مانجو', 'فواكه', 'فاكهة', 'كرز', 'توت', 'رمان', 'خوخ', 'كمثرى', 'تين'];
const RULES = [
  { match: FRUITS, price: 10, days: 3 },
  { match: ['كنافة', 'بسبوسة', 'كيك', 'لقيمات', 'حلا'], price: 30, days: 3 },
  { match: ['مرقوق', 'جريش', 'قرصان', 'مطازيز', 'هريس', 'سليق', 'مكرونة'], price: 20, days: 3 },
  { match: ['تمر'], price: 30, days: 30 },
  { match: ['رز', 'أرز', 'كبسة', 'مندي', 'مضغوط', 'برياني', 'مقلوبة'], price: 12, days: 1 },
  { match: ['دجاج'], price: 40, days: 3 },
  { match: ['لحم', 'كبدة', 'مفطح', 'خروف', 'غنم'], price: 70, days: 3 },
  { match: ['سمك', 'روبيان'], price: 60, days: 3 },
  { match: ['سلطة'], price: 15, days: 1 },
  { match: ['شكشوكة', 'بيض'], price: 15, days: 2 },
  { match: ['صالونة', 'خضار', 'مرق', 'فول'], price: 15, days: 3 },
  { match: ['خبز', 'تميس', 'صامولي'], price: 8, days: 2 },
];
const DEFAULT_RULE = { price: 15, days: 1 };
const rule = name => RULES.find(r => r.match.some(k => String(name).includes(k))) || DEFAULT_RULE;
const LARGE = 10;

const PROMPT = `حلل صورة وجبة الأكل المرفقة (بواقي بعد الأكل أو قدور أو طبق كامل)، وقدّر كل صنف ظاهر ووزنه بالجرام بدقة.
- سمِّ الأطباق بأسمائها السعودية الشائعة: كبسة، مندي، مضغوط، جريش، قرصان، مرقوق، مطازيز، هريس، سليق، صالونة، مقلوبة، شكشوكة، فول، تميس، كبدة، معصوب.
- الطبق المركّب قسّمه لمكوّنات منفصلة في items (رز، دجاج، لحم...)، وارجع dish_name باسم الطبق كامل (مثل: كبسة دجاج).
- حلل أيضًا الفواكه والخبز والتمر والحلويات إذا ظهرت في الصورة.
- لكل صنف: state = "باقي" لو الأكل مأكول منه أو بقايا، و"سليم" لو ما انلمس (قدر كامل أو صينية ما أحد أكل منها)، و confidence رقم بين 0 و 1.
- أسماء الأصناف بالعربي وقصيرة، واستخدم «رز» مو «أرز» و«طماطم» مو «بندورة».
- إذا لم تجد طعامًا في الصورة أرجع items فاضية و dish_name = null.
- next_day_suggestion: اقتراح وجبة مبتكرة لبكرة من هذي البواقي بالذات (اسم الطبق فقط).
أرجع JSON فقط بهذا الشكل بدون أي مقدمات:
{"dish_name":"كبسة دجاج","items":[{"name":"رز","grams":640,"state":"باقي","confidence":0.84}],"next_day_suggestion":"..."}`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    dish_name: { type: 'STRING', nullable: true },
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, grams: { type: 'NUMBER' }, state: { type: 'STRING', enum: ['باقي', 'سليم'] }, confidence: { type: 'NUMBER' } }, required: ['name', 'grams'] } },
    next_day_suggestion: { type: 'STRING', nullable: true },
  },
  propertyOrdering: ['dish_name', 'items', 'next_day_suggestion'],
  required: ['items'],
};

const STATES = ['باقي', 'سليم'];
function priced(name, grams) {
  const r = rule(name);
  return { value_sar: Math.round(grams * r.price / 1000), safe_until: new Date(Date.now() + r.days * 864e5).toISOString() };
}

function shape(d) {
  const items = (Array.isArray(d.items) ? d.items : []).filter(i => i && i.name && Number(i.grams) > 0).map(i => {
    const name = dish(i.name).slice(0, 40);
    const grams = Math.round(Number(i.grams));
    return {
      name, grams, ...priced(name, grams),
      state: STATES.includes(i.state) ? i.state : 'باقي',
      confidence: i.confidence != null && isFinite(i.confidence) ? Number(i.confidence) : null,
    };
  });
  const totalGrams = items.reduce((s, i) => s + i.grams, 0);
  const servings = Math.round(totalGrams / 300);
  return {
    meal_id: null, items,
    dish_name: items.length ? (d.dish_name ? dish(d.dish_name) : inferDish(items)) : null,
    total_value_sar: items.reduce((s, i) => s + i.value_sar, 0),
    servings_left: servings,
    fridge_prompt: items.length > 0,
    next_day_suggestion: items.length && d.next_day_suggestion ? saudi(String(d.next_day_suggestion)) : null,
    family_recommendation: null,
    charity_suggestion: servings >= LARGE ? { name: 'جمعية حفظ النعمة الأقرب', city: 'الأقرب لنطاقك' } : null,
  };
}

// مخرجات محرك n8n: نطبّع الأسماء بقاموس الأطباق والأسلوب السعودي (بدون لمس أسعار المحرك)
function clean(j) {
  const items = (j.items || []).map(i => (i && i.name ? { ...i, name: dish(i.name) } : i));
  const out = { ...j, items };
  const good = items.filter(i => i && i.name);
  out.dish_name = j.dish_name ? dish(j.dish_name) : (good.length ? inferDish(good) : null);
  if (j.next_day_suggestion) out.next_day_suggestion = saudi(String(j.next_day_suggestion));
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res)) return;
  const b = req.body || {};
  const url = process.env.N8N_WEBHOOK_URL;

  // زر «دخل الثلاجة»
  if (b.action === 'fridge') {
    if (url && b.meal_id) {
      try { await fetchT(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fridge', meal_id: b.meal_id, source: 'whatsapp' }) }, 15000); } catch (e) {}
    }
    return res.status(200).json({ ok: true });
  }

  // إعادة تسعير أصناف بعد تصحيح المستخدم لها (نفس جدول الأسعار)
  if (b.action === 'price') {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 20).map(i => {
      const name = dish(String((i && i.name) || '').slice(0, 40));
      const grams = Math.max(0, Math.round(Number(i && i.grams) || 0));
      return { name, grams, ...priced(name, grams) };
    });
    return res.status(200).json({ items });
  }

  const data = String(b.image || '');
  if (!data) return res.status(400).json({ error: 'image missing' });
  if (data.length > 4e6) return res.status(413).json({ error: 'image too large' });
  const mime = String(b.mime || 'image/jpeg');

  // 1) محرك سُفرة على n8n (يسجّل الوجبة في Supabase بمصدر «واتساب»)
  if (url) {
    try {
      const fd = new FormData();
      fd.append('source', 'whatsapp');
      fd.append(process.env.ENGINE_FIELD || 'data', new Blob([Buffer.from(data, 'base64')], { type: mime }), 'meal.jpg');
      const r = await fetchT(url, { method: 'POST', body: fd }, 40000);
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.items)) return res.status(200).json({ ...clean(j), via: 'engine' });
      }
    } catch (e) {}
  }

  // 2) احتياطي: Gemini مباشرة بنفس قواعد الأسعار ومدد الحفظ
  try {
    const { text, model } = await gemini({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }, { timeout: 25000 });
    return res.status(200).json({ ...shape(parseJSON(text) || { items: [] }), via: 'gemini:' + model });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};
