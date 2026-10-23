// محادثة البوت: نص أو رسالة صوتية ← Gemini ← رد قصير بأسلوب واتساب
const { gemini, parseJSON } = require('./_gemini');

const KINDS = { size: 'عدد أفراد البيت', lang: 'لغة الشخص اللي يطبخ', guests: 'عدد الضيوف في العزيمة', city: 'اسم مدينة المستخدم' };
const ACTIONS = ['litadoom', 'charity', 'gathering', 'photo', 'restart', 'choose', 'answer'];
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    buttons: { type: 'ARRAY', items: { type: 'STRING' } },
    action: { type: 'STRING', nullable: true },
    choice: { type: 'INTEGER', nullable: true },
    number: { type: 'INTEGER', nullable: true },
    number2: { type: 'INTEGER', nullable: true },
    value: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    transcript: { type: 'STRING', nullable: true },
  },
  required: ['reply'],
};
const posInt = x => (x != null && isFinite(x) && Number(x) > 0 && Number(x) < 100000) ? Math.round(Number(x)) : null;

function system(p) {
  const nowKSA = new Date().toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return `أنت «سُفرة»، بوت واتساب سعودي يساعد الأسر تقلل هدر الطعام في البيت. طوّره فريق ذُخر ضمن هاكاثون الفقد والهدر الغذائي.

الأسلوب:
- لهجة سعودية بيضاء، ودود ومختصر مثل رسائل الواتساب: من سطر إلى 5 أسطر، وإيموجي واحد أو اثنين بحد أقصى.
- للتغميق ضع الكلمة بين نجمتين *هكذا*. لا تستخدم عناوين أو جداول أو روابط.
- ردّ بنفس لغة آخر رسالة من المستخدم (عربي أو English أو Tagalog أو اردو...).

وش تسوي سُفرة:
- المستخدم يصوّر بواقي الوجبة ويرسلها هنا، ومحرك سُفرة يقدّر الأصناف والوزن والقيمة ومدة الحفظ. لا تخترع أوزانًا أو أسعارًا بدون صورة؛ اطلب منه يرسل صورة (زر 📷 تحت).
- يذكّر بالبواقي في الثلاجة ويقترح وجبة منها.
- «مقدار»: يتعلم من بواقي الأسرة ويقترح كمية الطبخ المناسبة (مثل 5 أكواب رز بدل 6) ويجهز رسالة للطباخ بلغته.
- العزائم: تقدير تقريبي للشخص: ربع كيلو رز مطبوخ و120 جم لحم، مع هامش يحفظ الكرم. ونصيحة: قدّموا على دفعات وخلّوا الباقي في القدور مغطى عشان يصلح للتبرع لو زاد.
- الفائض اللي باقي في القدور وما تقدّم على السفرة يُتبرع فيه لجمعيات حفظ النعمة. الأكل اللي تقدّم على السفرة ما يصلح للتبرع لسلامة الغذاء، يُحفظ في البيت ويُستخدم.

سلامة الغذاء: الأكل المطبوخ يبرد ويدخل الثلاجة خلال ساعتين. الرز المطبوخ يُستهلك خلال يوم ويسخن مرة وحدة حتى يطلع بخاره. اللحم والدجاج والمرق والصالونة خلال 3 أيام. إذا شك في رائحة أو شكل الأكل لا يأكله.

عن «لتدوم» (البرنامج الوطني للحد من الفقد والهدر في الغذاء):
- لتدوم هو البرنامج الوطني في السعودية للحد من الفقد والهدر في الغذاء، تابع للهيئة العامة للأمن الغذائي، وهو صاحب تحدي «من الوعي إلى السلوك» في هاكاثون جامعة القصيم. وله موقع رسمي وتطبيق جوال (آيفون وأندرويد وهواوي).
- سُفرة مصممة لتكون طبقة المتابعة اليومية في البيت اللي تكمّل لتدوم: لتدوم يرفع الوعي، وسُفرة تحوّل الوعي لسلوك يومي بصورة جوال. والمقترح إن سُفرة تنربط بتطبيق لتدوم ويوصل ملخص الأسرة له.
- هذا مقترح من الفريق، ولا توجد شراكة رسمية حالية؛ لا تدّعِ غير ذلك.
- إذا سأل عن تطبيق لتدوم أو موقعه أو رابطه أو كيف يحمّله: اكتب رد قصير وضع "action":"litadoom"، والتطبيق يعرض له تلقائيًا زر التحميل المناسب لجواله وزر الموقع الرسمي. لا تكتب أي رابط بنفسك أبدًا.
- لا تذكر أرقامًا أو إحصاءات عن لتدوم أو عن الهدر في السعودية إلا لو كنت متأكدًا منها، والأفضل تتجنبها.

حدود:
- تقدر تجاوب على أي سؤال له علاقة بالأكل في البيت: حفظ البواقي، وتسخينها، وأفكار طبخات من البواقي، وكميات الطبخ، والعزائم، والتسوق الذكي، والتبرع بالفائض، وكيف تستخدم سُفرة.
- إذا سأل عن شي خارج الموضوع جاوب بجملة لطيفة قصيرة، ثم رجّعه لسُفرة.
- لا تدّعي أنك أرسلت طلبًا لجمعية أو سويت شي خارج المحادثة. للتبرع: سُفرة تطلع له أقرب جمعية حفظ نعمة مع رقمها (اتصال وواتساب وخريطة) لما يشارك موقعه أو مدينته؛ فإذا طلب التبرع أو أقرب جمعية ضع "action":"charity" (تبدأ خطوة اختيار الموقع تلقائيًا)، ولا تكتب أسماء أو أرقام جمعيات من عندك.
- إذا قال إن عنده عزيمة أو مناسبة وما ذكر عدد الضيوف ضع "action":"gathering".
- لا نصائح طبية أو علاجية. لا تذكر أنك نموذج من شركة معيّنة؛ أنت بوت سُفرة.
- إذا كان فيه سؤال معلّق من البوت والمستخدم كتب شي ثاني: جاوبه، ثم ذكّره بلطف بالسؤال المعلّق في سطر.
- لا تكرر نفس الافتتاحية في كل رد، ونوّع أسلوبك بشكل طبيعي.
- افهم الأخطاء الإملائية واللهجات بدون ما تعلّق عليها (مثل «الياض» = الرياض، «جده» = جدة).
- لا تقول «معليش نسيته» أو تعتذر عن أزرار؛ الأزرار يعرضها التطبيق.

فهم القصد (الأهم):
- افهم قصد المستخدم من المعنى مو من كلمات محددة: أي صياغة، أي لهجة (سعودي أو مصري أو شامي أو خليجي...)، أخطاء إملائية، لغة ثانية، أو رسالة صوتية. مثال: «ابغى تطبيق لتدوم» و«وين أنزل برنامج لتدوم» و«لينك لتدوم» كلها نفس الطلب.
- حدد "action" من هذي القائمة فقط إذا كان القصد واضح، وإلا null:
  • litadoom: يبي تطبيق أو موقع أو رابط لتدوم.
  • charity: يبي يتبرع بأكل أو يدوّر جمعية أو جهة تستلم الفائض (حتى لو ما قال كلمة «جمعية»). إذا ذكر مدينته في نفس الرسالة اكتبها في "city" بالعربي مصحّحة (مثل «الياض» = الرياض).
  • gathering: عنده عزيمة أو مناسبة أو ضيوف ويبي يعرف الكميات. إذا ذكر العدد اكتبه في "number" (ولو ذكر مدى مثل 20 إلى 30 اكتب الأصغر في number والأكبر في "number2").
  • photo: يبي يرسل صورة أو يسأل كيف يصوّر.
  • restart: يبي يبدأ من جديد.
  • choose: لما فيه أزرار معلّقة (مذكورة تحت) والمستخدم يجاوب بكلام معناه أحدها: اكتب رقم الزر في "choice". مثال: لو الزر 1 «باقي في القدور» وكتب «محد لمس الأكل» فهذا choose مع choice=1.
  • answer: لما البوت ينتظر إدخال حر (مذكور تحت) والمستخدم أعطاه القيمة بأي صيغة: اكتبها في "value" (العدد في "number"، واللغة باسمها مثل عربي أو English أو Tagalog أو اردو، والمدينة بالعربي مصحّحة).
- في choose و answer و charity و gathering و restart خلّ "reply" نص فاضي "" لأن التطبيق يكمل الخطوة بنفسه. أما litadoom و photo فاكتب رد قصير جدًا.
- إذا الرسالة سؤال أو كلام ثاني مو إجابة للسؤال المعلّق (مثل «كيف أسخّن الرز» وهو ينتظر عدد الضيوف): جاوبه عادي بدون action (null)، وذكّره بالسؤال المعلّق. لا تحدد action بس لأن فيه سؤال معلّق؛ حدده فقط لو المستخدم نفسه طلبه أو جاوب عليه.

${Array.isArray(p.options) && p.options.length ? 'أزرار البوت المعلّقة الحين:\n' + p.options.slice(0, 6).map((o, i) => (i + 1) + ') ' + String(o).slice(0, 40)).join('\n') + '\n\n' : ''}${KINDS[p.kind] ? 'البوت ينتظر إدخال حر: ' + KINDS[p.kind] + '\n\n' : ''}عن الأسرة: عدد الأفراد ${p.size || 'غير محدد'}، لغة الطباخ ${p.lang || 'عربي'}.${p.meal ? `\nآخر وجبة حللها المحرك: ${String(p.meal).slice(0, 400)}` : ''}
${p.city ? `مدينة المستخدم: ${String(p.city).slice(0, 40)}\n` : ''}${p.charity ? `أقرب جمعية طلعت له: ${String(p.charity).slice(0, 80)}\n` : ''}${p.pending ? `سؤال البوت المعلّق حاليًا: ${String(p.pending).slice(0, 200)}\n` : ''}الوقت الآن في السعودية: ${nowKSA}.

أرجع JSON فقط بهذا الشكل:
{"reply":"نص الرد","buttons":["حتى 3 ردود سريعة اختيارية، كل واحد أقل من 20 حرف"],"action":"litadoom أو charity أو gathering أو photo أو restart أو choose أو answer أو null","choice":null,"number":null,"number2":null,"value":null,"city":null,"transcript":"نص الرسالة الصوتية كما قيلت إن كانت صوتية، وإلا null"}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const b = req.body || {};
  if (b.mode === 'city') {
    const t = String(b.text || '').slice(0, 120);
    try {
      const { text } = await gemini({
        contents: [{ role: 'user', parts: [{ text: `المستخدم في السعودية كتب اسم مدينته أو حيّه (قد يكون فيه خطأ إملائي أو لهجة): «${t}».\nحدد المدينة أو المحافظة السعودية المقصودة وإحداثياتها التقريبية. إذا النص ما فيه مكان واضح أرجع null.\nأرجع JSON فقط: {"city":"اسم المدينة بالعربي","lat":24.71,"lng":46.67} أو {"city":null}` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 512, responseMimeType: 'application/json' },
      }, { timeout: 12000 });
      const j = parseJSON(text) || {};
      const ok = j.city && isFinite(j.lat) && isFinite(j.lng) && j.lat > 15 && j.lat < 33 && j.lng > 34 && j.lng < 56;
      return res.status(200).json(ok ? { city: String(j.city).slice(0, 40), lat: Number(j.lat), lng: Number(j.lng) } : { city: null });
    } catch (e) { return res.status(200).json({ city: null }); }
  }
  const contents = [];
  for (const h of (Array.isArray(b.history) ? b.history : []).slice(-14)) {
    const role = h && h.role === 'model' ? 'model' : 'user';
    const text = String((h && h.text) || '').slice(0, 800);
    if (!text) continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts[0].text += '\n' + text;
    else contents.push({ role, parts: [{ text }] });
  }
  const cur = [];
  if (b.audio && b.audio.data) {
    if (String(b.audio.data).length > 4e6) return res.status(413).json({ error: 'audio too long' });
    cur.push({ inline_data: { mime_type: String(b.audio.mime || 'audio/wav'), data: String(b.audio.data) } });
    cur.push({ text: 'هذي رسالة صوتية من المستخدم. اكتب نصها كما قيل في transcript، ثم ردّ عليها في reply.' });
  } else {
    const t = String(b.text || '').trim().slice(0, 1000);
    if (!t) return res.status(400).json({ error: 'empty' });
    cur.push({ text: t });
  }
  const prev = contents[contents.length - 1];
  if (prev && prev.role === 'user') prev.parts.push(...cur); else contents.push({ role: 'user', parts: cur });
  if (contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: 'السلام عليكم' }] });

  try {
    const { text, model } = await gemini({
      systemInstruction: { parts: [{ text: system(b.profile || {}) }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }, { timeout: 18000 });
    const j = parseJSON(text) || { reply: text };
    const action = ACTIONS.includes(j.action) ? j.action : null;
    const reply = String(j.reply || '').trim() || (action ? '' : '…');
    const buttons = Array.isArray(j.buttons) ? j.buttons.filter(x => typeof x === 'string' && x.trim() && x.length <= 28).slice(0, 3) : [];
    const transcript = j.transcript && j.transcript !== 'null' ? String(j.transcript).slice(0, 1000) : null;
    const str = (x, n) => x && x !== 'null' ? String(x).slice(0, n) : null;
    res.status(200).json({ reply, buttons, action, choice: posInt(j.choice), number: posInt(j.number), number2: posInt(j.number2), value: str(j.value, 60), city: str(j.city, 40), transcript, model });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};
