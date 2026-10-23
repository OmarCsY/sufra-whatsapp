// قاعدة معرفة سلامة الغذاء لسُفرة: كل رقم هنا له مصدر رسمي، أو مكتوب صراحة أنه تقدير متحفظ من سُفرة.
// نستخدم الحد الأدنى من أي مدى (مثل 3–4 أيام ← 3) احتياطًا.

const SOURCES = {
  sfda: { name: 'الهيئة العامة للغذاء والدواء (SFDA)', title: 'بقايا الطعام', url: 'https://www.sfda.gov.sa/ar/awarenessarticle/78254' },
  usda_chart: { name: 'FoodSafety.gov (USDA/FDA)', title: 'Cold Food Storage Chart', url: 'https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts' },
  usda_leftovers: { name: 'USDA FSIS', title: 'Leftovers and Food Safety', url: 'https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/leftovers-and-food-safety' },
  fss_rice: { name: 'Food Standards Scotland', title: 'Rice', url: 'https://foodstandards.gov.scot/consumers/food-safety/at-home/rice' },
  sufra: { name: 'سُفرة (تقدير متحفظ)', title: 'قيمة متحفظة غير مأخوذة من جدول رسمي، والأفضل التأكد بالشكل والرائحة', url: null },
};

// قواعد عامة تنطبق على كل الأكل
const RULES = [
  { id: 'room_time', text: 'لا يُترك الأكل المطبوخ في درجة حرارة الغرفة أكثر من ساعتين، وساعة واحدة فقط إذا الجو فوق 32°م، وبعدها يُتخلّص منه.', src: ['sfda', 'usda_leftovers'] },
  { id: 'temps', text: 'الثلاجة 4°م أو أقل، والفريزر -18°م أو أقل.', src: ['usda_chart'] },
  { id: 'cooling', text: 'برّدوه بسرعة: قسّموا الكميات الكبيرة على أكثر من إناء، واستخدموا أواني مسطحة، وقطّعوا اللحم والدجاج لقطع صغيرة، وغطّوا الأكل.', src: ['sfda', 'usda_leftovers'] },
  { id: 'reheat', text: 'سخّنوا البواقي لين توصل 75°م (يطلع بخارها من كل الجهات)، والشوربة والمرق لين تغلي، وغطّوا الأكل وقت التسخين.', src: ['sfda', 'usda_leftovers'] },
  { id: 'rice', text: 'الرز المطبوخ: برّدوه خلال ساعة، وخلوه بالثلاجة، وكلوه خلال 24 ساعة، ولا تسخّنونه أكثر من مرة.', src: ['fss_rice'] },
  { id: 'leftovers_general', text: 'البواقي المطبوخة عمومًا تجلس في الثلاجة 3–4 أيام، وفي الفريزر 3–4 شهور.', src: ['usda_leftovers'] },
  { id: 'thaw', text: 'فكّوا التجميد داخل الثلاجة، وبعد ما يذوب استخدموه خلال 3–4 أيام.', src: ['usda_leftovers'] },
  { id: 'doubt', text: 'إذا تغيّرت الرائحة أو الشكل أو صار فيه لزوجة أو عفن، أو شكّيتوا في سلامته: تخلّصوا منه ولا تذوقونه.', src: ['usda_leftovers'] },
  { id: 'donation', text: 'سياسة سُفرة: نقترح التبرع فقط بالأكل اللي ما تقدّم على السفرة، وما تجاوز حد الوقت خارج الثلاجة (ساعتين، أو ساعة لو الجو حار).', src: ['sfda', 'sufra'] },
];

// تصنيفات الأكل: fridge_days = الحد الأدنى المعتمد للعدّاد، fridge_range للعرض
const CATEGORIES = [
  { id: 'rice', label: 'رز وأطباق الرز', match: ['رز', 'أرز', 'كبسة', 'مندي', 'مضغوط', 'مظبي', 'برياني', 'مقلوبة'], fridge_days: 1, fridge_range: '24 ساعة', freezer: null, src: 'fss_rice' },
  { id: 'cooked_meat', label: 'لحم ودجاج مطبوخ', match: ['دجاج', 'لحم', 'كبدة', 'مفطح', 'كباب', 'كفتة', 'شاورما'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: '2–6 شهور', src: 'usda_chart' },
  { id: 'fish', label: 'سمك وروبيان مطبوخ', match: ['سمك', 'روبيان', 'هامور', 'سالمون', 'تونة'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: '3–4 شهور', src: 'usda_leftovers' },
  { id: 'stew', label: 'مرق وأطباق مطبوخة بالمرق', match: ['مرقوق', 'جريش', 'قرصان', 'مطازيز', 'هريس', 'سليق', 'صالونة', 'مرق', 'شوربة', 'فول', 'عدس', 'خضار'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: '2–3 شهور', src: 'usda_chart' },
  { id: 'egg_dish', label: 'أطباق البيض المطبوخة', match: ['شكشوكة', 'عجة', 'بيض مقلي', 'بيض بالطماطم'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: null, src: 'usda_chart' },
  { id: 'boiled_egg', label: 'بيض مسلوق', match: ['بيض مسلوق'], fridge_days: 7, fridge_range: 'أسبوع', freezer: null, src: 'usda_chart' },
  { id: 'pasta', label: 'مكرونة ومعجنات مطبوخة', match: ['مكرونة', 'باستا', 'لازانيا', 'بيتزا', 'سمبوسة', 'فطاير', 'فطيرة'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: '1–2 شهور', src: 'usda_chart' },
  { id: 'protein_salad', label: 'سلطات فيها بيض أو دجاج أو تونة أو مايونيز', match: ['سلطة دجاج', 'سلطة تونة', 'سلطة بيض', 'سلطة مكرونة'], fridge_days: 3, fridge_range: '3–4 أيام', freezer: null, src: 'usda_chart' },
  { id: 'green_salad', label: 'سلطة خضراء متبّلة', match: ['سلطة', 'تبولة', 'فتوش'], fridge_days: 1, fridge_range: 'يوم', freezer: null, src: 'sufra' },
  { id: 'bread', label: 'خبز وتميس', match: ['خبز', 'تميس', 'صامولي', 'رغيف'], fridge_days: 2, fridge_range: 'يومين (والفريزر أفضل له)', freezer: 'شهر تقريبًا', src: 'sufra' },
  { id: 'cut_fruit', label: 'فواكه مقطعة', match: ['فواكه مقطعة', 'سلطة فواكه', 'بطيخ', 'شمام', 'أناناس'], fridge_days: 1, fridge_range: 'يوم', freezer: null, src: 'sufra' },
  { id: 'whole_fruit', label: 'فواكه كاملة', match: ['تفاح', 'موز', 'برتقال', 'عنب', 'فراولة', 'مانجو', 'فواكه', 'فاكهة'], fridge_days: 5, fridge_range: 'تقريبًا 5 أيام حسب النوع', freezer: null, src: 'sufra' },
  { id: 'dates', label: 'تمر', match: ['تمر'], fridge_days: 30, fridge_range: 'شهر أو أكثر', freezer: 'سنة تقريبًا', src: 'sufra' },
  { id: 'sweets', label: 'حلويات', match: ['كنافة', 'بسبوسة', 'كيك', 'لقيمات', 'حلا', 'معمول'], fridge_days: 3, fridge_range: '3 أيام', freezer: null, src: 'sufra' },
];
const DEFAULT_CAT = { id: 'leftovers', label: 'بواقي مطبوخة', match: [], fridge_days: 3, fridge_range: '3–4 أيام', freezer: '3–4 شهور', src: 'usda_leftovers' };

// ترتيب المطابقة: الأطول أولًا (عشان «سلطة دجاج» ما تنمسك كـ«دجاج» أو «سلطة»)
const MATCHERS = CATEGORIES.flatMap(c => c.match.map(k => ({ k, c }))).sort((a, b) => b.k.length - a.k.length);

function categorize(name) {
  const n = String(name || '');
  const hit = MATCHERS.find(m => n.includes(m.k));
  return hit ? hit.c : DEFAULT_CAT;
}

// تاريخ انتهاء آمن حسب مكان التخزين
function safeUntil(name, { storage = 'fridge', from = new Date() } = {}) {
  const c = categorize(name);
  const t = new Date(from);
  if (storage === 'freezer') { t.setMonth(t.getMonth() + 2); return { iso: t.toISOString(), cat: c }; } // حد متحفظ للفريزر
  if (storage === 'room') { t.setHours(t.getHours() + 2); return { iso: t.toISOString(), cat: c }; }
  t.setDate(t.getDate() + c.fridge_days);
  return { iso: t.toISOString(), cat: c };
}

// نص مختصر يُحقن في تعليمات Gemini عشان ما «يهبد»
function promptBlock() {
  const r = RULES.map(x => `- ${x.text} [${x.src.map(s => SOURCES[s].name).join('، ')}]`).join('\n');
  const c = [...CATEGORIES, DEFAULT_CAT].map(x => `- ${x.label}: الثلاجة ${x.fridge_range}${x.freezer ? '، الفريزر ' + x.freezer : ''} [${SOURCES[x.src].name}]`).join('\n');
  return `قاعدة معرفة سلامة الغذاء المعتمدة (لا تستخدم أرقامًا غيرها):\n${r}\n\nمدد الحفظ حسب نوع الأكل:\n${c}\n\nعند إعطاء معلومة سلامة: اذكر مصدرها باختصار (مثل «حسب هيئة الغذاء والدواء»). والقيم المعلّمة «سُفرة (تقدير متحفظ)» قل عنها إنها تقدير متحفظ. إذا سُئلت عن شيء غير موجود هنا، طبّق القاعدة العامة للبواقي ونبّه للتأكد بالشكل والرائحة، ولا تخترع رقمًا.`;
}

module.exports = { SOURCES, RULES, CATEGORIES, DEFAULT_CAT, categorize, safeUntil, promptBlock };
