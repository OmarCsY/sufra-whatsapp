// تحليل صورة الوجبة: نرسلها لمحرك سُفرة (n8n) أولًا، وإذا تعذّر نحللها مباشرة عبر Gemini بنفس قواعد المحرك
const { gemini, parseJSON, fetchT } = require('./_gemini');

const RULES = [
  { match: ['رز', 'أرز'], price: 12, days: 1 },
  { match: ['دجاج'], price: 40, days: 3 },
  { match: ['لحم'], price: 70, days: 3 },
  { match: ['مرقوق', 'جريش'], price: 20, days: 3 },
  { match: ['سلطة'], price: 15, days: 1 },
  { match: ['صالونة', 'خضار', 'مرق'], price: 15, days: 3 },
];
const LARGE = 10;

const PROMPT = `حلل صورة وجبة الأكل المرفقة (بواقي بعد الأكل أو قدور)، وقدّر كل صنف ظاهر ووزنه بالجرام بدقة.
إذا لم تجد طعامًا في الصورة أرجع {"items": []}.
أسماء الأصناف بالعربي وقصيرة (مثل: رز، دجاج، لحم، جريش، مرقوق، سلطة، صالونة، خبز).
أرجع JSON فقط بهذا الشكل بدون أي مقدمات:
{"items":[{"name":"رز","grams":640,"confidence":0.84}],"next_day_suggestion":"اقتراح وجبة مبتكرة لبكرة من هذي البواقي بالذات (اسم الطبق فقط)"}`;

function shape(d) {
  const items = (Array.isArray(d.items) ? d.items : []).filter(i => i && i.name && Number(i.grams) > 0).map(i => {
    const r = RULES.find(r => r.match.some(k => String(i.name).includes(k))) || { price: 15, days: 1 };
    const grams = Math.round(Number(i.grams));
    return {
      name: String(i.name).slice(0, 40), grams,
      value_sar: Math.round(grams * r.price / 1000),
      safe_until: new Date(Date.now() + r.days * 864e5).toISOString(),
      confidence: i.confidence != null ? Number(i.confidence) : null,
    };
  });
  const totalGrams = items.reduce((s, i) => s + i.grams, 0);
  const servings = Math.round(totalGrams / 300);
  return {
    meal_id: null, items,
    total_value_sar: items.reduce((s, i) => s + i.value_sar, 0),
    servings_left: servings,
    fridge_prompt: items.length > 0,
    next_day_suggestion: items.length ? (d.next_day_suggestion || null) : null,
    family_recommendation: null,
    charity_suggestion: servings >= LARGE ? { name: 'جمعية حفظ النعمة الأقرب', city: 'الأقرب لنطاقك' } : null,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  const url = process.env.N8N_WEBHOOK_URL;

  // زر «دخل الثلاجة»
  if (b.action === 'fridge') {
    if (url && b.meal_id) {
      try { await fetchT(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'fridge', meal_id: b.meal_id, source: 'whatsapp' }) }, 15000); } catch (e) {}
    }
    return res.status(200).json({ ok: true });
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
        if (j && Array.isArray(j.items)) return res.status(200).json({ ...j, via: 'engine' });
      }
    } catch (e) {}
  }

  // 2) احتياطي: Gemini مباشرة بنفس قواعد الأسعار ومدد الحفظ
  try {
    const { text, model } = await gemini({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data } }, { text: PROMPT }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048, responseMimeType: 'application/json' },
    }, { timeout: 25000 });
    return res.status(200).json({ ...shape(parseJSON(text) || { items: [] }), via: 'gemini:' + model });
  } catch (e) {
    return res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};
