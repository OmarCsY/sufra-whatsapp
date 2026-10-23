// المرصد: أرقام مجمعة بدون هوية (RPC + تجميعات الخادم). GET /api/observatory?days=7|30|90&demo=0|1&region=...
// ما نرجّع أبدًا family_id ولا dash_token ولا إحداثيات. كاش 60 ثانية.
const { limited } = require('./_util');
const { ready } = require('./_db');
const { getObservatory } = require('./_obs');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (limited(req, res, 40)) return;
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  const q = req.query || {};
  try {
    const data = await getObservatory({ days: Number(q.days) || 30, demo: q.demo === '1' || q.demo === 'true', region: q.region ? String(q.region).slice(0, 30) : null });
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
