// إنشاء أسرة جديدة أو تحديث أسرة موجودة (family_id + dash_token معًا)
const { limited } = require('./_util');
const { db, ready, family, newToken, str, num, int } = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 20)) return;
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  const b = req.body || {};

  const patch = {};
  const hs = int(b.household_size, 1, 60); if (hs != null) patch.household_size = hs;
  const cl = str(b.cook_language, 20); if (cl) patch.cook_language = cl;
  const city = str(b.city, 40); if (city) patch.city = city;
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180);
  if (lat != null && lng != null) { patch.lat = lat; patch.lng = lng }
  const now = new Date().toISOString();

  try {
    const fam = (b.family_id || b.dash_token) ? await family(b.family_id, b.dash_token) : null;
    if (fam && fam.is_demo) return res.status(403).json({ error: 'demo_read_only' });
    if (fam) {
      await db.update('families', `id=eq.${fam.id}`, { ...patch, last_seen_at: now });
      return res.status(200).json({ family_id: fam.id, dash_token: fam.dash_token });
    }
    // بيانات اعتماد ناقصة أو غلط: ننشئ أسرة جديدة (ما نكشف ولا نستبدل أسرة غيرنا)
    const token = newToken();
    const rows = await db.insert('families', { dash_token: token, is_demo: false, ...patch, last_seen_at: now });
    return res.status(200).json({ family_id: rows[0].id, dash_token: token });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
