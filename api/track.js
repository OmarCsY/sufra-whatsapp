// تسجيل أحداث الأسرة: ثلاجة، مصير الأكل، تصحيح، تبرع، عزيمة، وأي حدث عام. كل طلب يتحقق من family_id + dash_token.
const { limited } = require('./_util');
const { db, ready, family, q, UUID, str, num, int, oneOf } = require('./_db');

const OUTCOMES = ['eaten', 'half', 'thrown'];
const MEAL_STATUS = { eaten: 'eaten', half: 'partly_eaten', thrown: 'thrown', donated: 'donated' };
const EVENT_TYPE = /^[a-z][a-z0-9_]{0,29}$/;

// نحدّث حالة الوجبة لما يصير لكل أصنافها مصير
async function recompute(mealId, famId) {
  const items = await db.select('meal_items', `meal_id=eq.${mealId}&select=outcome`);
  if (!items.length || items.some(i => !i.outcome)) return;
  const set = [...new Set(items.map(i => i.outcome))];
  const status = set.length === 1 ? MEAL_STATUS[set[0]] || 'partly_eaten' : 'partly_eaten';
  await db.update('meals', `id=eq.${mealId}&family_id=eq.${famId}`, { status, closed_at: new Date().toISOString() });
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (limited(req, res, 90)) return;
  if (!ready()) return res.status(503).json({ error: 'db_unavailable' });
  const b = req.body || {};
  const type = String(b.type || '');
  if (!EVENT_TYPE.test(type)) return res.status(400).json({ error: 'bad_type' });

  try {
    const fam = await family(b.family_id, b.dash_token);
    if (!fam) return res.status(404).json({ error: 'family_not_found' });
    if (fam.is_demo) return res.status(403).json({ error: 'demo_read_only' });

    // الوجبة لازم تكون تابعة لنفس الأسرة
    let mealId = null;
    if (b.meal_id != null && b.meal_id !== '') {
      if (!UUID.test(String(b.meal_id))) return res.status(400).json({ error: 'bad_meal_id' });
      const m = await db.select('meals', `id=eq.${q(b.meal_id)}&family_id=eq.${fam.id}&select=id&limit=1`);
      if (!m.length) return res.status(404).json({ error: 'meal_not_found' });
      mealId = m[0].id;
    }
    const needMeal = () => { if (!mealId) { res.status(400).json({ error: 'meal_id_required' }); return false } return true };

    if (type === 'fridge') {
      if (!needMeal()) return;
      await db.update('meals', `id=eq.${mealId}&family_id=eq.${fam.id}`, { status: 'in_fridge' });
      return res.status(200).json({ ok: true });
    }

    if (type === 'outcome') {
      if (!needMeal()) return;
      const outcome = oneOf(b.outcome, OUTCOMES);
      if (!outcome) return res.status(400).json({ error: 'bad_outcome' });
      let filter = `meal_id=eq.${mealId}`;
      const item = b.item == null ? '' : String(b.item);
      if (item) filter += UUID.test(item) ? `&id=eq.${item}` : `&name=eq.${q(str(item, 40) || '')}`;
      await db.update('meal_items', filter, { outcome });
      await recompute(mealId, fam.id);
      return res.status(200).json({ ok: true });
    }

    if (type === 'item_correction') {
      if (!needMeal()) return;
      const name = str(b.name, 40), old = str(b.item, 40);
      if (!name || !old) return res.status(400).json({ error: 'bad_item' });
      const found = await db.select('meal_items', `meal_id=eq.${mealId}&${UUID.test(old) ? 'id' : 'name'}=eq.${q(old)}&select=id,name&limit=1`);
      if (!found.length) return res.status(404).json({ error: 'item_not_found' });
      const patch = { name, corrected_from: found[0].name, confidence: 1 };
      const g = int(b.grams, 0, 1000000), v = num(b.value_sar, 0, 1000000);
      if (g != null) patch.grams = g;
      if (v != null) patch.value_sar = v;
      if (b.safe_until && !isNaN(Date.parse(b.safe_until))) patch.safe_until = new Date(b.safe_until).toISOString();
      await db.update('meal_items', `id=eq.${found[0].id}`, patch);
      const items = await db.select('meal_items', `meal_id=eq.${mealId}&select=grams,value_sar`);
      await db.update('meals', `id=eq.${mealId}&family_id=eq.${fam.id}`, {
        total_grams: items.reduce((s, i) => s + (Number(i.grams) || 0), 0),
        total_value_sar: items.reduce((s, i) => s + (Number(i.value_sar) || 0), 0),
      });
      return res.status(200).json({ ok: true });
    }

    if (type === 'donation') {
      const status = oneOf(b.status, ['contacted', 'agreed', 'no_answer']) || 'contacted';
      const row = {
        charity_name: str(b.charity_name, 80), charity_city: str(b.charity_city, 40),
        distance_km: num(b.distance_km, 0, 5000), grams: int(b.grams, 0, 1000000),
        cooked_window: str(b.cooked_window, 40), contact_method: oneOf(b.contact_method, ['call', 'whatsapp', 'map']), status,
      };
      let donationId = null;
      const did = b.donation_id == null ? '' : String(b.donation_id);
      if (did) {
        if (!UUID.test(did)) return res.status(400).json({ error: 'bad_donation_id' });
        const ex = await db.select('donations', `id=eq.${did}&family_id=eq.${fam.id}&select=id&limit=1`);
        if (!ex.length) return res.status(404).json({ error: 'donation_not_found' });
        const patch = { status }; for (const [k, v] of Object.entries(row)) if (v != null && k !== 'status') patch[k] = v;
        await db.update('donations', `id=eq.${did}`, patch);
        donationId = did;
      } else {
        if (!row.charity_name) return res.status(400).json({ error: 'charity_name_required' });
        const ins = await db.insert('donations', { family_id: fam.id, meal_id: mealId, ...row });
        donationId = ins[0].id;
      }
      if (status === 'agreed' && mealId) {
        await db.update('meal_items', `meal_id=eq.${mealId}`, { outcome: 'donated' });
        await db.update('meals', `id=eq.${mealId}&family_id=eq.${fam.id}`, { status: 'donated', closed_at: new Date().toISOString() });
      }
      return res.status(200).json({ ok: true, donation_id: donationId });
    }

    if (type === 'gathering') {
      const gmin = int(b.guests_min, 1, 5000); if (gmin == null) return res.status(400).json({ error: 'bad_guests' });
      const gmax = int(b.guests_max, gmin, 5000) || gmin;
      await db.insert('gatherings', { family_id: fam.id, guests_min: gmin, guests_max: gmax, rice_kg: num(b.rice_kg, 0, 5000), meat_kg: num(b.meat_kg, 0, 5000) });
      return res.status(200).json({ ok: true });
    }

    // حدث عام: voice, chat, photo, reminder...
    let payload = b.payload && typeof b.payload === 'object' ? b.payload : {};
    if (JSON.stringify(payload).length > 2000) payload = { truncated: true };
    const row = { family_id: fam.id, type, payload };
    try { await db.insert('events', row) }
    catch (e) { if (e.code === '23502') await db.insert('events', { ...row, id: Date.now() * 1000 + Math.floor(Math.random() * 1000) }); else throw e } // لو عمود id بدون قيمة افتراضية
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(503).json({ error: 'db_unavailable' });
  }
};
