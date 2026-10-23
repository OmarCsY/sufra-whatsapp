// المرصد: أرقام مجمعة حسب المدينة فقط (بدون هوية أسر)
const { limited } = require('./_util');
const { db, ready } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'public, max-age=60');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (limited(req, res, 40)) return;
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  try {
    const rows = await db.select('observatory_city', 'select=city,families,meals,kg_leftovers,kg_donated&order=kg_leftovers.desc&limit=100');
    return res.status(200).json({ cities: (rows || []).map(r => ({ city: r.city, families: Number(r.families) || 0, meals: Number(r.meals) || 0, kg_leftovers: Number(r.kg_leftovers) || 0, kg_donated: Number(r.kg_donated) || 0 })) });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
