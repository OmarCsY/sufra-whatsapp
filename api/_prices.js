// جدول الأسعار (ريال/كجم) فقط. مدد الحفظ وتواريخ الانتهاء كلها من _foodsafety.js (مصدر واحد للحقيقة).
// الأول المطابق يفوز، فالأخص قبل الأعم.
const fsafe = require('./_foodsafety');
const FRUITS = ['تفاح', 'موز', 'برتقال', 'عنب', 'بطيخ', 'شمام', 'فراولة', 'مانجو', 'فواكه', 'فاكهة', 'كرز', 'توت', 'رمان', 'خوخ', 'كمثرى', 'تين'];
const RULES = [
  { match: FRUITS, price: 10 },
  { match: ['كنافة', 'بسبوسة', 'كيك', 'لقيمات', 'حلا'], price: 30 },
  { match: ['مرقوق', 'جريش', 'قرصان', 'مطازيز', 'هريس', 'سليق', 'مكرونة'], price: 20 },
  { match: ['تمر'], price: 30 },
  { match: ['رز', 'أرز', 'كبسة', 'مندي', 'مضغوط', 'برياني', 'مقلوبة'], price: 12 },
  { match: ['دجاج'], price: 40 },
  { match: ['لحم', 'كبدة', 'مفطح', 'خروف', 'غنم'], price: 70 },
  { match: ['سمك', 'روبيان'], price: 60 },
  { match: ['سلطة'], price: 15 },
  { match: ['شكشوكة', 'بيض'], price: 15 },
  { match: ['صالونة', 'خضار', 'مرق', 'فول'], price: 15 },
  { match: ['خبز', 'تميس', 'صامولي'], price: 8 },
];
const DEFAULT_RULE = { price: 15 };
const rule = name => RULES.find(r => r.match.some(k => String(name).includes(k))) || DEFAULT_RULE;
// مدة الحفظ والتصنيف والمصدر من قاعدة سلامة الغذاء. opts: { storage: 'fridge'|'freezer'|'room', from: Date }
function safety(name, opts) {
  const r = fsafe.safeUntil(name, opts);
  return { safe_until: r.iso, food_category: r.cat.id, safety_source: fsafe.SOURCES[r.cat.src].name, cat: r.cat };
}
function priced(name, grams) {
  const r = rule(name), s = safety(name);
  return { value_sar: Math.round(grams * r.price / 1000), safe_until: s.safe_until, food_category: s.food_category, safety_source: s.safety_source };
}

module.exports = { rule, priced, safety, RULES };
