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
function priced(name, grams) {
  const r = rule(name);
  return { value_sar: Math.round(grams * r.price / 1000), safe_until: new Date(Date.now() + r.days * 864e5).toISOString() };
}

module.exports = { rule, priced, RULES };
