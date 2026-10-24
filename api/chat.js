// محادثة البوت: نص أو رسالة صوتية ← Gemini ← رد قصير بأسلوب واتساب
const { gemini, parseJSON } = require('./_gemini');
const { saudi, dish, limited } = require('./_util');
const fsafe = require('./_foodsafety');
const { ready, family } = require('./_db');
const F = require('./_fridge');

const KINDS = { size: 'عدد أفراد البيت', lang: 'لغة الشخص اللي يطبخ', guests: 'عدد الضيوف في العزيمة', city: 'اسم مدينة المستخدم', name: 'اسم الصنف أو الطبق الصحيح (اكتبه في value بشكل قصير بالاسم السعودي)' };
const ACTIONS = ['litadoom', 'charity', 'gathering', 'photo', 'restart', 'choose', 'answer', 'impact', 'dashboard', 'fridge_add', 'fridge_update', 'fridge_list', 'safety_check'];
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING', enum: ['none', ...ACTIONS] },
    choice: { type: 'INTEGER', nullable: true },
    number: { type: 'INTEGER', nullable: true },
    number2: { type: 'INTEGER', nullable: true },
    value: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    reply: { type: 'STRING' },
    buttons: { type: 'ARRAY', items: { type: 'STRING' } },
    transcript: { type: 'STRING', nullable: true },
    // بيانات إجراءات الثلاجة والسلامة (الخادم يتحقق منها قبل أي كتابة)
    data: {
      type: 'OBJECT', nullable: true,
      properties: {
        items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, grams: { type: 'NUMBER', nullable: true }, storage: { type: 'STRING', enum: ['fridge', 'freezer'] }, cooked_hours_ago: { type: 'NUMBER', nullable: true }, estimated: { type: 'BOOLEAN' } }, required: ['name'] } },
        target: { type: 'STRING', nullable: true }, outcome: { type: 'STRING', nullable: true }, move_to: { type: 'STRING', nullable: true },
        hours_outside: { type: 'NUMBER', nullable: true }, hot: { type: 'BOOLEAN', nullable: true }, food: { type: 'STRING', nullable: true },
      },
    },
  },
  propertyOrdering: ['action', 'choice', 'number', 'number2', 'value', 'city', 'data', 'reply', 'buttons', 'transcript'],
  required: ['action', 'reply'],
};
const numIn = (x, min, max) => (x != null && x !== '' && isFinite(x) && Number(x) >= min && Number(x) <= max ? Number(x) : null);
// تنظيف بيانات الإجراء: ما يوصل للتطبيق (ثم للقاعدة) إلا قيم صالحة
function cleanData(action, d) {
  d = d && typeof d === 'object' ? d : {};
  if (action === 'fridge_add') {
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 10).map(i => {
      i = i || {}; const g = numIn(i.grams, 10, 50000);
      return { name: String(dish(i.name) || '').trim().slice(0, 40), grams: g == null ? null : Math.round(g), storage: i.storage === 'freezer' ? 'freezer' : 'fridge', cooked_hours_ago: numIn(i.cooked_hours_ago, 0, 168), estimated: !!i.estimated || g == null };
    }).filter(i => i.name);
    return items.length ? { items } : null;
  }
  if (action === 'fridge_update') {
    const target = String(d.target || '').trim().slice(0, 40), outcome = ['eaten', 'half', 'thrown', 'expired'].includes(d.outcome) ? d.outcome : null, move_to = d.move_to === 'freezer' ? 'freezer' : null;
    return target && (outcome || move_to) ? { target, outcome, move_to } : null;
  }
  if (action === 'safety_check') return { hours_outside: numIn(d.hours_outside, 0, 72), hot: !!d.hot, food: String(d.food || '').trim().slice(0, 40) || null };
  return null;
}
// لو النموذج ما حدد الإجراء لسؤال «كم يجلس X؟»: نلقط الأكل من النص ونعتبرها safety_check
function guessSafety(text) {
  if (!/(كم|مدة).{0,25}(يجلس|يبقى|يحفظ|ينحفظ|يعيش|تجلس|تبقى|صلاحي)/.test(text)) return null;
  const hit = fsafe.CATEGORIES.flatMap(c => c.match).filter(k => text.includes(k)).sort((a, b) => b.length - a.length)[0];
  return hit ? { hours_outside: null, hot: false, food: hit } : null;
}
// ردّ السلامة من القاعدة بشكل حتمي: حكم الوقت برا الثلاجة + مدة الحفظ + المصدر
function safetyAnswer(data, reply) {
  const sources = [], add = [];
  let verdict = null;
  const pushSrc = s => { const o = fsafe.SOURCES[s]; if (o && o.url && !sources.some(x => x.url === o.url)) sources.push({ name: o.name, url: o.url }) };
  if (data.hours_outside != null) {
    verdict = data.hours_outside > (data.hot ? 1 : 2) ? 'discard' : 'ok';
    if (verdict === 'discard') {
      if (!/غذاء والدواء|SFDA/.test(reply) || !/تخلص/.test(reply)) add.push('حسب الهيئة العامة للغذاء والدواء: الأكل المطبوخ ما يبقى برا الثلاجة أكثر من ساعتين (ساعة لو الجو فوق 32°م)، فالأفضل تتخلصون منه، وما نقترح التبرع فيه 🙏');
      fsafe.RULES.find(r => r.id === 'room_time').src.forEach(pushSrc);
    }
  }
  if (data.food) {
    const cat = fsafe.categorize(data.food), src = fsafe.SOURCES[cat.src];
    if (verdict !== 'discard' && !(reply.includes(cat.fridge_range.split(' ')[0]) && reply.includes(src.name.split(' ')[0]))) add.push('مدة حفظ ' + cat.label + ' في الثلاجة: ' + cat.fridge_range + (cat.freezer ? '، وفي الفريزر ' + cat.freezer : '') + '. (المصدر: ' + src.name + (src.url ? '' : '، والأفضل تتأكدون بالشكل والرائحة') + ')');
    pushSrc(cat.src);
  }
  return { verdict, sources: sources.slice(0, 3), extra: add.join('\n') };
}
const posInt = x => (x != null && isFinite(x) && Number(x) > 0 && Number(x) < 100000) ? Math.round(Number(x)) : null;
// بواقي الثلاجة الصالحة (لو أرسل التطبيق بيانات الأسرة) عشان الوصفات تنبني عليها. أي فشل أو بطء ما يوقف المحادثة
function fridgeLine(b) {
  if (!ready() || !b.family_id || !b.dash_token) return Promise.resolve('');
  const load = (async () => {
    const fam = await family(b.family_id, b.dash_token);
    if (!fam) return '';
    const open = (await F.loadOpen(fam.id)).filter(i => i.hours_left > 0).slice(0, 10);
    return open.map(i => i.name + (i.grams ? ' ' + Math.round(i.grams) + ' جم' : '') + (i.storage === 'freezer' ? ' (فريزر)' : '')).join('، ');
  })().catch(() => '');
  return Promise.race([load, new Promise(r => setTimeout(() => r(''), 2500))]);
}
// سؤال «ليش الأكل اللي تقدّم ما ينفع للتبرع؟»: نضمن ذكر المصدر من قاعدة السلامة
const WHY = /(ليش|ليه|لماذا|لمَ|ليشه|وش السبب|كيف ما|why)/i, DONATE = /(تبرع|تتبرع|نتبرع|جمعي|donat|charit)/i, SERVED = /(تقدم|انقدم|قدمنا|قدمناه|السفرة|سفرة|الصحن|الصحون|served|table|plate)/i;
const servedWhy = t => { t = String(t || '').replace(/[ً-ْ]/g, ''); return WHY.test(t) && DONATE.test(t) && SERVED.test(t) };

function system(p, fridge) {
  const nowKSA = new Date().toLocaleString('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return `أنت «سُفرة»، بوت واتساب سعودي يساعد الأسر تقلل هدر الطعام في البيت. طوّره فريق ذُخر ضمن هاكاثون الفقد والهدر الغذائي.

الأسلوب:
- لهجة سعودية بيضاء، ودود ومختصر مثل رسائل الواتساب: من سطر إلى 5 أسطر، وإيموجي واحد أو اثنين بحد أقصى.
- للتغميق ضع الكلمة بين نجمتين *هكذا*. لا تستخدم عناوين أو جداول أو روابط.
- ردّ بنفس لغة آخر رسالة من المستخدم (عربي أو English أو Tagalog أو اردو...).

أسلوب الكلام (سعودي أبيض):
- كلمات نستخدمها: وش، ليش، كذا، زين، الحين، بكرة، شوي، أبشر، تم، يعطيك العافية، بالعافية، الله يتمم، عساها عامرة، حيّاك، بعد (بمعنى أيضًا).
- كلمات ممنوعة: بندورة (نقول طماطم)، كتير، هلق، هيك، عايز، إزيك، ليه، بدّك، منيح، كمان، تمام قوي، أرز (نقول رز).
- أمثلة على الأسلوب الصحيح:
  • «أبشر! الرز المطبوخ يدخل الثلاجة خلال ساعتين، وسخّنوه مرة وحدة بس 🍚»
  • «زين، صوّروا القدور وأرسلوها، وأنا أحسب لكم الكمية الحين 📷»
  • «يعطيك العافية! الله يتمم عزيمتكم، وعساها عامرة 🌿»
- تنبيه: الأسلوب والأمثلة أعلاه للرد بالعربي فقط. إذا كتب المستخدم بالإنجليزي أو أي لغة غير العربي ردّ بنفس لغته (وبأسلوب ودود ومختصر)، ولا تردّ بالعربي أبدًا.
- لا تخترع أرقامًا أبدًا: الأوزان والقيم والأثر تجي من الوجبات المحللة فقط، وإذا ما فيه بيانات قل للمستخدم يرسل صورة.
- استثناء: مقادير الوصفات مو أرقام هدر، فاكتبها بأرقام عادية (جرام، كوب، ملعقة، حبة).

وش تسوي سُفرة:
- المستخدم يصوّر بواقي الوجبة ويرسلها هنا، ومحرك سُفرة يقدّر الأصناف والوزن والقيمة ومدة الحفظ. لا تخترع أوزانًا أو أسعارًا بدون صورة؛ اطلب منه يرسل صورة (زر 📷 تحت).
- يذكّر بالبواقي في الثلاجة ويقترح وجبة منها.
- «مقدار»: يتعلم من بواقي الأسرة ويقترح كمية الطبخ المناسبة (مثل 5 أكواب رز بدل 6) ويجهز رسالة للطباخ بلغته.
- العزائم: تقدير تقريبي للشخص: ربع كيلو رز مطبوخ و120 جم لحم، مع هامش يحفظ الكرم. ونصيحة: قدّموا على دفعات وخلّوا الباقي في القدور مغطى عشان يصلح للتبرع لو زاد.
- الفائض اللي باقي في القدور وما تقدّم على السفرة يُتبرع فيه لجمعيات حفظ النعمة. الأكل اللي تقدّم على السفرة ما يصلح للتبرع لسلامة الغذاء، يُحفظ في البيت ويُستخدم.
- لو سأل ليش الأكل اللي تقدّم على السفرة ما ينفع للتبرع حتى لو نظيف أو ما انلمس: وضّح بلطف وبدون لوم إن الأكل اللي انقدّم يتعرض للتلوث (أيادي وملاعق وقرب من الناس ووقت برا التبريد) حتى لو شكله نظيف، وإن الجمعيات تستقبل الأكل اللي ما انقدّم (الباقي في القدور) حفاظًا على سلامة المستفيدين. لازم الرد يذكر النقطتين (التلوث + الجمعيات تستقبل اللي ما انقدّم)، ثم المصدر بهالصيغة: «حسب قاعدة السلامة في سُفرة المبنية على إرشادات الهيئة العامة للغذاء والدواء». واقترح بسطر إنه يستفيد منه في البيت (يبرّده بسرعة أو يسوي منه طبخة). هذا سؤال توضيح: action = none.

الوصفات:
- لو طلب وصفة أو طبخة (من بواقيه أو بمقادير ذكرها): أعطه الوصفة مباشرة في نفس الرد بدون ما ترجع تسأله: سطر فيه اسم الطبخة، ثم المقادير بأرقام (كل مقدار بسطر يبدأ بـ•) مناسبة لعدد الأشخاص اللي ذكره، وإلا لعدد أفراد البيت، ثم من 3 إلى 5 خطوات قصيرة مرقمة (1. 2. 3.). كل مقدار وكل خطوة في سطر مستقل (افصل بينها بسطر جديد \\n)، لا تكتبها في فقرة وحدة.
- ابنِ الوصفة على المقادير اللي ذكرها، وإلا على بواقي ثلاجته (الأقرب انتهاءً أولًا) وآخر وجبة حللها المحرك (مذكورة تحت)، وكمّل بأشياء موجودة عادة في البيت (بصل، زيت، بهارات...).
- لو فيها بواقي مطبوخة نبّه في الخطوات إنها تتسخن لين 75°م ومرة وحدة بس، ولا تستخدم شي انتهت مدته.
- لا تسأل إلا لو طلبه غامض جدًا (مثل «عطني وصفة» بدون أي مقادير ولا بواقي معروفة)، وحتى وقتها أعطه اقتراح أولي كامل بنفس الشكل، ثم سؤال واحد قصير بالآخر.
- الوصفة مستثناة من حد الخمسة أسطر (لين 14 سطر تقريبًا). action = none.

${fsafe.promptBlock()}

قاعدة صريحة: معلومات السلامة ومدد الحفظ من هذي القاعدة فقط، واذكر مصدرها باختصار، وما تخترع رقم. لو الشي مو موجود، طبّق القاعدة العامة للبواقي ونبّه للتأكد بالشكل والرائحة.

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
  • impact: يسأل عن أثره أو كم وفّر أو ملخصه أو إنجازاته مع سُفرة (بأي صيغة).
  • dashboard: يبي لوحة أسرته أو سجله أو صفحة أرقامه (بأي صيغة).
  • fridge_add: يقول إنه حط أكل بالثلاجة أو الفريزر، أو عنده باقي أكل ويبي يسجّله («حطيت 2 كيلو مرقوق بالفريزر»، «باقي عندي رز من الغدا»). عبّ data.items: لكل صنف name قصير بالاسم السعودي، و grams بالجرام (1 كيلو = 1000)، ولو ما ذكر الوزن قدّره بتقدير معقول وخلّ estimated = true، و storage = fridge أو freezer، و cooked_hours_ago لو ذكر متى انطبخ.
  • fridge_update: يقول إنه أكل أو أكل نصف أو رمى أو خرب أكل مسجّل، أو نقل شي للفريزر («أكلنا الكبسة»، «رمينا الجريش»، «نقلت اللحم للفريزر»). data.target = اسم الصنف (أو all)، و data.outcome = eaten (أكلناه) أو half (نصه) أو thrown (رميناه) أو expired (خربان أو انتهت مدته)، أو data.move_to = freezer.
  • fridge_list: يسأل وش عنده بالثلاجة («وش عندي بالثلاجة؟»).
  • safety_check: أي سؤال عن سلامة الأكل أو مدة حفظه أو تسخينه أو كم له برا الثلاجة («الأكل له 3 ساعات برا يصلح؟»، «كم يجلس الجريش؟»، «كيف أسخن الرز؟»). data.hours_outside = كم ساعة برا الثلاجة لو ذكر، و data.hot = true لو قال الجو حار أو الأكل كان برا البيت بالصيف، و data.food = اسم الأكل لو ذكره. جاوب في reply من القاعدة مع ذكر المصدر باختصار. لو تجاوز الوقت برا الثلاجة (ساعتين، أو ساعة لو حار) انصحه بلطف يتخلص منه، ولا تقترح التبرع.
  • choose: لما فيه أزرار معلّقة (مذكورة تحت) والمستخدم يجاوب بكلام معناه أحدها: اكتب رقم الزر في "choice". مثال: لو الزر 1 «باقي في القدور» وكتب «محد لمس الأكل» فهذا choose مع choice=1.
  • answer: لما البوت ينتظر إدخال حر (مذكور تحت) والمستخدم أعطاه القيمة بأي صيغة: اكتبها في "value" (العدد في "number"، واللغة باسمها مثل عربي أو English أو Tagalog أو اردو، والمدينة بالعربي مصحّحة).
- الأرقام بالكلام: فهمها واكتبها رقمًا في "number" (مثل «خمسة» = 5، «عشرين» = 20، «ثلاثين تقريبًا» = 30، «درزن» = 12، «نص مية» = 50، «خمسة وعشرين» = 25).
- في choose و answer و charity و gathering و restart و impact و dashboard و fridge_add و fridge_update و fridge_list خلّ "reply" نص فاضي "" لأن التطبيق يكمل الخطوة بنفسه. أما litadoom و photo فاكتب رد قصير جدًا.
- إذا الرسالة سؤال أو كلام ثاني مو إجابة للسؤال المعلّق (مثل «كيف أسخّن الرز» وهو ينتظر عدد الضيوف): جاوبه عادي بدون action (null)، وذكّره بالسؤال المعلّق. لا تحدد action بس لأن فيه سؤال معلّق؛ حدده فقط لو المستخدم نفسه طلبه أو جاوب عليه.

${Array.isArray(p.options) && p.options.length ? 'أزرار البوت المعلّقة الحين:\n' + p.options.slice(0, 6).map((o, i) => (i + 1) + ') ' + String(o).slice(0, 40)).join('\n') + '\n\n' : ''}${KINDS[p.kind] ? 'البوت ينتظر إدخال حر: ' + KINDS[p.kind] + '\n\n' : ''}عن الأسرة: عدد الأفراد ${p.size || 'غير محدد'}، لغة الطباخ ${p.lang || 'عربي'}.${p.stats ? '\nسجل الأسرة الحقيقي: ' + String(p.stats).slice(0, 300) + ' (لا تذكر أرقامًا غير هذي).' : ''}${p.meal ? `\nآخر وجبة حللها المحرك: ${String(p.meal).slice(0, 400)}` : ''}${fridge ? `\nبواقي الثلاجة الصالحة الحين (الأقرب انتهاءً أولًا): ${String(fridge).slice(0, 400)}` : ''}
${p.city ? `مدينة المستخدم: ${String(p.city).slice(0, 40)}\n` : ''}${p.charity ? `أقرب جمعية طلعت له: ${String(p.charity).slice(0, 80)}\n` : ''}${p.pending ? `سؤال البوت المعلّق حاليًا: ${String(p.pending).slice(0, 200)}\n` : ''}الوقت الآن في السعودية: ${nowKSA}.

أرجع JSON فقط بهذا الشكل (action = none لو ما فيه إجراء):
{"reply":"نص الرد","buttons":["حتى 3 ردود سريعة اختيارية، كل واحد أقل من 20 حرف"],"action":"litadoom أو charity أو gathering أو photo أو restart أو choose أو answer أو null","choice":null,"number":null,"number2":null,"value":null,"city":null,"transcript":"نص الرسالة الصوتية كما قيلت إن كانت صوتية، وإلا null"}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res)) return;
  const b = req.body || {};
  if (b.mode === 'cook') {
    const lang = String(b.lang || 'عربي').slice(0, 20), rec = String(b.text || '').slice(0, 300);
    const ar = /عرب|arab/i.test(lang);
    try {
      const { text } = await gemini({
        contents: [{ role: 'user', parts: [{ text: `اكتب جملة واحدة قصيرة موجهة للطباخ أو الطباخة في البيت بلغة (${lang})${ar ? ' وبلهجة سعودية بيضاء' : ''} تنقل هذي التوصية بالضبط بدون أي أرقام أو معلومات جديدة: «${rec}».\nأرجع الجملة فقط بدون علامات تنصيص أو مقدمات.` }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }, { timeout: 12000 });
      const t = text.trim().replace(/^["«“]+|["»”]+$/g, '').slice(0, 300);
      return res.status(200).json({ text: t ? (ar ? saudi(t) : t) : null });
    } catch (e) { return res.status(200).json({ text: null }); }
  }
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
    // رسالة بلغة غير العربي: نذكّر النموذج يردّ بنفس اللغة
    cur.push({ text: !/[؀-ۿ]/.test(t) && /[A-Za-z]{3,}/.test(t) ? t + '\n\n(Reply in the same language as this message, not in Arabic.)' : t });
  }
  const prev = contents[contents.length - 1];
  if (prev && prev.role === 'user') prev.parts.push(...cur); else contents.push({ role: 'user', parts: cur });
  if (contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: 'السلام عليكم' }] });

  try {
    const fridge = await fridgeLine(b);
    const { text, model } = await gemini({
      systemInstruction: { parts: [{ text: system(b.profile || {}, fridge) }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }, { timeout: 18000 });
    const j = parseJSON(text) || { reply: text };
    let action = ACTIONS.includes(j.action) ? j.action : null;
    let data = action ? cleanData(action, j.data) : null;
    const userText = !(b.audio && b.audio.data) ? String(b.text || '') : '';
    if (!action) { const g = guessSafety(userText); if (g) { action = 'safety_check'; data = g } }
    if ((action === 'fridge_add' || action === 'fridge_update') && !data) action = null;   // بيانات ناقصة: ما نكتب شي
    // نطبّع الرد للأسلوب السعودي إلا لو المستخدم يكلّمنا بلغة ثانية
    const norm = x => (/[؀-ۿ]/.test(x) ? saudi(x) : x);
    let reply = norm(String(j.reply || '').trim()) || (action ? '' : '…');
    let verdict = null, sources = [];
    if (action === 'safety_check') { const s = safetyAnswer(data || {}, reply === '…' ? '' : reply); verdict = s.verdict; sources = s.sources; if (s.extra) reply = (reply === '…' ? '' : reply + '\n\n') + norm(s.extra) }
    if (!action && (j.action === 'fridge_add' || j.action === 'fridge_update') && reply === '…') reply = 'وضّحوا لي الصنف والكمية أكثر 🙏';
    if (servedWhy(userText) && reply !== '…') {
      if (action === 'charity') action = null;
      if (!action) {
        if (/[؀-ۿ]/.test(reply) && !/غذاء والدواء|SFDA/.test(reply)) reply += '\n\n(المصدر: قاعدة السلامة في سُفرة، مبنية على إرشادات الهيئة العامة للغذاء والدواء)';
        sources = [{ name: fsafe.SOURCES.sfda.name, url: fsafe.SOURCES.sfda.url }];
      }
    }
    const buttons = Array.isArray(j.buttons) ? j.buttons.filter(x => typeof x === 'string' && x.trim() && x.length <= 28).map(norm).slice(0, 3) : [];
    const transcript = j.transcript && j.transcript !== 'null' ? String(j.transcript).slice(0, 1000) : null;
    const str = (x, n) => x && x !== 'null' ? String(x).slice(0, n) : null;
    // عدد الضيوف مكتوب بأرقام بالنص لكن النموذج فاته: نلقطه من الرسالة
    let number = posInt(j.number);
    if (action === 'gathering' && number == null) { const d = userText.replace(/[٠-٩]/g, ch => '٠١٢٣٤٥٦٧٨٩'.indexOf(ch)).match(/\d+/); if (d) number = posInt(d[0]) }
    res.status(200).json({ reply, buttons, action, choice: posInt(j.choice), number, number2: posInt(j.number2), value: str(j.value, 60), city: str(j.city, 40), data, verdict, sources, transcript, model });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
};
