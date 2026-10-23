/* سُفرة · واجهة بوت الواتساب التجريبية */
const chat = document.getElementById('chat'), st = document.getElementById('st');
const msg = document.getElementById('msg'), sendB = document.getElementById('send');
const footer = document.querySelector('footer'), recT = document.getElementById('recT');
const sheet = document.getElementById('sheet'), shade = document.getElementById('shade'), pop = document.getElementById('pop');

let S = { size: '', lang: 'عربي', meal: null, meals: [] };
let H = []; // ذاكرة المحادثة للذكاء الاصطناعي
const API = { ok: false, ai: false, engine: false };
const healthP = fetch('/api/health').then(r => r.ok ? r.json() : null).then(j => { if (j) { API.ok = true; API.ai = !!j.ai; API.engine = !!j.engine } }).catch(() => {});

const SAMPLES = [
  { src: 's-kabsa.jpg', label: 'كبسة دجاج', alt: 'plate' },
  { src: 's-jareesh.jpg', label: 'جريش ولحم' },
  { src: 's-tray.jpg', label: 'صينية رز بالخضار' },
  { src: 's-pots.jpg', label: 'قدور العزيمة', alt: 'pots' },
  { src: 's-shakshuka.jpg', label: 'شكشوكة' },
  { src: 's-chair.jpg', label: 'صورة مو أكل', alt: 'none' },
];

/* ---------- أدوات ---------- */
let actx;
function ac() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} return actx }
function ding(f = 880, d = .08) { try { const a = ac(); const o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(.05, a.currentTime); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + d * 2); o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d * 2) } catch (e) {} }
const now = () => { const d = new Date(); let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0'); const p = h < 12 ? 'ص' : 'م'; h = h % 12 || 12; return h + ':' + m + ' ' + p };
const scroll = () => setTimeout(() => chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' }), 30);
const wait = ms => new Promise(r => setTimeout(r, ms));
const num = s => { const t = String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); const m = t.match(/\d+/); return m ? parseInt(m[0], 10) : null };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => esc(s).replace(/\*\*?([^*\n]+)\*\*?/g, '<b>$1</b>');
function el(h) { const d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild }
function strip(h) { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('.t,.voice,img').forEach(x => x.remove()); return d.textContent.trim() }
function remember(role, text) { if (!text) return; H.push({ role, text: String(text).slice(0, 700) }); if (H.length > 16) H = H.slice(-16) }
const TICK = '<svg class="tk" width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><path d="M11.1.7 5.4 7.3 3 5 2 6l3.5 3.3 6.7-7.6zM15 .7 9.3 7.3l-.9-.8-1 1 1.9 1.8L16 1.6z"/></svg>';
function markRead() { chat.querySelectorAll('.tk:not(.read)').forEach(x => x.classList.add('read')) }

let last = '';
function day(t) { last = ''; chat.appendChild(el(`<div class="day">${t}</div>`)); scroll() }
function note(t) { last = ''; chat.appendChild(el(`<div class="note">${t}</div>`)); scroll() }
function me(html, cls = '') { const f = last !== 'me' ? ' first' : ''; last = 'me'; const n = el(`<div class="row me${f}"><div class="b ${cls}">${html}<span class="t">${now()} ${TICK}</span></div></div>`); chat.appendChild(n); ding(660); scroll(); setTimeout(markRead, 1200); return n }
function them(html) { const f = last !== 'them' ? ' first' : ''; last = 'them'; chat.appendChild(el(`<div class="row them${f}"><div class="b">${html}<span class="t">${now()}</span></div></div>`)); remember('model', strip(html)); ding(980); scroll(); memSet() }
let PEND = null; // الخيارات المعلّقة: تُقبل بالضغط أو بالكتابة الحرة
function btns(list, inline, ai) {
  const w = el(`<div class="btns${inline ? ' inline' : ''}" style="--n:${list.filter(x => x[0]).length}"></div>`);
  const close = () => { [...w.children].forEach(x => x.disabled = true); if (PEND && PEND.w === w) PEND = null };
  list.filter(x => x[0]).forEach(([label, fn]) => { const b = document.createElement('button'); b.textContent = label; b.onclick = () => { close(); me(esc(label)); remember('user', label); fn() }; w.appendChild(b) });
  PEND = { w, close, ai: !!ai, labels: list.filter(x => x[0]), free: list.find(x => !x[0] && x[3]), opts: list.filter(x => x[2]).map(([label, fn, re]) => ({ label, fn, re })) };
  chat.appendChild(w); const rb = [...chat.querySelectorAll('.row.them .b')].pop();
  if (!w.children.length) { w.remove(); scroll(); return }
  if (rb) { w.style.width = Math.max(rb.offsetWidth, chat.clientWidth * .6) + 'px'; rb.style.borderBottomLeftRadius = rb.style.borderBottomRightRadius = '0' }
  scroll()
}
function skip(label, fn) { const b = el(`<button class="skip">⏩ ${label}</button>`); last = ''; b._fn = fn; b.onclick = () => { b.remove(); fn() }; chat.appendChild(b); scroll() }
function typingOn() { st.textContent = 'يكتب…'; markRead(); const t = el(`<div class="row them${last !== 'them' ? ' first' : ''}"><div class="b typing"><i></i><i></i><i></i></div></div>`); chat.appendChild(t); scroll(); return t }
function typingOff(t) { t && t.remove(); st.textContent = 'حساب أعمال' }
const TOUR = { on: false, stop: false };
const spd = ms => TOUR.on ? Math.round(ms * .45) : ms; // الجولة السريعة تمشي أسرع
async function bot(html, ms = 900) { const t = typingOn(); await wait(spd(ms)); typingOff(t); them(html) }
/* ---------- قاعدة بيانات الأسرة: family_id + dash_token في localStorage، والأحداث fire-and-forget ---------- */
const FAM_KEY = 'sufra.fam.v1';
let FAM = null, FAM_Q = Promise.resolve();
const DON = { id: null };
function famLoad() { try { const j = JSON.parse(localStorage.getItem(FAM_KEY) || 'null'); if (j && j.family_id && j.dash_token) FAM = j } catch (e) {} }
function famSave() { try { localStorage.setItem(FAM_KEY, JSON.stringify(FAM)) } catch (e) {} }
const famOff = () => S.tour || TOUR.on || !API.ok;   // الجولة السريعة ما تكتب في بيانات المستخدم
const famCreds = () => (FAM && !famOff() ? { family_id: FAM.family_id, dash_token: FAM.dash_token } : {});
function sizeNum() { const t = String(S.size || ''); if (t === '1-3') return 2; if (t === '4-6') return 5; if (t === '7+') return 7; const n = parseInt(t, 10); return n > 0 ? n : null }
function famSync() {
  if (famOff()) return FAM_Q;
  FAM_Q = FAM_Q.then(async () => {
    const body = { ...(FAM || {}) }, n = sizeNum();
    if (n) body.household_size = n; if (S.langSet) body.cook_language = S.lang;
    if (HERE && HERE.city) { body.city = HERE.city; if (isFinite(HERE.lat) && isFinite(HERE.lng)) { body.lat = HERE.lat; body.lng = HERE.lng } }
    try { const r = await fetch('/api/family', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (r.ok) { const j = await r.json(); if (j && j.family_id && j.dash_token) { FAM = { family_id: j.family_id, dash_token: j.dash_token }; famSave() } } } catch (e) {}
  }).catch(() => {});
  return FAM_Q;
}
function track(type, extra = {}) {
  if (!FAM || famOff()) return Promise.resolve(null);
  return fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...famCreds(), type, ...extra }), keepalive: true }).then(r => (r.ok ? r.json() : null)).catch(() => null);
}
const gatherCtx = () => (S.gather && Date.now() - S.gather.at < 24 * 36e5 ? { occasion: 'gathering', guests: S.gather.guests } : {});
const mid = m => { m = m || S.meal; return (m && m.db_meal_id) || undefined };
function dashUrl() { return S.tour ? location.origin + '/d/demo' : FAM ? location.origin + '/d/' + FAM.dash_token : null }
function showDash() { const u = dashUrl(); if (u) linkBtns([[S.tour ? '📊 لوحة أسرة تجريبية' : '📊 لوحة أسرتكم', u, { live: true }]]) }
async function dashCard() {
  if (!dashUrl()) return bot('لوحة الأسرة تفتح بعد ما نسجّلكم 🙏 جرّبوا بعد شوي، أو أرسلوا أول صورة.');
  await bot('📊 هذي <b>لوحة أسرتكم</b>: أرقامكم ووجباتكم وإنجازاتكم في مكان واحد.'); showDash();
}
const SOFT_MSG = 'عندنا ضغط حلو 😅 ثواني وجرّب';
const softErr = e => !!(e && e.api && (!e.status || e.status === 429 || e.status >= 500));
let PHOTO_BUSY = false;
async function withBusy(fn) {
  if (PHOTO_BUSY) { closeSheet(); return bot('لحظة، لسه نحلل الصورة السابقة ⏳', 500) }
  PHOTO_BUSY = true; try { await fn() } finally { PHOTO_BUSY = false }
}

async function api(path, body, ms = 45000) {
  const c = new AbortController(); const to = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: c.signal }); if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e } return await r.json() }
  catch (e) { e.api = true; throw e }
  finally { clearTimeout(to) }
}
const blobToB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b) });

/* ---------- البداية ---------- */
// رسالة الطباخ الاحتياطية (لو فشل طلب الذكاء الاصطناعي): الرقم محسوب من وجبات المستخدم
const COOK = {
  'عربي': x => `قلّلي كمية الرز <b>${x} كوب</b> في كل وجبة.`,
  'English': x => `Please cook <b>${x} cup(s) less rice</b> per meal.`,
  'Tagalog': x => `Magluto ng <b>${x} tasa na mas kaunting kanin</b> bawat luto.`,
  'اردو': x => `ہر کھانے میں <b>${x} کپ چاول کم</b> پکائیں۔`,
  'हिन्दी': x => `हर बार <b>${x} कप कम चावल</b> पकाएँ।`,
  'বাংলা': x => `প্রতিবার <b>${x} কাপ কম চাল</b> রান্না করুন।`,
  'Indonesia': x => `Masak <b>${x} gelas beras lebih sedikit</b> setiap kali.`,
};
const cookFallback = (lang, cups, name) => cups ? (COOK[lang] || COOK['English'])(cups) : (lang === 'عربي' ? `قلّلي كمية ${esc(name)} شوي في الطبخات الجاية.` : `Please cook a bit less ${esc(name)} next time.`);
const cupsTxt = x => { const w = Math.floor(x), h = x % 1 ? ' ونص' : ''; return x === .5 ? 'نص كوب' : w === 1 ? 'كوب' + h : w === 2 ? 'كوبين' + h : w + ' أكواب' + h };
async function cookMsg(rec, fb) {
  if (API.ai) { try { const j = await api('/api/chat', { mode: 'cook', lang: S.lang, text: rec }, 15000); if (j && j.text) return esc(j.text) } catch (e) {} }
  return fb;
}

/* ---------- سجل الوجبات (بيانات حقيقية من التحليل) ---------- */
const RICE_RE = /رز|أرز|كبسة|مندي|مضغوط|برياني|مقلوبة|مجبوس/;
const isRice = n => RICE_RE.test(String(n));
const mealG = m => (m.items || []).reduce((s, i) => s + (Number(i.grams) || 0), 0);
function recordMeal(j) {
  const m = { ...j, items: (j.items || []).map(i => ({ ...i })), ts: Date.now(), fridge: false, status: null, donated: false };
  S.meals.push(m); if (S.meals.length > 60) S.meals = S.meals.slice(-60);
  S.meal = m; return m;
}
function weeklyStats() {
  const ms = S.meals.filter(m => (m.items || []).length), n = ms.length; if (!n) return null;
  const riceG = ms.reduce((s, m) => s + m.items.filter(i => isRice(i.name)).reduce((a, i) => a + (Number(i.grams) || 0), 0), 0);
  const cups = Math.round(riceG / n / 600 * 2) / 2;
  const agg = {}; ms.forEach(m => m.items.forEach(i => { agg[i.name] = (agg[i.name] || 0) + (Number(i.grams) || 0) }));
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1])[0];
  return { n, riceG, cups, top };
}
function monthStats() {
  let saved = 0, val = 0, don = 0;
  for (const m of S.meals) {
    const g = mealG(m), v = Number(m.total_value_sar) || 0;
    if (m.donated) { don += m.donatedG != null ? m.donatedG : g; saved += g; val += v }
    else { const f = m.status === 'full' ? 1 : m.status === 'half' ? .5 : 0; saved += g * f; val += v * f }
  }
  return { n: S.meals.length, saved, val, don };
}

/* ---------- الذاكرة على نفس الجوال (localStorage، كل عملية داخل try/catch) ---------- */
const MEM_KEY = 'sufra.mem.v1';
function memGet() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || 'null') } catch (e) { return null } }
function memSet() {
  if (S.tour) return; // الجولة ما تكتب في الذاكرة
  try { localStorage.setItem(MEM_KEY, JSON.stringify({ size: S.size, lang: S.lang, langSet: !!S.langSet, meals: S.meals.filter(m => !m.demo).slice(-40), city: HERE && HERE.city ? HERE : null })) } catch (e) {}
}
function memClear() { try { localStorage.removeItem(MEM_KEY) } catch (e) {} }

async function start(opts = {}) {
  if (opts.fresh) memClear();
  const mem = opts.fresh ? null : memGet();
  H = []; S = { size: '', lang: 'عربي', meal: null, meals: [] }; HERE = null; NEAR = []; NI = 0; PEND = null; chat.innerHTML = ''; last = '';
  if (mem) {
    S.size = mem.size || ''; S.lang = mem.lang || 'عربي'; S.langSet = !!mem.langSet;
    S.meals = Array.isArray(mem.meals) ? mem.meals : []; S.meal = S.meals[S.meals.length - 1] || null;
    if (mem.city && mem.city.city) HERE = mem.city;
  }
  await Promise.race([healthP, wait(1500)]);
  famLoad(); famSync();
  day('اليوم');
  note(API.ai
    ? '🔒 نسخة تجريبية من بوت سُفرة. أرسل صورة أكل حقيقية أو رسالة صوتية أو اكتب أي سؤال، والرد من محرك سُفرة.'
    : '🔒 نسخة تجريبية لتدفق بوت سُفرة على الواتساب. جرّب الأزرار، واضغط 📷 لإرسال صورة.');
  if (!opts.fresh) await showAlerts();
  if (mem && (S.size || S.meals.length)) return returning();
  await welcome();
}
async function returning() {
  const n = S.meals.length;
  await bot('هلا فيك من جديد 🌷' + (n ? `\nعندكم <b>${n}</b> ${n === 1 ? 'وجبة' : 'وجبات'} في السجل.` : ''), 700);
  if (!S.size) return askSize();
  if (!S.langSet) return askLang();
  const m = S.meal, open = m && !m.status && !m.donated;
  await bot('كمّلوا من حيث وقفنا 👇 صوّروا بواقي وجبتكم الجاية 📷، أو اكتبوا «عزيمة»، أو اسألوا «وش أثري؟»');
  btns([['📷 أرسل صورة', openSheet], ['📊 أثري', impactCard], ...(open ? [['🍽️ وش صار على آخر وجبة؟', closeQ]] : [])]);
}
async function welcome() {
  await askSize(true);
  if (!TOUR.on) { const b = el('<button class="skip tourbtn">🎬 جولة سريعة</button>'); b.onclick = () => { b.remove(); startTour() }; chat.appendChild(b); scroll() }
}
async function askSize(full) {
  await bot((full ? 'يا هلا ومرحبا بك في <b>سُفرة</b> 🌷\nنساعدك تحفظ نعمة بيتك وتوفّر، بصورة لسفرتكم بعد الأكل.\n\n' : '') + 'عشان نضبط كميات الطبخ بدقة، <b>كم عدد أفراد البيت؟</b>\n<span class="hint">اختاروا أو اكتبوا العدد</span>', 700);
  btns([['1 – 3', () => size('1-3')], ['4 – 6', () => size('4-6')], ['7 أو أكثر', () => size('7+')], ['', (t, n) => n ? size(String(n)) : size(t), /\d|[٠-٩]|واحد|اثنين|ثنين|ثلاث|ربع|خمس|ست|سبع|ثمان|تسع|عشر|درزن/, 'size']], true);
}
const LANGS = [['عربي', /عرب|arab/i], ['English', /english|انجل|إنجل|انقل|إنقل/i], ['Tagalog', /tagalog|filip|فلبين|تاغالوغ|تقالوق/i], ['اردو', /urdu|ارد|أورد|اورد|باكستان/i], ['हिन्दी', /hindi|هند/i], ['বাংলা', /bangla|bengal|بنغال/i], ['Indonesia', /indones|اندونيس|إندونيس/i]];
async function size(s) {
  if (/^\d+$/.test(s)) { const n = parseInt(s, 10); S.size = n + (n === 1 ? ' فرد' : ' أفراد') } else S.size = s;
  famSync();
  await askLang(true);
}
async function askLang(first) {
  await bot((first ? 'تم 👌 ' : '') + 'وش لغة الشخص اللي يطبخ عندكم غالبًا؟\n<span class="hint">عشان نرسل له التعليمات بلغته. اختاروا أو اكتبوا اللغة</span>');
  btns([['عربي', () => lang('عربي')], ['English', () => lang('English')], ['Tagalog', () => lang('Tagalog')], ['اردو', () => lang('اردو')], ['', t => lang(t), /^(عرب|arab|english|انجل|إنجل|tagalog|filip|فلبين|urdu|ارد|أورد|اورد|hindi|هند|bangla|bengal|بنغال|indones|اندونيس|إندونيس|الفلبيني|الهندي|الانجليزي|الإنجليزي|العربي|الأوردو|الاوردو)/i, 'lang']], true)
}
async function lang(l) {
  const hit = LANGS.find(([n, re]) => n === l || re.test(l)); S.lang = hit ? hit[0] : String(l).trim().slice(0, 20); S.langSet = true; famSync();
  await bot('ممتاز، جاهزين ✅\nبعد الأكل صوّروا <b>البواقي</b> وأرسلوها هنا 📷\n<span style="color:#667781;font-size:13px">' + (API.ai ? '(تقدرون بعد تكتبون أو ترسلون رسالة صوتية 🎙️ بأي سؤال، أو تكتبون «عزيمة» لو عندكم مناسبة)' : '(اضغط 📷 تحت، أو اكتبوا «عزيمة» لو عندكم مناسبة)') + '</span>');
}

/* ---------- الأرقام بالكلام: «خمسة»، «عشرين»، «ثلاثين تقريبًا»، «درزن» ---------- */
const nz = w => String(w).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const AN_U = { 'واحد': 1, 'وحده': 1, 'اثنين': 2, 'اثنان': 2, 'ثنين': 2, 'ثلاثه': 3, 'ثلاث': 3, 'اربعه': 4, 'اربع': 4, 'خمسه': 5, 'خمس': 5, 'سته': 6, 'ست': 6, 'سبعه': 7, 'سبع': 7, 'ثمانيه': 8, 'ثمان': 8, 'تسعه': 9, 'تسع': 9, 'عشره': 10, 'عشر': 10, 'احدعشر': 11, 'اثنعشر': 12, 'درزن': 12, 'دزينه': 12 };
const AN_T = { 'عشرين': 20, 'ثلاثين': 30, 'اربعين': 40, 'خمسين': 50, 'ستين': 60, 'سبعين': 70, 'ثمانين': 80, 'تسعين': 90 };
// الرسالة كلها رقم (بالأرقام أو بالكلام) مع كلمات حشو بسيطة، بدون سؤال أو مدى («بين 20 و30») ← نعالجها محليًا بدون الذكاء الاصطناعي
const FILL = /^(تقريبا|ضيف|ضيوف|فرد|افراد|شخص|اشخاص|حوالي|يمكن|نفر|بالبيت|البيت|في|احنا|نحن|عدد|نص|ميه|مئه|مايه|ميتين|مئتين)$/;
function onlyNumberish(t) {
  const toks = nz(t).split(/[\s،,.؟?!]+/).filter(Boolean); if (!toks.length || toks.length > 5) return false;
  return toks.every(w => { const v = /^و./.test(w) && !AN_U[w] && !AN_T[w] ? w.slice(1) : w; return /[\d٠-٩۰-۹]/.test(w) || AN_U[v] || AN_T[v] || FILL.test(v) });
}
function parseArNum(t) {
  const d = num(t); if (d != null) return d;
  const s = nz(t);
  if (/نص\s*(ميه|مئه|مايه)/.test(s)) return 50;
  const toks = s.split(/[\s،,.؟?!]+/).filter(Boolean).map(w => (/^و./.test(w) && !AN_U[w] && !AN_T[w] ? w.slice(1) : w));
  let total = 0, prev = '';
  for (const w of toks) {
    if (AN_T[w]) { if (prev === 't') return null; total += AN_T[w]; prev = 't' }
    else if (AN_U[w]) { total += AN_U[w]; prev = 'u' }
    else if (/^(ميه|مئه|مايه)$/.test(w)) { total = (total >= 1 && total <= 9 ? total : 1) * 100; prev = 'h' }
    else if (/^(ميتين|مئتين)$/.test(w)) { total += 200; prev = 'h' }
  }
  return total > 0 ? total : null;
}

/* ---------- الصور ---------- */
function openSheet() { sheet.classList.add('on'); shade.classList.add('on') }
function closeSheet() { sheet.classList.remove('on'); shade.classList.remove('on') }
function compress(blob, max = 1024, q = .82) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { let w = im.naturalWidth, h = im.naturalHeight; const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', q)) }; im.onerror = e => { URL.revokeObjectURL(u); rej(e) }; im.src = u })
}

function buildSamples() {
  const g = document.getElementById('samples'); g.innerHTML = '';
  SAMPLES.forEach(s => {
    const b = document.createElement('button');
    if (s.none) { b.innerHTML = `<div class="ph" style="background:#E9EDEF">🛋️</div>${s.label}`; b.onclick = () => photoScripted('none') }
    else {
      b.innerHTML = `<img src="${s.src}" alt="">${s.label}`;
      const img = b.querySelector('img');
      img.onerror = () => { if (s.alt === 'pots') { img.replaceWith(el('<div class="ph pots" style="width:100%;height:auto;margin:0 0 6px;padding:0"></div>')); b.onclick = () => photoScripted('pots') } else b.remove() };
      b.onclick = () => sample(s);
    }
    g.appendChild(b);
  });
}
async function sample(s) {
  closeSheet();
  return withBusy(async () => {
    if (!API.ok) return photoScripted(s.alt || 'plate');
    let data; try { data = await compress(await (await fetch(s.src)).blob()) } catch (e) { return photoScripted(s.alt || 'plate') }
    return realPhoto(data, s.alt);
  });
}
async function pickFile(input) {
  const f = input.files && input.files[0]; input.value = ''; if (!f) return; closeSheet();
  return withBusy(async () => {
    let data; try { data = await compress(f) } catch (e) { return bot('ما قدرنا نفتح الصورة 🤔 جرّبوا صورة ثانية.') }
    if (!API.ok) { me(`<img src="${data}" alt="">`, 'media'); remember('user', '[أرسل صورة]'); return bot('وصلت الصورة 📷 التحليل الحقيقي يشتغل في النسخة المنشورة من الموقع.') }
    return realPhoto(data);
  });
}

async function realPhoto(dataUrl, alt) {
  me(`<img src="${dataUrl}" alt="">`, 'media'); remember('user', '[أرسل صورة للأكل]');
  await wait(250); await bot('ثواني نحلل الصورة… 🔍', 500);
  return analyzePhoto(dataUrl, alt, 0);
}
async function analyzePhoto(dataUrl, alt, tries) {
  const t = typingOn(); let j, err;
  const t7 = setTimeout(() => { st.textContent = 'يحلل الصورة…' }, 7000);
  const t15 = setTimeout(() => { them('لحظات، نحسب الأوزان بدقة ⏳'); chat.appendChild(t); scroll() }, 15000);
  try { j = await api('/api/analyze', { image: dataUrl.split(',')[1], mime: 'image/jpeg', ...famCreds(), ...gatherCtx() }, TOUR.on ? 12000 : 60000) } catch (e) { err = e }
  clearTimeout(t7); clearTimeout(t15); typingOff(t);
  if (!err) { if (j && j.db_meal_id) S.gather = null; track('photo', { payload: { via: j && j.via, items: (j && j.items || []).length } }); return showResult(j) }
  if (TOUR.on && alt) return photoScripted(alt, true); // الجولة: نتيجة احتياطية واقعية بدل الانتظار
  if (softErr(err) && tries < 1) {
    them(SOFT_MSG);
    return btns([['🔁 أعد المحاولة', () => withBusy(() => analyzePhoto(dataUrl, alt, tries + 1))]]);
  }
  if (alt) return photoScripted(alt, true);
  return them('الخدمة عليها ضغط الحين 🙏 جرّبوا ترسلون الصورة مرة ثانية بعد شوي.');
}

const SAR = n => Math.round(Number(n) || 0);
function whenTxt(iso) {
  const d = new Date(iso); if (isNaN(d)) return null;
  const n = new Date(); const day0 = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day0(d) - day0(n)) / 864e5);
  let h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0'); const p = h < 12 ? 'ص' : 'م'; h = h % 12 || 12; const tm = `${h}:${m} ${p}`;
  if (diff <= 0) return 'اليوم ' + tm; if (diff === 1) return 'بكرة ' + tm; if (diff === 2) return 'بعد بكرة';
  return 'خلال ' + diff + ' أيام';
}
function mealSummary(m) { if (!m || !m.items) return ''; return m.items.map(i => `${i.name} ${Math.round(i.grams)} جم`).join('، ') + `؛ القيمة ${SAR(m.total_value_sar)} ريال` + (m.next_day_suggestion ? `؛ اقتراح الغد: ${m.next_day_suggestion}` : '') }

async function showResult(j) {
  if (!j || !Array.isArray(j.items) || !j.items.length) { them('ما قدرنا نتعرف على أكل في الصورة 🤔\nصوّروا الصحن كامل من فوق وبإضاءة واضحة، وجربوا مرة ثانية.'); return }
  const m = recordMeal(j);
  const lines = j.items.map(i => `• ${esc(i.name)}${i.state === 'سليم' ? ' (ما انلمس)' : ''}${lowConf(i) ? ' (تقديري)' : ''}: حوالي <b>${Math.round(i.grams)} جم</b> (${SAR(i.value_sar)} ريال)`).join('\n');
  const soon = j.items.map(i => i.safe_until).filter(Boolean).sort()[0];
  const sv = Number(j.servings_left) || 0;
  let h = (j.dish_name ? `🍽️ <b>${esc(j.dish_name)}</b>\n` : '') + `بالعافية عليكم 🍽️\n<b>رصدنا في السفرة:</b>\n${lines}\n\n💰 إجمالي القيمة: <b>${SAR(j.total_value_sar)} ريال</b>\n👥 تكفي تقريبًا: <b>${sv >= 1 ? sv + (sv === 1 ? ' شخص' : sv <= 10 ? ' أشخاص' : ' شخص') : 'أقل من حصة'}</b>`;
  const w = soon && whenTxt(soon); if (w) h += `\n⏰ الأفضل تستخدمونه قبل: <b>${w}</b>`;
  if (j.next_day_suggestion) h += `\n\n💡 اقتراح بكرة: <b>${esc(j.next_day_suggestion)}</b>`;
  them(h);
  const tg = mealG(j), allSalim = j.items.every(i => i.state === 'سليم'), forced = S.forceDonate; S.forceDonate = false;
  m.askDonate = !!(j.charity_suggestion || tg >= 3000 || forced || (allSalim && tg >= 1500));
  return nextStep(m);
}
// الخطوة التالية بعد عرض النتيجة: سؤال التبرع (كمية كبيرة أو أصناف ما انلمست) أو الثلاجة، مع زر التصحيح لو فيه صنف تقديري
async function nextStep(m) {
  const fix = m.items.some(lowConf) ? [['✏️ تصحيح الأصناف', correctItems]] : [];
  if (m.askDonate) { await bot('باقي عندكم كمية كبيرة 🍲\nهل هذا الأكل <b>تقدّم على السفرة</b>، ولا باقي في القدور ما أحد أكل منه؟', 900); btns([['باقي في القدور', served, /^لا|باقي|بالقدور|في القدور|ما تقد|ما انقد|محد|ما أحد|ما احد|ما أكل منه|ما اكل منه|ما انلمس/], ['تقدّم على السفرة', homePlan, /^(نعم|ايه|إيه|اي|أي)(\s|$)|^تقد|انقد|قدمناه|قدّمناه|حطيناه على|أكلوا منه|اكلوا منه/], ...fix]) }
  else btns([['دخل الثلاجة ✅', fridge], ...fix]);
}

/* ---------- تصحيح الأصناف (الثقة أقل من 0.6) ---------- */
const lowConf = i => i.confidence != null && isFinite(i.confidence) && Number(i.confidence) < 0.6;
async function correctItems() {
  const m = S.meal; if (!m) return;
  const low = m.items.filter(lowConf);
  return fixNext(m, low.length ? low : m.items.slice(0, 1), 0);
}
async function fixNext(m, list, k) {
  if (k >= list.length) return fixDone(m);
  const it = list[k];
  await bot(`وش الصنف الصحيح لـ<b>${esc(it.name)}</b>؟\n<span class="hint">اكتبوا اسمه (مثال: «مرقوق»)</span>`);
  btns([['✅ هو صح', () => { it.confidence = 1; return fixNext(m, list, k + 1) }], ['', async t => { await renameItem(m, it, t); return fixNext(m, list, k + 1) }, /.+/, 'name']]);
}
async function renameItem(m, it, t) {
  const name = String(t || '').trim().replace(/^(هو|هذا|هذي|الصنف|اسمه|الصحيح)\s+/, '').slice(0, 40);
  if (!name) return;
  const old = it.name; it.name = name; it.confidence = 1;
  if (m.dish_name && m.dish_name.includes(old)) m.dish_name = null;
  if (API.ok) { try { const r = await api('/api/analyze', { action: 'price', items: [{ name, grams: it.grams }] }, 15000); const p = r && r.items && r.items[0]; if (p) { it.name = p.name || name; it.value_sar = p.value_sar; it.safe_until = p.safe_until } } catch (e) {} }
  m.total_value_sar = m.items.reduce((s, i) => s + (Number(i.value_sar) || 0), 0);
  track('item_correction', { meal_id: mid(m), item: old, name: it.name, grams: it.grams, value_sar: it.value_sar, safe_until: it.safe_until });
}
async function fixDone(m) {
  const lines = m.items.map(i => `• ${esc(i.name)}: حوالي <b>${Math.round(i.grams)} جم</b> (${SAR(i.value_sar)} ريال)`).join('\n');
  await bot(`تم التعديل ✅ الأصناف الحين:\n${lines}\n\n💰 إجمالي القيمة: <b>${SAR(m.total_value_sar)} ريال</b>`);
  return nextStep(m);
}

/* سيناريو احتياطي بدون اتصال */
async function photoScripted(p, already) {
  closeSheet();
  if (p === 'plate') {
    if (!already) { me('<img src="plate.jpg" alt="">', 'media'); remember('user', '[أرسل صورة]'); await wait(300); await bot('ثواني نحلل الصورة… 🔍', 600) }
    await wait(800);
    showResult({ items: [{ name: 'رز', grams: 640, value_sar: 8, safe_until: new Date(Date.now() + 864e5).toISOString().replace(/T.*/, 'T14:00') }, { name: 'دجاج', grams: 210, value_sar: 8, safe_until: new Date(Date.now() + 3 * 864e5).toISOString() }], total_value_sar: 16, servings_left: 3, next_day_suggestion: 'كبسة باقية بالخضار' });
  } else if (p === 'pots') {
    if (!already) { me('<div class="pots">قدور العزيمة</div>', 'media'); remember('user', '[أرسل صورة القدور]'); await wait(300); await bot('ثواني نحلل الصورة… 🔍', 600) }
    recordMeal({ items: [{ name: 'رز', grams: 6000, value_sar: 72 }, { name: 'لحم', grams: 3000, value_sar: 210 }], total_value_sar: 282, servings_left: 30, charity_suggestion: true });
    await bot('باقي عندكم كمية كبيرة: تقريبًا <b>6 كجم رز</b> و<b>3 كجم لحم</b> 🍲\nهل هذا الأكل <b>تقدّم على السفرة</b>، ولا باقي في القدور ما أحد أكل منه؟', 1300);
    btns([['باقي في القدور', served, /^لا|باقي|بالقدور|في القدور|ما تقد|ما انقد|محد|ما أحد|ما احد|ما أكل منه|ما اكل منه|ما انلمس/], ['تقدّم على السفرة', homePlan, /^(نعم|ايه|إيه|اي|أي)(\s|$)|^تقد|انقد|قدمناه|قدّمناه|حطيناه على|أكلوا منه|اكلوا منه/]]);
  } else {
    if (!already) { me('<img src="s-chair.jpg" alt="">', 'media'); remember('user', '[أرسل صورة ما فيها أكل]'); await bot('ثواني نحلل الصورة… 🔍', 600) }
    await bot('ما قدرنا نتعرف على أكل في الصورة 🤔\nصوّروا الصحن كامل من فوق وبإضاءة واضحة، وجربوا مرة ثانية.', 900);
  }
}

/* ---------- المتابعة ---------- */
async function fridge() {
  if (S.meal) S.meal.fridge = true;
  track('fridge', { meal_id: mid() });
  if (S.meal && S.meal.meal_id && API.ok) api('/api/analyze', { action: 'fridge', meal_id: S.meal.meal_id }, 15000).catch(() => {});
  await bot('ممتاز! 👏 سجّلنا إنه دخل الثلاجة، وبنذكّركم بكرة الصبح باللي عندكم.');
  skip('صباح اليوم التالي', morning);
}
async function morning() {
  const m = S.meal; if (!m) return bot('ما عندنا وجبة محللة للحين 📷 أرسلوا صورة أول.');
  const names = m.items.map(i => `${esc(i.name)} (${Math.round(i.grams)} جم)`).join(' و'); const sv = Math.max(1, Number(m.servings_left) || 1);
  const rice = m.items.some(i => isRice(i.name));
  day('اليوم التالي · 11:00 ص'); track('reminder', { payload: { kind: 'morning' } });
  await bot(`صباح الخير ☀️\nعندكم في الثلاجة <b>${names}</b> يكفي تقريبًا <b>${sv}</b>.` + (m.next_day_suggestion ? `\nاقتراح الغداء: <b>${esc(m.next_day_suggestion)}</b> 🍲` : '') + (rice ? '\nوبكذا ما تحتاجون تطبخون رز اليوم.' : ''));
  btns([['تمام، بنسويها 👍', async () => { await bot('بالعافية مقدمًا 🌿'); skip('نهاية مدة الحفظ', closeQ) }], ['عندي سؤال', async () => { await bot(API.ai ? 'تفضّل، اكتب سؤالك أو أرسله بصوتك 🎙️' : 'اكتب سؤالك تحت 👇 (مثال: «كيف أسخّن الرز؟»)') }]]);
}
async function closeQ() {
  const m = S.meal; if (!m) return;
  const g = mealG(m), v = SAR(m.total_value_sar), label = m.dish_name || m.items.map(i => i.name).join(' و');
  day('بعد يوم'); await bot(`وش صار على <b>${esc(label)}</b>؟`);
  btns([['أُكل ✅', async () => { m.status = 'full'; track('outcome', { meal_id: mid(m), outcome: 'eaten' }); await bot(`ممتاز! 🎉 أنقذتوا <b>${Math.round(g)} جم</b> ووفّرتوا <b>${v} ريال</b>.`); weekly() }, /^(أُ?كل|اكل|انأكل|أكلناه|اكلناه|خلص|انتهى|كله|كامل)/],
  ['نصفه', async () => { m.status = 'half'; track('outcome', { meal_id: mid(m), outcome: 'half' }); await bot(`حلو 👌 أنقذتوا تقريبًا <b>${Math.round(g / 2)} جم</b> (${Math.round(v / 2)} ريال). المرة الجاية جربوه بطبخة الصبح بدري.`); weekly() }, /^(نص|نصه|بعضه|شوي|جزء)/],
  ['رُمي 🗑️', async () => { m.status = 'thrown'; track('outcome', { meal_id: mid(m), outcome: 'thrown' }); await bot('ولا يهمكم 🙏 للتخلص الصحيح: افصلوا الأكل عن البلاستيك والكرتون، وحطوه في كيس محكم.\nوهذا بالضبط اللي بيساعدنا فيه «مقدار» 👇'); weekly() }, /رمي|رميناه|انرمى|زبال|خرب|فسد/]], true);
}
function weekly() {
  skip('آخر الأسبوع', async () => {
    day('آخر الأسبوع');
    const w = weeklyStats();
    if (!w) { await bot('ما عندنا وجبات محللة للحين 📷 أرسلوا لنا صور وجباتكم أول، وبعدها نحسب لكم الكمية المناسبة.'); return btns([['📷 أرسل صورة', openSheet]]) }
    const meals = `من ${w.n} ${w.n === 1 ? 'وجبة' : 'وجبات'} حللناها`;
    if (w.riceG > 0 && w.cups < .5) { await bot(`📊 <b>مقدار الأسبوع</b>\nما لقينا زيادة واضحة في الرز ${meals} 👌 كمّلوا على نفس الكمية.`); return btns([['🎉 عندنا عزيمة', gath]]) }
    if (w.riceG > 0) {
      await bot(`📊 <b>مقدار الأسبوع</b>\nالرز يزيد عندكم تقريبًا <b>${cupsTxt(w.cups)}</b> في كل وجبة (${meals}).\nالتوصية: قلّلوا كمية الرز <b>${cupsTxt(w.cups)}</b> 🍚`);
      showDash();
      const cm = await cookMsg(`قلّلوا كمية الرز المطبوخ بمقدار ${cupsTxt(w.cups)} في كل وجبة`, cookFallback(S.lang, w.cups));
      await bot('<img src="cups.jpg" alt="' + cupsTxt(w.cups) + '">رسالة جاهزة للطباخ (' + S.lang + '):\n' + cm, 1100);
    } else {
      const [name, g] = w.top;
      await bot(`📊 <b>مقدار الأسبوع</b>\nأكثر صنف يزيد عندكم هو <b>${esc(name)}</b>: حوالي <b>${Math.round(g)} جم</b> (${meals}).\nالتوصية: قلّلوا كميته شوي في الطبخات الجاية.`);
      showDash();
      const cm = await cookMsg(`قلّلوا كمية ${name} شوي في الطبخات الجاية`, cookFallback(S.lang, null, name));
      await bot('رسالة جاهزة للطباخ (' + S.lang + '):\n' + cm, 1100);
    }
    btns([['أرسلها للطباخ ↪️', async () => { await bot('تم ✅ أرسلها لمن يطبخ عندكم.\nوإذا عندكم مناسبة اكتبوا «عزيمة» 🎉'); btns([['🎉 عندنا عزيمة', gath]]) }]]);
  });
}
async function gath() {
  await bot('الله يتمم 🎉 كم عدد الضيوف تقريبًا؟\n<span class="hint">اختاروا أو اكتبوا العدد</span>');
  btns([['10 – 20', () => gq(10, 20)], ['20 – 30', () => gq(20, 30)], ['أكثر من 30', guestsMore], ['', (t, n, n2) => n ? gq(n, n2 || n) : guestsMore(), /\d|[٠-٩]/, 'guests']], true)
}
async function guestsMore() { await bot('حيّاهم الله 🤍 اكتبوا العدد التقريبي 👇'); btns([['', (t, n, n2) => n ? gq(n, n2 || n) : gath(), /\d|[٠-٩]/, 'guests']]) }
const kg = x => (Math.round(x * 10) / 10).toString();
async function gq(lo, hi) {
  hi = hi || lo; S.gather = { guests: Math.round((lo + hi) / 2), at: Date.now() };   // الوجبة اللي تتحلل بعد العزيمة في نفس الجلسة تتسجل occasion = gathering
  track('gathering', { guests_min: lo, guests_max: hi, rice_kg: Math.round((lo + hi) / 2 * .24 * 10) / 10, meat_kg: Math.round((lo + hi) / 2 * .12 * 10) / 10 });
  const who = lo === hi ? `<b>${lo} ضيف</b>` : `<b>${lo} إلى ${hi} ضيف</b>`;
  const r = lo === hi ? kg(lo * .24) : `${kg(lo * .24)} – ${kg(hi * .24)}`, m = lo === hi ? kg(lo * .12) : `${kg(lo * .12)} – ${kg(hi * .12)}`;
  await bot(`أبشروا 🤍 المقترح لـ${who}:\n🍚 رز (مطبوخ): تقريبًا <b>${r} كجم</b>\n🍖 لحم: تقريبًا <b>${m} كجم</b>\nمع هامش يحفظ الكرم والضيافة.\n\n💡 قدّموا على دفعات، وخلّوا الباقي في القدور مغطى، عشان لو زاد يصلح للتبرع.`);
  skip('بعد العزيمة', async () => { day('بعد العزيمة · 9:10 م'); await bot('عساها عامرة 🌿 لو بقي أكل، صوّروا القدور وأرسلوها 📷'); btns([['📷 أرسل صورة', openSheet]]) });
}
async function homePlan() { await bot('تمام 🌿 الأكل اللي تقدّم على السفرة ما يصلح للتبرع، لسلامة الغذاء.\nهذي خطة حفظه في البيت: وزّعوه في علب صغيرة ودخلوه الثلاجة خلال ساعتين، والرز يُستخدم خلال يوم، واللحم خلال 3 أيام.') }
/* ---------- أقرب جمعية حفظ نعمة ---------- */
// القائمة قابلة للتعديل: أضيفوا أي جمعية برقمها وإحداثيات مدينتها
const CHARITIES = [
  { name: 'طعامي لحفظ النعمة', city: 'بريدة', lat: 26.326, lng: 43.975, phones: ['920005538'] },
  { name: 'خيرات لحفظ النعمة', city: 'الرياض', lat: 24.7136, lng: 46.6753, phones: ['0537777266'] },
  { name: 'صون لحفظ النعمة', city: 'الأفلاج', lat: 22.28, lng: 46.73, phones: ['0550051712'] },
  { name: 'إطعام (بنك الطعام السعودي)', city: 'الدمام', lat: 26.4207, lng: 50.0888, phones: ['0535412227'] },
  { name: 'حفظ النعمة «استدامة»', city: 'جدة', lat: 21.4858, lng: 39.1925, phones: ['0555310971', '920003063'] },
  { name: 'أرزاق لحفظ النعمة', city: 'الطائف', lat: 21.2703, lng: 40.4158, phones: ['0556006684', '0127500059'] },
];
const CITIES = [
  ['بريدة', 26.326, 43.975, /بريد|القصيم|قصيم/], ['عنيزة', 26.084, 43.993, /عنيز/], ['الرس', 25.869, 43.497, /الرس/],
  ['الرياض', 24.7136, 46.6753, /رياض|الخرج|الدرعية/], ['الأفلاج', 22.28, 46.73, /افلاج|أفلاج|ليلى|السليل|وادي الدواسر/],
  ['الدمام', 26.4207, 50.0888, /دمام|الخبر|ظهران|الشرقي|القطيف|الأحساء|الاحساء|الجبيل/],
  ['جدة', 21.4858, 39.1925, /جدة|جده|مكة|مكه|رابغ/], ['الطائف', 21.2703, 40.4158, /طائف|الطايف/],
  ['المدينة', 24.5247, 39.5692, /المدينة|المدينه|ينبع/], ['حائل', 27.5114, 41.7208, /حائل|حايل/],
  ['أبها', 18.2164, 42.5053, /أبها|ابها|خميس|عسير/], ['تبوك', 28.3835, 36.5662, /تبوك/],
];
let HERE = null, NEAR = [], NI = 0;
const km = (a, b, c, d) => { const r = x => x * Math.PI / 180, R = 6371; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) };
function qtyTxt() { const m = S.meal; if (!m || !m.items || !m.items.length) return ''; return m.items.map(i => (i.grams >= 1000 ? (Math.round(i.grams / 100) / 10) + ' كجم ' : Math.round(i.grams) + ' جم ') + i.name).join(' + ') }
async function served() {
  await bot('ما شاء الله 👏 الأكل اللي باقي في القدور تقدرون تتبرعون فيه ويوصل لمستحقيه.', 800);
  btns([['📍 أقرب جمعية لي', () => charityStart(), /جمعي|تبرع|أتبرع|اتبرع|ايه|نعم/], ['🧊 خطة حفظ في البيت', homePlan, /حفظ|البيت|الثلاج/]]);
}
// سلامة التبرع: نسأل متى انطبخ الأكل قبل ما نطلع الجمعية
async function charityStart(city) {
  const m = S.meal, go = () => city ? cityTyped(city) : findCharity();
  if (m && m.ageOk) return go();
  await bot('قبل ما نطلع لكم الجمعية: <b>متى انطبخ الأكل؟</b>\n<span class="hint">عشان نتأكد إنه يصلح للتبرع</span>');
  btns([['أقل من ساعتين', () => ageOk(m, go, 'fresh'), /أقل|اقل|نص ساع|دقايق|دقيقة|توه|قبل شوي/], ['من ساعتين لـ4', () => ageOk(m, go, 'mid'), /ساعتين|ثلاث ساعات|3 ساعات|٣ ساعات/], ['أكثر من 4 ساعات', () => ageLate(m, go), /أكثر|اكثر|أربع|اربع|4 ساعات|من الصبح|أمس|امس|بالليل/]]);
}
async function ageOk(m, go, k) {
  if (m) m.ageOk = true; m.cookedWindow = { fresh: 'أقل من ساعتين', mid: 'من ساعتين لـ4', fridge: 'أكثر من 4 ساعات (بالثلاجة)' }[k];
  if (k === 'mid') await bot('تمام 👌 بس تحركوا بسرعة: الأفضل يوصل للجمعية خلال ساعتين، وخلّوه مغطى.', 900);
  return go();
}
async function ageLate(m, go) {
  await bot('أكثر من 4 ساعات 🤔 وين محفوظ الأكل الحين؟');
  btns([['🧊 في الثلاجة', () => ageOk(m, go, 'fridge'), /ثلاج|مبرد|فريزر/], ['🌡️ برا الثلاجة', () => bot('الله يعافيكم 🙏 ما نقترح التبرع بأكل بقي برا الثلاجة أكثر من 4 ساعات، لسلامة اللي بيستلمه.\nلو شميتوا ريحة أو تغيّر شكله تخلصوا منه في كيس محكم مفصول عن البلاستيك والكرتون. والمرة الجاية خلّوا الباقي في القدور مغطى وبرّدوه بسرعة عشان يصلح للتبرع 🌿', 1000), /برا|بره|خارج|طاولة|الجو|حار/]]);
}
async function findCharity() {
  await bot('شاركونا موقعكم عشان نطلع لكم <b>أقرب جمعية حفظ نعمة</b> وطريقة التواصل معها 📍\n<span class="hint">أو اكتبوا اسم مدينتكم</span>');
  btns([['📍 مشاركة الموقع', shareLoc], ['🏙️ أكتب مدينتي', askCity], ['', t => cityTyped(t), /.+/, 'city']]);
}
async function askCity() { await bot('اكتبوا اسم مدينتكم 👇'); btns([['', t => cityTyped(t), /.+/, 'city']]) }
const ALIAS = { 'بريدة': ['بريده', 'القصيم'], 'عنيزة': ['عنيزه'], 'الرس': ['رس'], 'الرياض': ['رياض', 'الخرج', 'الدرعيه'], 'الأفلاج': ['افلاج', 'ليلى', 'السليل'], 'الدمام': ['دمام', 'الخبر', 'الظهران', 'الشرقيه', 'القطيف', 'الاحساء', 'الهفوف', 'الجبيل'], 'جدة': ['جده', 'مكه', 'رابغ'], 'الطائف': ['طائف', 'الطايف'], 'المدينة': ['المدينه', 'ينبع'], 'حائل': ['حايل'], 'أبها': ['ابها', 'خميس', 'عسير'], 'تبوك': ['تبوك'] };
const norm = w => String(w).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^ء-يa-z]/gi, '').replace(/^(وال|بال|فال|لل|ال)/, '');
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const q = [i]; for (let j = 1; j <= n; j++) q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = q } return p[n] }
function findCity(t) {
  const direct = CITIES.find(c => c[3].test(t)); if (direct) return direct;
  const words = String(t).split(/\s+/).map(norm).filter(w => w.length >= 3);
  let best = null, bd = 9;
  for (const c of CITIES) for (const al of [c[0], ...(ALIAS[c[0]] || [])]) { const n = norm(al); for (const w of words) { const d = lev(w, n); const ok = d <= (n.length >= 7 ? 2 : 1) && d < n.length / 3; if (ok && d < bd) { bd = d; best = c } } }
  return best;
}
async function cityTyped(t) {
  let c = findCity(t);
  if (c) { HERE = { lat: c[1], lng: c[2], city: c[0] }; return nearest() }
  if (API.ai) {
    const tp = typingOn(); let j = null; try { j = await api('/api/chat', { mode: 'city', text: t }, 15000) } catch (e) {} typingOff(tp);
    if (j && j.city) { HERE = { lat: j.lat, lng: j.lng, city: j.city }; return nearest() }
    if (!/^\S{2,14}$/.test(t.trim())) { try { await askAI({ text: t }, H.slice(0, -1)) } catch (e) {} return btns([['', x => cityTyped(x), /.+/, 'city']]) }
  }
  await bot('ما عرفنا المدينة 🤔 اكتبوا اسمها مرة ثانية (مثل: الرياض، جدة، بريدة)، أو شاركوا موقعكم 📍');
  btns([['📍 مشاركة الموقع', shareLoc], ['', x => cityTyped(x), /.+/, 'city']]);
}
function shareLoc() {
  if (!navigator.geolocation) return askCity();
  const t = typingOn();
  navigator.geolocation.getCurrentPosition(p => {
    typingOff(t); HERE = { lat: p.coords.latitude, lng: p.coords.longitude, city: '' };
    const c = CITIES.map(c => [c, km(HERE.lat, HERE.lng, c[1], c[2])]).sort((a, b) => a[1] - b[1])[0]; if (c && c[1] < 60) HERE.city = c[0][0];
    me(`<div class="map"></div><span class="loc">📍 الموقع الحالي${HERE.city ? ' · ' + HERE.city : ''}</span>`); remember('user', '[شارك الموقع' + (HERE.city ? ': ' + HERE.city : '') + ']');
    nearest();
  }, () => { typingOff(t); bot('ما قدرنا نوصل لموقعكم 🙏 (يمكن الإذن مقفل)\nاكتبوا اسم مدينتكم 👇').then(() => btns([['', t => cityTyped(t), /.+/, 'city']])) }, { timeout: 12000, maximumAge: 600000 });
}
async function nearest() { NEAR = CHARITIES.map(c => ({ ...c, d: km(HERE.lat, HERE.lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d); NI = 0; famSync(); showCharity() }
function donTrack(c, method, status) {
  const m = S.meal;
  return track('donation', { meal_id: mid(m), charity_name: c.name, charity_city: c.city, distance_km: Math.round(c.d), grams: m ? Math.round(mealG(m)) : undefined, cooked_window: m && m.cookedWindow, contact_method: method || undefined, status, donation_id: DON.id || undefined })
    .then(j => { if (j && j.donation_id) DON.id = j.donation_id });
}
function linkBtns(list) {
  const w = el(`<div class="btns"></div>`); list.forEach(([label, href, opt]) => { const a = document.createElement('a'); a.className = 'lb'; a.textContent = label; a.href = href; a.target = '_blank'; a.rel = 'noopener'; if (S.tour && !(opt && opt.live)) { a.title = 'معطّل أثناء الجولة'; a.addEventListener('click', ev => ev.preventDefault()) } else if (typeof opt === 'function') a.addEventListener('click', opt); w.appendChild(a) });
  chat.appendChild(w); const rb = [...chat.querySelectorAll('.row.them .b')].pop(); if (rb) { w.style.width = Math.max(rb.offsetWidth, chat.clientWidth * .6) + 'px'; rb.style.borderBottomLeftRadius = rb.style.borderBottomRightRadius = '0' } scroll();
}
async function showCharity() {
  const c = NEAR[NI]; if (!c) return bot('هذي كل الجمعيات المسجلة عندنا للحين 🙏');
  DON.id = null;
  const d = Math.round(c.d), dist = d < 3 ? 'قريبة منكم' : `تقريبًا ${d} كم${HERE && HERE.city && HERE.city !== c.city ? ' عن ' + HERE.city : ''}`;
  await bot(`${NI ? 'هذي جمعية ثانية' : (d > 150 ? 'للحين ما عندنا جمعية مسجلة في مدينتكم، وهذي أقرب وحدة' : 'أقرب جمعية لكم')} 🤝\n<b>جمعية ${esc(c.name)}</b>\n📍 ${esc(c.city)} · ${dist}\n📞 <span dir="ltr">${c.phones.join(' · ')}</span>\n\n${qtyTxt() ? '🍲 الكمية: ' + esc(qtyTxt()) + '\n' : ''}💡 تواصلوا معهم الحين، والأكل يبقى مغطى لين يوصل المندوب.`, 1100);
  const mob = c.phones.find(p => /^05\d{8}$/.test(p));
  const msgTxt = `السلام عليكم ورحمة الله، عندنا فائض أكل من مناسبة ما تقدّم على السفرة وباقي في القدور${qtyTxt() ? ': ' + qtyTxt() : ''}.${HERE && HERE.city ? ' موقعنا: ' + HERE.city + '.' : ''} هل تقدرون تستلمونه؟ جزاكم الله خير. (وصلنا لكم عن طريق سُفرة)`;
  const L = [['📞 اتصال', 'tel:' + c.phones[0], () => donTrack(c, 'call', 'contacted')]];
  if (mob) L.push(['💬 مراسلة واتساب', 'https://wa.me/966' + mob.slice(1) + '?text=' + encodeURIComponent(msgTxt), () => donTrack(c, 'whatsapp', 'contacted')]);
  L.push(['🗺️ على الخريطة', 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('جمعية ' + c.name + ' ' + c.city), () => donTrack(c, 'map', 'contacted')]);
  linkBtns(L);
  await bot('وإذا تواصلتوا معهم علّمونا 👇', 1400);
  btns([['✅ تواصلنا واتفقنا', donated, /تواصل|اتفق|تم|خلاص|كلمناهم|كلّمناهم/], ['🔄 جمعية ثانية', () => { NI++; showCharity() }, /ثاني|غير|ما رد|مارد|ما ردوا/]]);
}
async function donated() {
  const m = S.meal; if (m && !m.donated && !m.status) { m.donated = true; m.donatedG = mealG(m) }
  if (NEAR[NI]) donTrack(NEAR[NI], null, 'agreed');
  await bot('جزاكم الله خير 🤍 أكلكم بيوصل لأسر محتاجة، وسجّلنا الكمية في أثر أسرتكم هذا الشهر.\n<span class="err">(في المرحلة الجاية يوصل الطلب لنظام الجمعية مباشرة عبر API بدون اتصال)</span>');
  skip('آخر الشهر', monthly);
}
async function loc() { return findCharity() }
async function monthly() {
  day('نهاية الشهر');
  const ms = monthStats();
  if (!ms.n) { await bot('ما عندنا وجبات محللة للحين 📷 أرسلوا لنا صور وجباتكم أول، وبعدها نطلع لكم ملخص شهركم.'); return btns([['📷 أرسل صورة', openSheet]]) }
  const sk = ms.saved / 1000;
  await bot(`📊 <b>ملخص شهركم مع سُفرة</b>\n🍽️ وجبات حللناها: <b>${ms.n}</b>\n💰 وفّرتوا: <b>${SAR(ms.val)} ريال</b>\n🌿 أنقذتوا: <b>${kg(sk)} كجم</b> أكل\n🤝 تبرعتوا: <b>${kg(ms.don / 1000)} كجم</b> لجمعية\n\n📈 توقّع لو استمر نفس النمط شهر كامل: تقريبًا <b>${kg(sk * 4.3)} كجم</b> و<b>${SAR(ms.val * 4.3)} ريال</b>\n🌍 تقريبًا <b>${kg(sk * 2.5)} كجم</b> كربون تجنبتوه (تقديري)` + (sk ? '\n\nكل لقمة تفرق 🌿' : '\n\nما سجلنا أكل أنقذتوه للحين: لما تقولون لنا إنه أُكل أو تبرعتوا فيه ينحسب.'));
  showDash();
  btns([['📲 أضف إنجازنا في لتدوم', async () => { await bot('هذي الخطوة الجاية في سُفرة 🤝 نقترح على لتدوم إن ملخص شهركم ينضاف تلقائيًا لحسابكم في تطبيق لتدوم، عشان يجتمع وعيكم وأثركم في مكان واحد.\n<span class="err">(ميزة مقترحة، ما هي مفعّلة في هذي النسخة)</span>'); await litadoomCard('وللحين تقدرون تحمّلون تطبيق لتدوم وتتابعون محتواه 👇'); btns([['🔁 ابدأ من جديد', () => start({ fresh: !S.tour })]]) }], ['🔁 ابدأ من جديد', () => start({ fresh: !S.tour })]]);
}

/* ---------- 🧊 الثلاجة الذكية (كلام حر أو صوت) + تنبيهات استباقية ---------- */
const OUT_TXT = { eaten: 'انأكل 👏', half: 'انأكل نصه', thrown: 'انرمى (ولا يهمكم 🙏)', expired: 'انتهت مدته وتخلصنا منه 🙏' };
const LOCAL_STATUS = { eaten: 'full', partly_eaten: 'half', thrown: 'thrown' };
const hoursTxtB = h => { if (h <= 0) return 'انتهت مدته'; if (h < 1) return 'أقل من ساعة'; if (h < 24) return 'باقي ' + Math.round(h) + ' ساعة'; const d = Math.floor(h / 24); if (d >= 60) return 'باقي ' + Math.round(d / 30) + ' شهر'; const r = Math.round(h - d * 24); return 'باقي ' + (d === 1 ? 'يوم' : d === 2 ? 'يومين' : d + ' أيام') + (r && d < 7 ? ' و' + r + ' ساعة' : '') };
const gramsB = g => (g >= 1000 ? kg(g / 1000) + ' كجم' : Math.round(g) + ' جم');
const needFam = () => (!FAM || famOff() ? (bot('الثلاجة الذكية تحتاج حسابكم يتسجّل 🙏 جرّبوا بعد شوي.'), true) : false);
async function fridgeAdd(a, src) {
  if (needFam()) return;
  const r = await track('fridge_add', { items: a.items, source: src });
  if (!r || !r.items) return bot('ما قدرنا نسجّل الحين 🙏 جرّبوا بعد شوي.');
  const lines = r.items.map(i => '• ' + esc(i.name) + ': ' + gramsB(i.grams) + (i.estimated ? ' (تقريبي)' : '') + ' في ' + (i.storage === 'freezer' ? 'الفريزر ❄️' : 'الثلاجة 🧊') + '، ' + (i.hours_left <= 0 ? '⚠️ مدته الآمنة انتهت' : i.storage === 'freezer' ? 'يحفظ ' + esc(i.range) : 'الأفضل تستخدمونه قبل <b>' + whenTxt(i.safe_until) + '</b>')).join('\n');
  const est = r.items.some(i => i.estimated), srcs = [...new Set(r.items.map(i => i.source_name))].join('، ');
  recordMeal({ items: r.items.map(i => ({ name: i.name, grams: i.grams, value_sar: i.value_sar, state: 'باقي', safe_until: i.safe_until })), total_value_sar: r.items.reduce((x, i) => x + (Number(i.value_sar) || 0), 0), servings_left: Math.round(r.items.reduce((x, i) => x + i.grams, 0) / 300), db_meal_id: r.meal_id, fridge: true });
  await bot('تم ✅ سجلنا عندكم:\n' + lines + (est ? '\n\n💡 الوزن تقريبي، قولوا لنا الوزن الدقيق لو تبون نعدّله.' : '') + '\n<span class="hint">مدة الحفظ حسب: ' + esc(srcs) + '</span>');
}
async function fridgeUpdate(a) {
  if (needFam()) return;
  const r = await track('fridge_update', a);
  if (!r) return bot('ما قدرنا نحدّث الثلاجة الحين 🙏 جرّبوا بعد شوي.');
  if (r.none) return bot('ما لقينا ' + (a.target ? '«' + esc(a.target) + '» ' : 'الصنف ') + 'في ثلاجتكم 🤔 اكتبوا «وش عندي بالثلاجة» وأعرض لكم اللي مسجّل.');
  if (r.ambiguous) {
    await bot('عندكم أكثر من صنف بهالاسم، أي واحد تقصدون؟');
    return btns(r.ambiguous.slice(0, 5).map(i => [(i.name + ' ' + gramsB(i.grams) + (i.dish_name && i.dish_name !== i.name ? ' · ' + i.dish_name : '')).slice(0, 40), () => fridgeUpdate({ item_id: i.item_id, outcome: a.outcome, move_to: a.move_to })]));
  }
  if (r.updated) {
    const names = r.updated.map(i => '<b>' + esc(i.name) + '</b>').join(' و');
    for (const [mid, st] of Object.entries(r.meal_statuses || {})) { const m = S.meals.find(x => x.db_meal_id === mid); if (m && LOCAL_STATUS[st]) m.status = LOCAL_STATUS[st] }
    return bot('تم ✅ شلنا ' + names + ' من الثلاجة وسجلناه: ' + OUT_TXT[r.outcome]);
  }
  if (r.moved && r.moved.length) await bot('تم ✅ نقلنا ' + r.moved.map(i => '<b>' + esc(i.name) + '</b>').join(' و') + ' للفريزر ❄️، يحفظ ' + esc(r.moved[0].range) + '\n<span class="hint">المصدر: ' + esc(r.moved[0].source_name) + '</span>');
  if (r.blocked && r.blocked.length) { await bot('⚠️ ' + r.blocked.map(i => '<b>' + esc(i.name) + '</b>').join(' و') + ' انتهت مدته الآمنة، ما ننصح بتجميده، والأفضل التخلص منه.'); btns([['تخلصنا منه', () => fridgeUpdate({ item_id: r.blocked[0].item_id, outcome: 'expired' })]]) }
  if (!(r.moved && r.moved.length) && !(r.blocked && r.blocked.length)) await bot('هذا الصنف في الفريزر من قبل ❄️');
}
async function fridgeList() {
  if (needFam()) return;
  const r = await track('fridge_list');
  if (!r) return bot('ما قدرنا نجيب الثلاجة الحين 🙏 جرّبوا بعد شوي.');
  if (!r.items.length) return bot('ثلاجتكم فاضية عندنا 🧊 لو حطيتوا أكل قولوا لنا (مثل «حطيت كيلو رز بالثلاجة») أو صوّروه 📷');
  await bot('🧊 <b>في ثلاجتكم الحين</b> (' + r.items.length + '):\n' + r.items.slice(0, 8).map(i => '• ' + esc(i.name) + ' ' + gramsB(i.grams) + (i.storage === 'freezer' ? ' ❄️' : '') + ' — ' + (i.hours_left < 12 ? '⏳ ' : '') + hoursTxtB(i.hours_left)).join('\n'), 700);
  for (const i of r.items.slice(0, 4)) {
    them('<b>' + esc(i.name) + '</b> · ' + gramsB(i.grams) + ' · ' + hoursTxtB(i.hours_left));
    btns([['أكلناه', () => fridgeUpdate({ item_id: i.item_id, outcome: 'eaten' })], ['نصه', () => fridgeUpdate({ item_id: i.item_id, outcome: 'half' })], ['رميناه', () => fridgeUpdate({ item_id: i.item_id, outcome: 'thrown' })], ...(i.storage !== 'freezer' ? [['للفريزر', () => fridgeUpdate({ item_id: i.item_id, move_to: 'freezer' })]] : [])], true);
  }
  if (r.items.length > 4) { await bot('وفيه غيرها بلوحة أسرتكم 👇'); showDash() }
}
// تنبيهات استباقية عند فتح البوت. في واتساب الحقيقي هذي تكون رسائل تذكير مجدولة (Template messages) يرسلها الخادم في وقتها،
// مو عند فتح المحادثة: هنا نحاكيها بفحص الثلاجة أول ما يفتح المستخدم البوت.
async function showAlerts() {
  if (S.tour || TOUR.on || !FAM || !API.ok) return;
  const r = await Promise.race([track('fridge_alerts'), wait(3000).then(() => null)]);
  if (!r) return;
  for (const i of r.soon || []) {
    await bot('⏰ انتبهوا: <b>' + esc(i.name) + '</b> ينتهي ' + whenTxt(i.safe_until) + '\n💡 ' + (i.suggestion ? 'اقتراح: <b>' + esc(i.suggestion) + '</b>' : 'الأفضل تطبخونه اليوم'), 600);
    btns([['بنطبخه اليوم', async () => { track('reminder', { payload: { action: 'cook_today' } }); await bot('تمام 🌿 الله يعطيكم العافية، استفيدوا منه قبل ما ينتهي.') }], ['أكلناه', () => fridgeUpdate({ item_id: i.item_id, outcome: 'eaten' })], ['للفريزر', () => fridgeUpdate({ item_id: i.item_id, move_to: 'freezer' })]], true);
  }
  for (const i of r.expired || []) {
    await bot('⚠️ <b>' + esc(i.name) + '</b> انتهت مدته الآمنة حسب ' + esc(i.source_name) + '، الأفضل التخلص منه', 600);
    btns([['تخلصنا منه', () => fridgeUpdate({ item_id: i.item_id, outcome: 'expired' })]]);
  }
}

/* ---------- 📊 أثري ---------- */
async function impactCard() {
  const s = monthStats();
  if (!s.n) { await bot('ما عندنا وجبات محللة للحين 📷 أرسلوا أول صورة وبنحسب لكم أثركم.'); return btns([['📷 أرسل صورة', openSheet]]) }
  const sk = s.saved / 1000;
  await bot(`📊 <b>أثركم مع سُفرة</b>\n🍽️ وجبات حللناها: <b>${s.n}</b>\n🌿 أنقذتوا: <b>${kg(sk)} كجم</b> أكل\n💰 وفّرتوا: <b>${SAR(s.val)} ريال</b>\n🤝 تبرعتوا: <b>${kg(s.don / 1000)} كجم</b> لجمعية\n🌍 تقريبًا <b>${kg(sk * 2.5)} كجم</b> كربون تجنبتوه (تقديري)`);
  showDash();
}

/* ---------- لتدوم ---------- */
const LTD = { site: 'https://flwp.gfsa.gov.sa/', ios: 'https://apps.apple.com/app/id6745878156', android: 'https://play.google.com/store/apps/details?id=sa.gov.gfsa.flwp.app', huawei: 'https://appgallery.huawei.com/app/C115643345' };
function platform() { const u = navigator.userAgent || ''; if (/HUAWEI|HONOR|HMSCore|HarmonyOS|HuaweiBrowser/i.test(u)) return 'huawei'; if (/iPhone|iPad|iPod/i.test(u) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'; if (/Android/i.test(u)) return 'android'; return 'desktop' }
async function litadoomCard(intro) {
  const pf = platform();
  await bot((intro ? intro + '\n\n' : '') + '📲 <b>تطبيق لتدوم</b>\nالبرنامج الوطني للحد من الفقد والهدر في الغذاء' + (pf === 'desktop' ? '\nاختاروا متجر جوالكم 👇' : '\nحمّلوه مباشرة على جوالكم 👇'), 700);
  const L = pf === 'ios' ? [['⬇️ تحميل من App Store', LTD.ios]] : pf === 'android' ? [['⬇️ تحميل من Google Play', LTD.android]] : pf === 'huawei' ? [['⬇️ تحميل من AppGallery', LTD.huawei]]
    : [['🍎 App Store (آيفون)', LTD.ios], ['🤖 Google Play (أندرويد)', LTD.android], ['📱 AppGallery (هواوي)', LTD.huawei]];
  L.push(['🌐 موقع لتدوم الرسمي', LTD.site]);
  linkBtns(L);
}

/* ---------- الذكاء الاصطناعي ---------- */
function profile() { const q = PEND ? [...chat.querySelectorAll('.row.them .b')].pop() : null; return { size: S.size, lang: S.lang, meal: mealSummary(S.meal), city: (HERE && HERE.city) || '', charity: NEAR[NI] ? 'جمعية ' + NEAR[NI].name + ' في ' + NEAR[NI].city : '', pending: q ? strip(q.innerHTML).slice(0, 200) : '', stats: statsLine(), options: PEND && !PEND.ai ? PEND.labels.map(x => x[0]) : [], kind: PEND && PEND.free ? PEND.free[3] : '' } }
function statsLine() { const s = monthStats(); return s.n ? `${s.n} وجبات محللة، ${kg(s.saved / 1000)} كجم منقذة، ${SAR(s.val)} ريال موفّرة، ${kg(s.don / 1000)} كجم متبرع بها` : 'لا توجد وجبات محللة بعد' }
function aiBtns(list) {
  list = (list || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 3); if (!list.length) return;
  btns(list.map(b => [b, () => (/صور|📷|كاميرا/.test(b) && !/\?|؟/.test(b)) ? openSheet() : text(b, true)]), false, true);
}
async function askAI(extra, hist) {
  const t = typingOn(); const p = PEND; const prof = profile();
  try {
    const j = await api('/api/chat', { ...extra, history: hist, profile: prof }, 45000); typingOff(t);
    if (j.reply && j.reply !== '…') them(fmt(j.reply)); else if (!j.action) them('…');
    const A = j.action, jump = () => { if (PEND) PEND.close() };
    if (A && !['choose', 'answer'].includes(A)) track('chat', { payload: { action: A } });
    if (A === 'litadoom') { const pf = platform(); linkBtns(pf === 'desktop' ? [['🍎 App Store', LTD.ios], ['🤖 Google Play', LTD.android], ['📱 AppGallery', LTD.huawei], ['🌐 موقع لتدوم', LTD.site]] : [['⬇️ حمّل تطبيق لتدوم', LTD[pf]], ['🌐 موقع لتدوم', LTD.site]]) }
    else if (A === 'choose' && p && !p.ai && p.labels[(j.choice || 0) - 1]) { const o = p.labels[j.choice - 1]; p.close(); o[1]() }
    else if (A === 'answer' && p && p.free) { const raw = j.value || extra.text || '', n = j.number ?? parseArNum(raw) ?? parseArNum(extra.text || ''); p.close(); p.free[1](raw, n, j.number2) }
    else if (A === 'charity') { jump(); await wait(300); charityStart(j.city) }
    else if (A === 'gathering') { jump(); await wait(300); j.number ? gq(j.number, j.number2 || j.number) : gath() }
    else if (A === 'photo') { openSheet() }
    else if (A === 'restart') { start({ fresh: !S.tour }) }
    else if (A === 'impact') { jump(); impactCard() }
    else if (A === 'dashboard') { jump(); dashCard() }
    else if (A === 'fridge_add' && j.data) { jump(); await fridgeAdd(j.data, extra.audio ? 'voice' : 'chat') }
    else if (A === 'fridge_update' && j.data) { jump(); await fridgeUpdate({ target: j.data.target, outcome: j.data.outcome, move_to: j.data.move_to }) }
    else if (A === 'fridge_list') { jump(); await fridgeList() }
    else if (A === 'safety_check') { if (j.sources && j.sources.length) linkBtns(j.sources.slice(0, 2).map(x => ['📎 المصدر: ' + x.name, x.url])) }
    else aiBtns(j.buttons);
    return j
  }
  catch (e) { typingOff(t); throw e }
}
async function text(t, already) {
  t = String(t).trim(); if (!t) return;
  const hist = already ? H.slice(0, -1) : H.slice();
  if (!already) { me(esc(t)); remember('user', t) }
  // مع الذكاء الاصطناعي: النموذج يفهم القصد بأي صيغة ويحدد الإجراء (أزرار، إجابة، تبرع، عزيمة...). الأرقام المجردة فقط تُعالج محليًا.
  const nq = PEND && PEND.free && ['size', 'guests'].includes(PEND.free[3]) && onlyNumberish(t) ? parseArNum(t) : null;
  if (nq != null) { const p = PEND; p.close(); return p.free[1](t, nq) }
  if (API.ai) { if (await aiTry(t, hist, 0)) return }
  localRoute(t);
}
// نداء الذكاء الاصطناعي مع حماية الضغط: أول فشل ← رسالة لطيفة وزر إعادة، ثاني فشل ← القواعد المحلية
async function aiTry(t, hist, tries) {
  try { await askAI({ text: t }, hist); return true }
  catch (e) {
    if (tries >= 1 || !softErr(e)) return false;
    them(SOFT_MSG);
    btns([['🔁 أعد المحاولة', async () => { if (!(await aiTry(t, hist, 1))) localRoute(t) }]]);
    return true;
  }
}
function localRoute(t) {
  // احتياطي بدون اتصال: قواعد نصية
  if (/لتدوم|لتدووم|litadoom/i.test(t) && /رابط|تطبيق|حمل|حمّل|تحميل|نزل|نزّل|موقع|لينك|ابليكيشن|app/i.test(t)) return litadoomCard();
  if (PEND) {
    const n = parseArNum(t);
    for (const o of PEND.opts) if (o.re.test(t)) { const p = PEND; p.close(); return o.fn(t, n) }
  }
  { const c = /(أنا|انا|احنا|إحنا|ساكن|ساكنين|نسكن|من)\s+(في|ب|بـ)?\s*/.test(t) && CITIES.find(c => c[3].test(t)); if (c) HERE = { lat: c[1], lng: c[2], city: c[0] } }
  if (/أثري|اثري|كم وفر|وفّرت|وفرت|ملخصي|إنجازي|انجازي/.test(t)) return impactCard();
  if (/لوحة|لوحتي|سجلي|سجل الأسرة|داشبورد|dashboard/i.test(t)) return dashCard();
  if (/(أقرب|اقرب|وين|ابي|أبي|ابغى|أبغى).{0,12}جمعي|أبي أتبرع|ابي اتبرع|ابغى اتبرع|أبغى أتبرع/.test(t)) return charityStart();
  if (/عزيم|ضيوف|مناسبة/.test(t) && t.length < 40) { const n = num(t); return n ? gq(n, n) : gath() }
  legacy(t);
}
function legacy(t) {
  if (/سخن|تسخين/.test(t)) return bot('سخّنوا الرز مع رشة موية وغطّوه، لين يطلع بخاره ويسخن كله ♨️ ولا تسخنونه أكثر من مرة.');
  if (/مرحب|هلا|السلام/.test(t)) return bot('هلا والله 🌷 صوّروا البواقي بعد الأكل وأرسلوها، أو اكتبوا «عزيمة».');
  return bot('صوّروا السفرة بعد الأكل وأرسلوها 📷 والباقي علينا 🌿\n(أو اكتبوا «عزيمة»)');
}

/* ---------- الرسائل الصوتية ---------- */
let rec = null;
const fmtDur = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
async function startRec() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return bot('المتصفح هذا ما يدعم تسجيل الصوت 🙏 اكتبوا رسالتكم.');
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (e) { return bot('ما قدرنا نوصل للمايكروفون 🎙️ اسمحوا بالإذن من المتصفح، أو اكتبوا رسالتكم.') }
  const mt = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
  const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined); const chunks = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) };
  const levels = []; let src = null, an = null, buf = null;
  try { const a = ac(); src = a.createMediaStreamSource(stream); an = a.createAnalyser(); an.fftSize = 512; src.connect(an); buf = new Uint8Array(an.fftSize) } catch (e) {}
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (an) { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) { const x = (v - 128) / 128; s += x * x } levels.push(Math.sqrt(s / buf.length)) } else levels.push(Math.random() * .3);
    const sec = (Date.now() - t0) / 1000; recT.textContent = fmtDur(sec); if (sec >= 60) stopRec(true);
  }, 100);
  rec = { mr, chunks, stream, iv, levels, t0, src, mime: mr.mimeType || mt || 'audio/webm' };
  mr.start(250); recT.textContent = '0:00'; footer.classList.add('recording'); sendB.classList.add('on'); ding(520, .05);
}
function stopRec(send) {
  if (!rec) return; const r = rec; rec = null; clearInterval(r.iv);
  const dur = (Date.now() - r.t0) / 1000;
  footer.classList.remove('recording'); sendB.classList.toggle('on', !!msg.value.trim());
  r.mr.onstop = () => { r.stream.getTracks().forEach(t => t.stop()); try { r.src && r.src.disconnect() } catch (e) {} if (send && dur >= .8) voiceOut(new Blob(r.chunks, { type: r.mime }), dur, r.levels) };
  try { r.mr.stop() } catch (e) {}
}
function bars(levels, n = 34) {
  const out = []; const L = levels.length || 1;
  for (let i = 0; i < n; i++) { const a = Math.floor(i * L / n), b = Math.max(a + 1, Math.floor((i + 1) * L / n)); let m = 0; for (let k = a; k < b; k++) m = Math.max(m, levels[k] || 0); out.push(m) }
  const mx = Math.max(...out, .02); return out.map(v => Math.max(3, Math.round(4 + 22 * Math.min(1, v / mx))));
}
const PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
async function voiceOut(blob, dur, levels) {
  const url = URL.createObjectURL(blob); const hs = bars(levels);
  const node = me(`<div class="voice"><button class="pl">${PLAY}</button><div class="wv">${hs.map(h => `<i style="height:${h}px"></i>`).join('')}</div><span class="du">${fmtDur(dur)}</span><div class="vav"><svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><circle cx="12" cy="8" r="4.2"/><path d="M4 20c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"/></svg><span class="mic"><svg width="15" height="15" viewBox="0 0 24 24" fill="#00A884"><path d="M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12z"/></svg></span></div></div>`, 'vb');
  const bub = node.querySelector('.b'), pl = node.querySelector('.pl'), is = [...node.querySelectorAll('.wv i')], du = node.querySelector('.du');
  const au = new Audio(url);
  pl.onclick = () => { if (au.paused) { au.play(); pl.innerHTML = PAUSE } else { au.pause(); pl.innerHTML = PLAY } };
  au.ontimeupdate = () => { const p = au.currentTime / (isFinite(au.duration) && au.duration ? au.duration : dur); is.forEach((x, k) => x.classList.toggle('p', k / is.length < p)); du.textContent = fmtDur(au.currentTime) };
  au.onended = () => { pl.innerHTML = PLAY; is.forEach(x => x.classList.remove('p')); du.textContent = fmtDur(dur) };
  const hist = H.slice(); remember('user', '[رسالة صوتية]'); track('voice', { payload: { seconds: Math.round(dur) } });
  if (!API.ai) return bot('وصلنا صوتك 🎙️ في النسخة المنشورة يسمعه البوت ويرد عليه.\nوتقدرون الحين ترسلون صورة السفرة 📷');
  let payload;
  try { const wav = await toWav(blob); payload = { mime: 'audio/wav', data: await blobToB64(wav) } }
  catch (e) { payload = { mime: (blob.type || 'audio/webm').split(';')[0], data: await blobToB64(blob) } }
  try {
    const j = await askAI({ audio: payload }, hist);
    if (j && j.transcript) { bub.querySelector('.t').insertAdjacentHTML('beforebegin', `<div class="tr"><small>النص</small>${esc(j.transcript)}</div>`); for (let k = H.length - 1; k >= 0; k--) if (H[k].text === '[رسالة صوتية]') { H[k] = { role: 'user', text: '[رسالة صوتية] ' + String(j.transcript).slice(0, 600) }; break } }
  } catch (e) { bot('ما وضح الصوت عندنا 🙏 جرّبوا مرة ثانية أو اكتبوا رسالتكم.') }
}
async function toWav(blob) {
  const ab = await blob.arrayBuffer(); const a = ac();
  const dec = await new Promise((res, rej) => { const p = a.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej) });
  const sr = 16000; const off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.max(1, Math.ceil(dec.duration * sr)), sr);
  const s = off.createBufferSource(); s.buffer = dec; s.connect(off.destination); s.start();
  const out = await off.startRendering(); const d = out.getChannelData(0);
  const b = new ArrayBuffer(44 + d.length * 2), v = new DataView(b); const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) };
  w(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0, o = 44; i < d.length; i++, o += 2) { const x = Math.max(-1, Math.min(1, d[i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7FFF, true) }
  return new Blob([b], { type: 'audio/wav' });
}

/* ---------- 🎬 الجولة السريعة (وضع العرض) ---------- */
// تشغّل القصة كاملة بنفس دوال البوت الحقيقية: الضغطات تظهر كأن المستخدم ضغطها، ولا يُرسل أي شي خارجي.
const STOP = { stop: true };
const tourStop = el('<button class="skip" style="display:none;position:absolute;top:68px;left:50%;transform:translateX(-50%);z-index:3;margin:0">⏹ إيقاف</button>');
document.querySelector('.app').appendChild(tourStop);
tourStop.onclick = () => { TOUR.stop = true; tourStop.textContent = 'جاري الإيقاف…' };
const tgap = async (ms = 1800) => { await wait(ms); if (TOUR.stop) throw STOP };
function tpress(match) {
  const p = PEND, i = p ? p.labels.findIndex(x => x[0].includes(match)) : -1; if (i < 0) return null;
  const [label, fn] = p.labels[i]; p.close(); me(esc(label)); remember('user', label); return Promise.resolve(fn());
}
function tsay(text, n) { const p = PEND; if (!p || !p.free) return null; p.close(); me(esc(text)); remember('user', text); return Promise.resolve(p.free[1](text, n)) }
function tskip() { const b = [...chat.querySelectorAll('.skip:not(.tourbtn)')].pop(); if (!b || !b._fn) return null; b.remove(); return Promise.resolve(b._fn()) }
async function step(r, ms) { if (r == null) throw new Error('tour step missing'); await r; await tgap(ms) }
const demoMeal = (rice, chk) => ({ items: [{ name: 'رز', grams: rice, value_sar: Math.round(rice * 12 / 1000), state: 'باقي' }, { name: 'دجاج', grams: chk, value_sar: Math.round(chk * 40 / 1000), state: 'باقي' }], total_value_sar: Math.round(rice * 12 / 1000 + chk * 40 / 1000), servings_left: 3, ts: Date.now() - 3 * 864e5, fridge: true, status: 'full', donated: false, demo: true });
async function runTour() {
  day('اليوم');
  note('🎬 جولة سريعة: قصة كاملة بدقيقة تقريبًا. الأزرار تنضغط تلقائيًا، وما يتم أي اتصال أو إرسال حقيقي.');
  await welcome(); await tgap(1500);
  await step(tsay('5', 5));
  await step(tpress('عربي'));
  await step(sample({ src: 's-kabsa.jpg', alt: 'plate' }));
  await step(tpress('دخل الثلاجة'));
  await step(tskip());                       // صباح اليوم التالي
  await step(tpress('تمام'));
  await step(tskip());                       // نهاية مدة الحفظ
  await step(tpress('كل ✅'));
  S.meals.unshift(demoMeal(700, 250), demoMeal(700, 250));
  note('🎬 في الجولة نضيف وجبتين تجريبيتين عشان يظهر ملخص الأسبوع');
  await step(tskip());                       // آخر الأسبوع
  await step(tpress('أرسلها للطباخ'));
  await step(tpress('عندنا عزيمة'));
  await step(tsay('25', 25));
  await step(tskip());                       // بعد العزيمة
  await step(tpress('أرسل صورة'), 900);
  closeSheet(); S.forceDonate = true;
  await step(sample({ src: 's-pots.jpg', alt: 'pots' }));
  await step(tpress('باقي في القدور'));
  await step(tpress('أقرب جمعية'));
  if (PEND && PEND.labels.some(x => x[0].includes('ساعتين'))) await step(tpress('أقل من ساعتين'));
  await step(tsay('عنيزة'));
  await step(tpress('تواصلنا'));
  await step(tskip(), 500);                  // آخر الشهر
}
async function startTour() {
  if (TOUR.on) return;
  TOUR.on = true; TOUR.stop = false; PHOTO_BUSY = false;
  closeSheet(); pop.classList.remove('on'); if (rec) stopRec(false);
  H = []; S = { size: '', lang: 'عربي', meal: null, meals: [], tour: true }; HERE = null; NEAR = []; NI = 0; PEND = null; chat.innerHTML = ''; last = '';
  tourStop.textContent = '⏹ إيقاف'; tourStop.style.display = 'flex';
  try { await runTour() } catch (e) { if (e !== STOP) { console.error(e); note('تعذّر إكمال الجولة 🙏 جرّبوا مرة ثانية من القائمة ⋮') } }
  TOUR.on = false; tourStop.style.display = 'none';
  if (TOUR.stop) note('⏹ تم إيقاف الجولة، تقدرون تكملون بأنفسكم'); else note('🎬 انتهت الجولة');
}

/* ---------- الأحداث ---------- */
function sendText() { const t = msg.value; msg.value = ''; sendB.classList.remove('on'); text(t) }
msg.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendText() } });
msg.addEventListener('input', () => { if (!rec) sendB.classList.toggle('on', msg.value.trim() !== '') });
sendB.onclick = () => { ac(); if (rec) return stopRec(true); if (msg.value.trim()) return sendText(); startRec() };
document.getElementById('recX').onclick = () => stopRec(false);
document.getElementById('att').onclick = openSheet;
document.getElementById('cam').onclick = () => document.getElementById('fCam').click();
document.getElementById('gal').onclick = () => document.getElementById('fGal').click();
document.getElementById('cam2').onclick = () => document.getElementById('fCam').click();
document.getElementById('fGal').onchange = e => pickFile(e.target);
document.getElementById('fCam').onchange = e => pickFile(e.target);
document.getElementById('emo').onclick = () => msg.focus();
shade.onclick = closeSheet;
document.getElementById('menu').onclick = e => { e.stopPropagation(); pop.classList.toggle('on') };
document.addEventListener('click', () => pop.classList.remove('on'));
document.getElementById('newChat').onclick = () => { pop.classList.remove('on'); start({ fresh: true }) };
document.getElementById('dash').onclick = () => { pop.classList.remove('on'); const u = dashUrl(); if (u) window.open(u, '_blank', 'noopener'); else dashCard() };
document.getElementById('obs').onclick = () => { pop.classList.remove('on'); window.open('/observatory' + (S.tour ? '?demo=1' : ''), '_blank', 'noopener') };
document.getElementById('tour').onclick = () => { pop.classList.remove('on'); startTour() };
buildSamples();
start();
