// Маршрут, нэвтрэлт, API, хуудас
import { initDb, all, get, run, insert, SCHEMA, MIGRATIONS } from './db.js';
import {
  layoutTree, sortMembers, buildRelations, visibleSet, bioSet, bloodLineSet, isAncestor, focusCards, focusBlood, inlawSet
} from './tree.js';
import { loginPage, appPage, notFoundPage } from './ui.js';
import { scoreMember, scoreNewPhoto, scoreNewEvent, scoresPayload, levelUpFor, markLevelSeen } from './scores.js';
import { buildXlsx } from './xlsx.js';
import { makeZip } from './zip.js';
import { SOURCE_TEXT, SOURCE_BIN } from './source_bundle.js';
import { buildFullLayout, lineage } from './fulltree.js';
import { notifyAdmins, pushPublicKey, sendPush } from './push.js';
import { genitiveName } from './genitive.js';

const RANK = { member: 1, coord: 2, admin: 3, super: 4 };
// Эзэмшигчийн утас — бүртгэгдэх/нэвтрэх бүрд автоматаар супер админ (шинэ сайт, шинэ сан дээр ч)
const OWNER_PHONES = ['88776576'];
const DESIGN_DEFAULTS = {
  theme: 'blue', card: 'round',
  link1: '#4a90d9', link2: '#e0a458', link3: '#b48bd4',
  public_slug: '', is_public: '0', tg_token: '', tg_chat: ''
};

// Зураггүй хүмүүст зориулсан 8 анхдагч дүрс — хүйс × насны бүлэг
const AVATAR_SLOTS = ['m_child','f_child','m_young','f_young','m_mid','f_mid','m_old','f_old'];

const json = (data, status = 200, headers = {}) =>
  // API хариулт КЭШЛЭГДЭХГҮЙ — нээлт/хаалт, байрлал шууд шинэчлэгдэнэ
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, must-revalidate',
      ...headers
    }
  });
const html = (s) =>
  new Response(s, { headers: {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store, must-revalidate',
    'cdn-cache-control': 'no-store'
  } });
function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// ---------- сессион ----------
async function hmacSign(msg, secret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function parseCookies(req) {
  const out = {};
  (req.headers.get('cookie') || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return out;
}
async function createSession(user, env) {
  const exp = Date.now() + 30 * 86400000;
  const payload = `${user.id}.${exp}`;
  const sig = await hmacSign(payload, env.SESSION_SECRET || 'i-family-dev-secret');
  return `ifam=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`;
}
async function sessionUser(req, env) {
  const c = parseCookies(req).ifam;
  if (!c) return null;
  const parts = c.split('.');
  if (parts.length < 3) return null;
  const uid = parts[0], exp = parts[1], sig = parts.slice(2).join('.');
  const expect = await hmacSign(`${uid}.${exp}`, env.SESSION_SECRET || 'i-family-dev-secret');
  if (sig !== expect || Number(exp) < Date.now()) return null;
  return await ensureOwnerRole(env, await get(env, 'SELECT * FROM users WHERE id=?', Number(uid)));
}
async function ensureOwnerRole(env, user) {
  if (!user) return user;
  if (!OWNER_PHONES.includes(String(user.phone || '').replace(/\D/g, ''))) return user;
  if ((RANK[user.role] || 0) >= 4) return user;
  await run(env, "UPDATE users SET role='super' WHERE id=?", user.id);
  await audit(env, user, 'role_grant', 'эзэмшигчийн утас → super');
  user.role = 'super';
  return user;
}

// ---------- дизайн / аудит ----------
async function getDesign(env) {
  const rows = await all(env, 'SELECT key, value FROM design');
  const d = { ...DESIGN_DEFAULTS };
  for (const r of rows) if (r.key in d) d[r.key] = r.value == null ? '' : String(r.value);
  return d;
}
async function setDesign(env, obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (!(k in DESIGN_DEFAULTS)) continue;
    await run(
      env,
      'INSERT INTO design(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      k, String(v == null ? '' : v)
    );
  }
}
async function audit(env, user, action, detail) {
  await run(env, 'INSERT INTO audit(user_id, action, detail) VALUES(?,?,?)',
    user ? user.id : null, action, String(detail || ''));
}

// ---------- эрх ----------
function canEdit(user, targetId, trMap) {
  if (!user) return false;
  const ar = RANK[user.role] || 1;
  if (ar >= 4) return true; // супер админ
  if (user.member_id && user.member_id === targetId) return true; // өөрийн мэдээлэлд үргэлж
  const tr = trMap.get(targetId) || 0;
  if (!user.member_id && ar < 3) return false; // картгүй жирийн хэрэглэгч мод засах эрхгүй
  return ar >= tr; // доод эрэмбэтэй хүн дээд эрэмбэтэйг засахгүй
}

async function contextOf(user, env) {
  const members = await all(env, 'SELECT * FROM members');
  const children = await all(env, 'SELECT father_id, mother_id, child_id, rel_type FROM children');
  const unions = await all(env, 'SELECT a_id, b_id FROM unions');
  const rel = buildRelations(children, unions);
  const ids = new Set(members.map(x => x.id));
  const isAdmin = !!user && (user.role === 'super' || user.role === 'admin');
  let vis, bio;
  if (isAdmin) {
    vis = new Set(ids); bio = new Set(ids);
  } else if (user && user.member_id && ids.has(user.member_id)) {
    vis = visibleSet(rel, user.member_id);
    bio = bioSet(rel, user.member_id);
  } else {
    vis = new Set(); bio = new Set();
  }
  const rankRows = await all(env, 'SELECT member_id, role FROM users WHERE member_id IS NOT NULL');
  const trMap = new Map(rankRows.map(r => [r.member_id, RANK[r.role] || 1]));
  return { members, children, unions, rel, vis, bio, isAdmin, trMap };
}

function relationsOf(ctx, id) {
  const pick = (set) => sortMembers(ctx.members.filter(m => set.has(m.id) && ctx.vis.has(m.id)))
    .map(m => ({ id: m.id, name: m.name, sex: m.sex, birth_year: m.birth_year, birth_date: m.birth_date }));
  const par = ctx.rel.par.get(id) || new Set();
  const kids = ctx.rel.kids.get(id) || new Set();
  const sp = ctx.rel.sp.get(id) || new Set();
  const sibs = new Set();
  for (const p of par) for (const k of ctx.rel.kids.get(p) || []) if (k !== id) sibs.add(k);
  return { parents: pick(par), children: pick(kids), spouses: pick(sp), siblings: pick(sibs) };
}

function sanitize(m, hasBio, editable) {
  return {
    id: m.id, name: m.name, sex: m.sex, birth_year: m.birth_year,
    birth_date: hasBio ? (m.birth_date || '') : '',
    birth_place: hasBio ? (m.birth_place || '') : '',
    clan: hasBio ? (m.clan || '') : '',
    alive: m.alive, photo: m.photo || null, emoji: m.emoji || '',
    death_date: hasBio ? (m.death_date || '') : '',
    honors: hasBio ? (m.honors || '') : '',
    bio: hasBio ? (m.bio || null) : null,
    phone: hasBio ? (m.phone || null) : null,
    e: !!editable
  };
}

async function buildState(user, env, opts = {}) {
  const ctx = await contextOf(user, env);
  let vis = ctx.vis, bio = ctx.bio;
  if (opts.publicView) {
    vis = new Set(ctx.members.map(x => x.id));
    bio = new Set();
  } else {
    const root = Number(opts.root) || 0;
    if (root && ctx.vis.has(root) && root !== (user && user.member_id)) {
      vis = new Set([...visibleSet(ctx.rel, root)].filter(id => ctx.vis.has(id)));
      bio = new Set([...bioSet(ctx.rel, root)].filter(id => ctx.bio.has(id)));
    }
  }
  // Цомгийн эхний зурагтай гишүүд — нүүр зураггүй бол түүгээр харуулна
  // member_id → цомгийн эхний зургийн id (нүүр зургийн «хувилбар» болж ажиллана)
  const albumFirst = new Map();
  try {
    const rows = await all(env, 'SELECT member_id, MIN(id) AS pid FROM member_photos GROUP BY member_id');
    for (const r of rows) albumFirst.set(Number(r.member_id), Number(r.pid) || 0);
  } catch (e) { /* member_photos хүснэгт хоосон үед алгасна */ }
  // Зургийн URL-ийн хувилбар (?v=): зураг солигдмогц линк өөрчлөгдөж, браузерын
  // кэш (1 өдөр) хуучин зургийг гацаахгүй. Жижиг хэш — бүтэн base64-ыг уншихгүй.
  function photoVer(raw, albumPid) {
    const s = String(raw || '');
    if (!s) return 'a' + (albumPid || 0);
    const t = s.length > 220 ? s.slice(0, 110) + '|' + s.slice(-110) + '|' + s.length : s;
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return 'p' + h.toString(36);
  }
  const members = ctx.members.filter(m => vis.has(m.id)).map(m => {
    const x = sanitize(m, ctx.isAdmin || bio.has(m.id), !opts.publicView && canEdit(user, m.id, ctx.trMap));
    // Зурагтай (base64) гишүүдийн зургийг үндсэн state-д БҮТНЭЭР хийхгүй —
    // 5 зураг л 650KB болж, мод ачаалахад удаан болдог. Карт нь тусад нь
    // /api/members/:id/photo-оос lazy авна. Профайлд бүтэн зураг хэвээр.
    // DB-д «lazy» линк хадгалагдсан бол (хуучин бичлэг) эвдэрсэн зураг гарахаас сэргийлж
    // цомгийн эхний зураг руу шилжүүлнэ
    const storedLazy = /^\/api\/members\/\d+\/photo$/i.test(String(m.photo || ''));
    const lazyUrl = '/api/members/' + m.id + '/photo?v=' +
      photoVer(storedLazy ? '' : m.photo, albumFirst.get(m.id));
    if (!x.photo || storedLazy) {
      x.photo = albumFirst.has(m.id) ? lazyUrl : null;
    } else if (!opts.publicView && /^data:image\//i.test(String(m.photo || ''))) {
      x.photo = lazyUrl;
    }
    // Нүүр зураг байхгүй ч цомогт зурагтай бол эхний зургийг нүүр болгож харуулна
    if (!x.photo && albumFirst.has(m.id)) x.photo = lazyUrl;
    return x;
  });
  const links = [];
  for (const c of ctx.children) {
    if (!vis.has(c.child_id)) continue;
    if (c.father_id && vis.has(c.father_id)) links.push({ t: 'c', p: c.father_id, c: c.child_id, r: 'F', rel: c.rel_type });
    if (c.mother_id && vis.has(c.mother_id)) links.push({ t: 'c', p: c.mother_id, c: c.child_id, r: 'M', rel: c.rel_type });
  }
  for (const u of ctx.unions) {
    if (vis.has(u.a_id) && vis.has(u.b_id)) links.push({ t: 's', a: u.a_id, b: u.b_id });
  }
  const visMembers = ctx.members.filter(m => vis.has(m.id));
  const layout = layoutTree({ members: visMembers, children: ctx.children, unions: ctx.unions });
  const design = await getDesign(env);
  const isAdmin = ctx.isAdmin;
  let pending_req = null;
  if (user && !user.member_id) {
    const pr = await get(env, `SELECT r.id, r.member_id, r.created_at, m.name AS card_name
      FROM link_requests r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.id DESC LIMIT 1`, user.id);
    pending_req = pr || null;
  }
  return {
    viewer: user
      ? { id: user.id, name: user.name, role: user.role, member_id: user.member_id || null }
      : null,
    awaiting: !!user && !isAdmin && !user.member_id,
    pending_req,
    root: (opts.publicView ? null : (Number(opts.root) || (user && user.member_id) || null)),
    can_root_switch: !opts.publicView && !!user && (isAdmin || !!user.member_id),
    members, links, layout,
    design: {
      theme: design.theme, card: design.card,
      link1: design.link1, link2: design.link2, link3: design.link3,
      public_slug: design.public_slug, is_public: design.is_public,
      tg_set: !!design.tg_token, tg_chat: design.tg_chat
    },
    publicView: !!opts.publicView
  };
}

// ---------- OTP / нэвтрэлт ----------
async function sendTelegram(token, chat, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text })
    });
    return r.ok;
  } catch { return false; }
}

// ---------- нууц үг (PBKDF2) + нэг удаагийн код ----------
const b64enc = (buf) => btoa(String.fromCharCode(...buf));
const b64dec = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: b64dec(salt), iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  return b64enc(new Uint8Array(bits));
}
function newSalt() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b64enc(b);
}
function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
async function issueOtp(env, phone, code, via, ttlMs) {
  await run(
    env,
    `INSERT INTO otps(phone, code, expires, via) VALUES(?,?,?,?)
     ON CONFLICT(phone) DO UPDATE SET code=excluded.code, expires=excluded.expires, via=excluded.via`,
    phone, code, Date.now() + ttlMs, via
  );
}
function userPayload(u) {
  return { id: u.id, name: u.name, role: u.role, member_id: u.member_id || null };
}

// Бүртгүүлэх: утас + нэр + нууц үг + давталт
async function handleRegister(req, env) {
  const b = await readBody(req);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const name = String(b.name || '').trim();
  const pw = String(b.password || '');
  const pw2 = String(b.confirm || '');
  if (phone.length < 6) throw httpErr(400, 'Утасны дугаар буруу байна');
  if (!name) throw httpErr(400, 'Нэр шаардлагатай');
  if (pw.length < 4) throw httpErr(400, 'Нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой');
  if (pw !== pw2) throw httpErr(400, 'Нууц үг таарахгүй байна');
  const exists = await get(env, 'SELECT * FROM users WHERE phone=?', phone);
  if (exists) throw httpErr(400, 'Энэ дугаараар бүртгэл аль хэдийн байна — «Нэвтрэх» хэсгээс нэвтрэнэ үү');
  const cnt = await get(env, 'SELECT COUNT(*) AS c FROM users');
  const role = (cnt && cnt.c === 0) || OWNER_PHONES.includes(phone) ? 'super' : 'member'; // анхны бүртгэл эсвэл эзэмшигчийн утас = Супер Админ
  const salt = newSalt();
  const pwHash = await hashPassword(pw, salt);
  await insert(env, 'INSERT INTO users(phone, name, role, password, salt) VALUES(?,?,?,?,?)',
    phone, name, role, pwHash, salt);
  let u = await get(env, 'SELECT * FROM users WHERE phone=?', phone);
  if (!u.member_id) {
    const mem = await get(env, 'SELECT * FROM members WHERE phone=? LIMIT 1', phone);
    if (mem) {
      await run(env, 'UPDATE users SET member_id=? WHERE id=?', mem.id, u.id);
      u.member_id = mem.id;
    }
  }
  await audit(env, u, 'register', `${phone.slice(0, 4)}****`);
  // Шинэ бүртгэл → админы утсанд мэдэгдэл (push тохируулсан бол)
  try { await notifyAdmins(env, '🆕 Шинэ бүртгэл', `${name} (${phone}) бүртгүүллээ`); } catch (e) {}
  return json({ ok: true, user: userPayload(u) },
    200, { 'set-cookie': await createSession(u, env) });
}

// Нэвтрэх: утас + нууц үг; хуучин бүртгэл/мартсан нууц үг = нэг удаагийн код
async function handleLogin(req, env) {
  const b = await readBody(req);
  const phone = String(b.phone || '').replace(/\D/g, '');
  const u = await get(env, 'SELECT * FROM users WHERE phone=?', phone);
  if (!u) throw httpErr(400, 'Энэ дугаараар бүртгэл байхгүй байна — «Бүртгүүлэх» хэсгээс бүртгүүлнэ үү');
  await ensureOwnerRole(env, u);

  // ① Нэг удаагийн код + шинэ нууц үг
  if (b.code && b.new_password) {
    const otp = await get(env, 'SELECT * FROM otps WHERE phone=?', phone);
    if (!otp || otp.code !== String(b.code).trim() || otp.expires < Date.now()) {
      throw httpErr(400, 'Нэг удаагийн код буруу эсвэл хугацаа дууссан');
    }
    const np = String(b.new_password);
    if (np.length < 4) throw httpErr(400, 'Шинэ нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой');
    const salt = newSalt();
    await run(env, 'UPDATE users SET password=?, salt=? WHERE id=?',
      await hashPassword(np, salt), salt, u.id);
    await run(env, 'DELETE FROM otps WHERE phone=?', phone);
    await audit(env, u, 'password_set', 'нэг удаагийн кодоор');
    return json({ ok: true, user: userPayload(u) },
      200, { 'set-cookie': await createSession(u, env) });
  }

  // ② Нууц үггүй хуучин бүртгэл — нэг удаагийн кодоор шинэ нууц үг тогтооно
  if (!u.password || !u.salt) {
    const code = makeCode();
    await issueOtp(env, phone, code, 'auto', 5 * 60000);
    const d = await getDesign(env);
    let sent = false;
    if (d.tg_token && d.tg_chat) {
      sent = await sendTelegram(d.tg_token, d.tg_chat, `🌳 iFamily нэг удаагийн код: ${code}`);
    }
    return json({ need_otp: true, dev: sent ? null : code });
  }

  // ③ Нууц үг хэвийн шалгалт
  if (b.password && (await hashPassword(String(b.password), u.salt)) === u.password) {
    await audit(env, u, 'login', `${phone.slice(0, 4)}****${phone.slice(-2)}`);
    return json({ ok: true, user: userPayload(u) },
      200, { 'set-cookie': await createSession(u, env) });
  }

  // ④ Буруу нууц үг, гэвч админ өгсөн код байвал нэг удаагийн кодоор солих боломжтой
  const adminOtp = await get(env, "SELECT * FROM otps WHERE phone=? AND via='admin'", phone);
  if (adminOtp && adminOtp.expires >= Date.now()) return json({ need_otp: true, dev: null });
  throw httpErr(400, 'Нууц үг буруу байна');
}

// ---------- гишүүн нэмэх/засах ----------
function normSex(s) {
  s = String(s || '').trim().toLowerCase();
  if (['m', 'м', 'эр', 'эрэгтэй', 'male'].includes(s)) return 'm';
  if (['f', 'ф', 'ж', 'эм', 'эмэгтэй', 'female'].includes(s)) return 'f';
  return '?';
}
function normDeath(s) {
  s = String(s || '').trim();
  return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : '';
}
function normEmoji(s) {
  s = String(s || '').trim();
  return [...s].length <= 8 ? s : '';
}
// /api/members/<id>/photo — энэ бол lazy линк (мод хөнгөн ачаалахын тулд state-д түр
// тавьдаг). Үүнийг DB-д зураг болгож ХАДГАЛЖ БОЛОХГҮЙ — эс бөгөөс нүүр зураг өөртөө
// заасан линк болж, карт дээр эвдэрсэн зураг гардаг.
const LAZY_PHOTO_RE = /^\/api\/members\/\d+\/photo$/i;
function normPhoto(s) {
  s = String(s || '').trim();
  if (!s) return '';
  if (LAZY_PHOTO_RE.test(s)) return '';
  if (/^(https?:\/\/|\/)/i.test(s)) return s.slice(0, 500);
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(s) && s.length <= 600000) return s;
  throw httpErr(400, 'Зураг хүчингүй эсвэл хэт том (линк эсвэл жижиг зураг байх ёстой)');
}
async function createMember(env, user, b) {
  const name = String(b.name || '').trim();
  if (!name) throw httpErr(400, 'Нэр шаардлагатай');
  const id = await insert(
    env,
    `INSERT INTO members(name, sex, birth_year, birth_date, birth_place, clan, alive, phone, bio, honors, photo, death_date, emoji, created_by)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    name, normSex(b.sex),
    String(b.birth_year || '').trim() || String(b.birth_date || '').trim().slice(0, 4),
    String(b.birth_date || '').trim(),
    String(b.birth_place || '').trim(), String(b.clan || '').trim(),
    (b.alive === false || b.alive === 0 || b.alive === '0') ? 0 : 1,
    String(b.phone || '').trim(), String(b.bio || '').trim(),
    String(b.honors || '').trim().slice(0, 2000), normPhoto(b.photo),
    normDeath(b.death_date), normEmoji(b.emoji),
    user.member_id || user.id
  );
  if (b.father_id || b.mother_id) {
    await insert(env, 'INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)',
      b.father_id ? Number(b.father_id) : null,
      b.mother_id ? Number(b.mother_id) : null,
      id, String(b.rel_type || 'Төрсөн'));
  }
  if (b.spouse_id) {
    await insert(env, 'INSERT INTO unions(a_id, b_id) VALUES(?,?)', Number(b.spouse_id), id);
  }
  // Оноо①: шинэ гишүүний дүүрсэн талбаруудыг анх оруулсан хэрэглэгчид бүртгэнэ
  const freshC = await get(env, 'SELECT * FROM members WHERE id=?', id);
  const gotC = await scoreMember(env, user, id, null, freshC);
  await audit(env, user, 'create_member', `${name} (#${id})`);
  return { id, points: gotC.reduce((s, x) => s + x.points, 0) };
}

// Формын «Холбоотой хүн» талбар: модонд АЛЬ ХЭДИЙН байгаа хүнтэй холбооно.
// Шинэ карт үүсгэхгүй; байршлыг layout автоматаар тогтооно:
// аав/ээж — дээр, хүү/охин — доор, хань — хажууд, ах/эгч/дүү — адилхан эцэг эхтэй тул хажууд.
async function applyRel(env, user, ctx, selfId, selfSex, as, rawOtherId) {
  const otherId = Number(rawOtherId);
  if (!as || !otherId || otherId === selfId) return;
  const other = ctx.members.find(x => x.id === otherId);
  if (!other || !ctx.vis.has(otherId)) throw httpErr(404, 'Сонгосон хүн олдохгүй');
  if (as === 'father' || as === 'mother') {
    if (isAncestor(ctx.rel, selfId, otherId)) {
      throw httpErr(400, 'Цикл үүсэхгүй: хүүхдээ эцэг/эх болгож болохгүй');
    }
    const rows = await all(env, 'SELECT * FROM children WHERE child_id=?', selfId);
    if (rows.some(r => as === 'father' ? r.father_id === otherId : r.mother_id === otherId)) {
      throw httpErr(400, 'Аль хэдийн энэ хүнээр холбогдсон');
    }
    await insert(env, 'INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)',
      as === 'father' ? otherId : null, as === 'mother' ? otherId : null, selfId, 'Төрсөн');
    await audit(env, user, 'link', `${other.name} → #${selfId} (${as === 'father' ? 'эцэг' : 'эх'})`);
  } else if (as === 'child') {
    if (!canEdit(user, otherId, ctx.trMap)) throw httpErr(403, 'Эрхгүй');
    if (isAncestor(ctx.rel, otherId, selfId)) {
      throw httpErr(400, 'Цикл үүсэхгүй: өөрийн удмын хүнийг хүүхдээ болгож болохгүй');
    }
    const slot = selfSex === 'f' ? 'mother' : 'father';
    const rows = await all(env, 'SELECT * FROM children WHERE child_id=?', otherId);
    if (rows.some(r => slot === 'father' ? r.father_id === selfId : r.mother_id === selfId)) {
      throw httpErr(400, 'Аль хэдийн холбогдсон');
    }
    const empty = rows.find(r => slot === 'father' ? !r.father_id : !r.mother_id);
    if (empty) {
      await run(env, `UPDATE children SET ${slot}=? WHERE id=?`, selfId, empty.id);
    } else {
      await insert(env, 'INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)',
        slot === 'father' ? selfId : null, slot === 'mother' ? selfId : null, otherId, 'Төрсөн');
    }
    await audit(env, user, 'link', `#${selfId} → ${other.name} (хүүхэд)`);
  } else if (as === 'spouse') {
    const dup = await get(env, 'SELECT * FROM unions WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)',
      selfId, otherId, otherId, selfId);
    if (dup) throw httpErr(400, 'Аль хэдийн холбогдсон');
    await insert(env, 'INSERT INTO unions(a_id, b_id) VALUES(?,?)', selfId, otherId);
    await audit(env, user, 'link', `#${selfId} ⇄ ${other.name} (хань)`);
  } else if (as === 'sibling') {
    const prows = await all(env, 'SELECT * FROM children WHERE child_id=?', otherId);
    if (!prows.length) throw httpErr(400, 'Сонгосон хүний эцэг/эх бүртгэлгүй');
    const mine = await all(env, 'SELECT * FROM children WHERE child_id=?', selfId);
    if (mine.length) throw httpErr(400, 'Аль хэдийн эцэг/эхтэй — ах/дүүгээр холбож болохгүй');
    for (const r of prows) {
      await insert(env, 'INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)',
        r.father_id || null, r.mother_id || null, selfId, r.rel_type || 'Төрсөн');
    }
    await audit(env, user, 'link', `${other.name} ⇄ #${selfId} (ах/эгч/дүү)`);
  } else {
    throw httpErr(400, 'Буруу харилцааны төрөл');
  }
}

async function handleImport(env, user, rows) {
  let created = 0, linked = 0;
  const findOrCreate = async (name, sex) => {
    const found = await all(env, 'SELECT * FROM members WHERE name COLLATE NOCASE = ?', name);
    if (found.length) return (found.find(r => r.sex === sex) || found[0]).id;
    const nid = await insert(env, 'INSERT INTO members(name, sex, created_by) VALUES(?,?,?)', name, sex, user.id);
    await scoreMember(env, user, nid, null, await get(env, 'SELECT * FROM members WHERE id=?', nid));
    return nid;
  };
  const list = (rows || []).filter(r => Array.isArray(r) && r.some(c => String(c == null ? '' : c).trim()));
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  let cols = null;
  if (list.length) {
    const first = list[0].map(norm);
    if (first.some(c => c.startsWith('нэр')) && first.some(c => c.includes('хүйс'))) {
      cols = {};
      first.forEach((h, i) => {
        if (!h) return;
        if (h.startsWith('нэр')) cols.name = i;
        else if (h.includes('хүйс')) cols.sex = i;
        else if (h.includes('нас барсан')) cols.death = i;
        else if (h.includes('огноо') || h.includes('өдөр')) cols.date = i;
        else if (h.includes('овог')) cols.clan = i;
        else if (h.includes('он')) cols.year = i;
        else if (h.includes('газар')) cols.place = i;
        else if (h.includes('утас')) cols.phone = i;
        else if (h.includes('гавьяа')) cols.honors = i;
        else if (h.includes('намтар')) cols.bio = i;
        else if (h.includes('аав')) cols.father = i;
        else if (h.includes('ээж')) cols.mother = i;
      });
      list.shift();
    }
  }
  const cell = (r, key) => (cols && cols[key] != null
    ? String(r[cols[key]] == null ? '' : r[cols[key]]).trim() : '');
  const v = (r, i) => String((r && r[i]) == null ? '' : (r && r[i])).trim();
  for (const r of list) {
    let name, sex, year, date, death, clan, place, phone, honors, bio, fatherName, motherName;
    if (cols) {
      name = cell(r, 'name'); sex = cell(r, 'sex'); year = cell(r, 'year'); date = cell(r, 'date');
      death = cell(r, 'death'); clan = cell(r, 'clan'); place = cell(r, 'place');
      phone = cell(r, 'phone'); honors = cell(r, 'honors'); bio = cell(r, 'bio');
      fatherName = cell(r, 'father'); motherName = cell(r, 'mother');
    } else if (r.length >= 10) {
      // толгой мөргүй шинэ загвар: Нэр, Хүйс, Төрсөн он, Төрсөн огноо, Нас барсан,
      // Ургийн овог, Газар, Утас, Гавьяа, Намтар (+ 11/12: Аавын нэр, Ээжийн нэр)
      name = v(r, 0); sex = v(r, 1); year = v(r, 2); date = v(r, 3); death = v(r, 4);
      clan = v(r, 5); place = v(r, 6); phone = v(r, 7); honors = v(r, 8); bio = v(r, 9);
      fatherName = v(r, 10); motherName = v(r, 11);
    } else {
      // хуучин загвар: Нэр, Хүйс, Төрсөн он, Овог, Аавын нэр, Ээжийн нэр
      name = v(r, 0); sex = v(r, 1); year = v(r, 2); clan = v(r, 3);
      fatherName = v(r, 4); motherName = v(r, 5);
      date = ''; death = ''; place = ''; phone = ''; honors = ''; bio = '';
    }
    if (!name) continue;
    death = normDeath(death);
    const id = await insert(
      env,
      `INSERT INTO members(name, sex, birth_year, birth_date, birth_place, clan, alive, phone, bio, honors, death_date, created_by)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      name, normSex(sex), year || date.slice(0, 4), date, place, clan,
      death ? 0 : 1, phone, bio, honors, death, user.id
    );
    await scoreMember(env, user, id, null, await get(env, 'SELECT * FROM members WHERE id=?', id));
    created++;
    const father_id = fatherName ? await findOrCreate(fatherName, 'm') : null;
    const mother_id = motherName ? await findOrCreate(motherName, 'f') : null;
    if (father_id || mother_id) {
      await insert(env, 'INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)',
        father_id, mother_id, id, 'Төрсөн');
      linked++;
    }
  }
  await audit(env, user, 'import', `нэмсэн: ${created}, холбосон: ${linked}`);
  return { created, linked };
}

// ---------- сануулга ----------
// ---------- Улсын баяр, тэмдэглэлт өдөр (жил бүр тогтмол — хуулиар тогтоосон) ----------
const HOLIDAYS = [
  { md: '01-01', name: 'Шинэ жил', icon: '🇲🇳' },
  { md: '03-08', name: 'Олон улсын эмэгтэйчүүдийн эрхийг хамгаалах өдөр', icon: '🇲🇳' },
  { md: '03-18', name: 'Цэргийн баяр / Эрчүүдийн өдөр', icon: '🇲🇳' },
  { md: '06-01', name: 'Эх үрсийн баяр', icon: '🇲🇳' },
  { md: '07-11', name: 'Үндэсний их баяр наадам — 1-р өдөр', icon: '🇲🇳' },
  { md: '07-12', name: 'Үндэсний их баяр наадам — 2-р өдөр', icon: '🇲🇳' },
  { md: '07-13', name: 'Үндэсний их баяр наадам — 3-р өдөр', icon: '🇲🇳' },
  { md: '07-14', name: 'Үндэсний их баяр наадам — 4-р өдөр', icon: '🇲🇳' },
  { md: '07-15', name: 'Үндэсний их баяр наадам — 5-р өдөр', icon: '🇲🇳' },
  { md: '11-26', name: 'Улс тунхагласны өдөр', icon: '🇲🇳' },
  { md: '12-29', name: 'Үндэсний эрх чөлөө, тусгаар тогтнолоо сэргээн мандуулсны өдөр', icon: '🇲🇳' }
];

// Билгийн тооллын баярууд: жил бүр өөр өдөр оногддог тул ЖИЛ БҮР ГАРААР шинэчилнэ үү.
// (Монголын Засгийн газрын жил бүрийн тогтоолоор батлагддаг; доорх урьдчилсан тооцоо.)
const LUNAR_EVENTS = {
  2026: [{ d: '2026-02-18', n: 'Цагаан сар (шинийн 1)' }, { d: '2026-05-31', n: 'Бурхан багшийн дүйчин өдөр' }],
  2027: [{ d: '2027-02-07', n: 'Цагаан сар (шинийн 1)' }, { d: '2027-05-20', n: 'Бурхан багшийн дүйчин өдөр' }],
  2028: [{ d: '2028-02-26', n: 'Цагаан сар (шинийн 1)' }, { d: '2028-06-07', n: 'Бурхан багшийн дүйчин өдөр' }],
  2029: [{ d: '2029-02-14', n: 'Цагаан сар (шинийн 1)' }],
  2030: [{ d: '2030-02-03', n: 'Цагаан сар (шинийн 1)' }],
  2031: [{ d: '2031-02-22', n: 'Цагаан сар (шинийн 1)' }]
};


async function remindersFor(ctx, page, past, limit) {
  // past=false → удахгүй болох (өнөөдрөөс хойш); past=true → сүүлийн 365 хоногт болж өнгөрсөн
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const y = now.getFullYear();
  const daysTo = t => Math.round((t - today) / 86400000);
  // ① Хүний төрсөн өдөр (нас барсан болон «зөвхөн төрсөн он» орохгүй)
  const nameOf = new Map(ctx.members.map(m => [m.id, m.name]));
  const sexOf = new Map(ctx.members.map(m => [m.id, m.sex]));
  const fatherNameOf = id => {
    const pars = [...(ctx.rel.par.get(id) || [])];
    const dad = pars.find(p => sexOf.get(p) === 'm') || pars[0];
    return dad ? (nameOf.get(dad) || '') : '';
  };
  const bdays = ctx.members
    .filter(x => ctx.vis.has(x.id) && x.alive === 1 && x.birth_date && x.birth_date.length >= 10)
    .map(x => {
      const key = x.birth_date.slice(5, 10);
      let t = new Date(y, Number(key.slice(0, 2)) - 1, Number(key.slice(3, 5)));
      // Удахгүй болох: өнөөдрөөс өмнө бол жилийг +1; өнгөрсөн: өнөөдрөөс хойш бол -1
      if (!past && t < today) t = new Date(y + 1, Number(key.slice(0, 2)) - 1, Number(key.slice(3, 5)));
      if (past && t > today) t = new Date(y - 1, Number(key.slice(0, 2)) - 1, Number(key.slice(3, 5)));
      // Аавын нэр (эцгийн нэр) хамт илгээнэ — сануулгад «аавын нэр + нэр».
      // Аав нь бүртгэгдээгүй бол pat хоосон, зөвхөн нэр харагдана.
      const dad = fatherNameOf(x.id);
      // Нас: тухайн төрсөн өдөр тохиох ЖИЛ − төрсөн он (жишээ: 2006-11-17 → 2026 онд 20)
      const bYear = Number(x.birth_date.slice(0, 4));
      const age = Number.isFinite(bYear) && bYear > 0 ? (t.getFullYear() - bYear) : null;
      return { kind: 'b', id: x.id, name: x.name, clan: x.clan || '', father: dad, pat: dad ? genitiveName(dad) : '', birth_date: x.birth_date, date: x.birth_date.slice(0, 10), days: daysTo(t), key, age };
    });
  // ② Улсын баяр (тогтмол MM-DD) + билгийн тооллын баяр (жил бүр гар аргаар шинэчилнэ)
  const evts = [];
  for (const h of HOLIDAYS) {
    let t = new Date(y, Number(h.md.slice(0, 2)) - 1, Number(h.md.slice(3, 5)));
    if (!past && t < today) t = new Date(y + 1, Number(h.md.slice(0, 2)) - 1, Number(h.md.slice(3, 5)));
    if (past && t > today) t = new Date(y - 1, Number(h.md.slice(0, 2)) - 1, Number(h.md.slice(3, 5)));
    evts.push({
      kind: 'h', name: h.name, icon: h.icon, days: daysTo(t),
      date: `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    });
  }
  for (const yy of (past ? [y - 1, y] : [y, y + 1])) {
    for (const e of (LUNAR_EVENTS[yy] || [])) {
      const t = new Date(Number(e.d.slice(0, 4)), Number(e.d.slice(5, 7)) - 1, Number(e.d.slice(8, 10)));
      const d = daysTo(t);
      if (past ? d > 0 : d < 0) continue;
      evts.push({ kind: 'h', name: e.n, icon: '🌙', date: e.d, days: d });
    }
  }
  // ③ Нэгдсэн эрэмбэ: хоногийн тоогоор; тэнцүү бол төрсөн өдөр нь эхэндээ
  // Удахгүй болох: ойрхон нь эхэндээ (өсөх). Өнгөрсөн: хамгийн САЯХАН болсон нь
  // эхэндээ (буурах: -1 хоног нь -15 хоногоос дээр).
  const items = [...bdays, ...evts]
    .filter(x => (past ? x.days < 0 : x.days >= 0))
    .sort((a, b) => (past ? b.days - a.days : a.days - b.days) ||
      (a.kind === b.kind ? a.name.localeCompare(b.name, 'mn') : (a.kind === 'b' ? -1 : 1)));
  // size: сануулгын цонх гүйлгэдэг жагсаалт болсон тул бүх мэдээллийг нэг дор өгч болно
  const size = Math.min(500, Math.max(1, Number(limit) || 5));
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page || 1), pages);
  return { total: items.length, page: p, pages, today: todayKey, past: !!past, items: items.slice((p - 1) * size, p * size) };
}

// ---------- цомог ----------
async function albumAccess(user, album) {
  if (!user) return false;
  if (user.role === 'super' || user.role === 'admin') return true;
  if (!user.member_id) return false;
  if (album.owner_id === user.member_id) return true;
  if (album.visibility === 'all') return true;
  if (album.visibility === 'private') return false;
  try { return (JSON.parse(album.members || '[]')).includes(user.member_id); } catch { return false; }
}

// ---------- оролт ----------
function xlsxBytes(ctx) {
    const nameOf = new Map(ctx.members.map(m => [m.id, m.name]));
    const nm = (x) => nameOf.get(x) || String(x);
    const fatherOf = new Map(), motherOf = new Map();
    for (const c of ctx.children) {
      if (c.father_id) fatherOf.set(c.child_id, [...(fatherOf.get(c.child_id) || []), c.father_id]);
      if (c.mother_id) motherOf.set(c.child_id, [...(motherOf.get(c.child_id) || []), c.mother_id]);
    }
    const rows = ctx.members.slice().sort((a, b) => a.id - b.id).map((m, i) => [
      i + 1, m.id, m.name || "",
      m.sex === "m" ? "Эрэгтэй" : m.sex === "f" ? "Эмэгтэй" : "Тодорхойгүй",
      m.birth_year || "", m.birth_date || "", m.birth_place || "", m.clan || "",
      m.alive === 0 ? "Үгүй" : "Тийм", m.death_date || "", m.phone || "",
      m.honors || "", m.bio || "",
      (fatherOf.get(m.id) || []).map(nm).join(", "),
      (motherOf.get(m.id) || []).map(nm).join(", "),
      [...(ctx.rel.sp.get(m.id) || [])].map(nm).join(", "),
      new Set(ctx.rel.kids.get(m.id) || []).size,
      [...(ctx.rel.kids.get(m.id) || [])].map(nm).join(", "),
      m.created_at || ""
    ]);
    const bytes = buildXlsx({
      sheet: "Гишүүд",
      columns: [
        { title: "№", width: 6 }, { title: "ID", width: 6 }, { title: "Нэр", width: 26 },
        { title: "Хүйс", width: 12 }, { title: "Төрсөн он", width: 10 },
        { title: "Төрсөн огноо", width: 14 }, { title: "Төрсөн газар", width: 18 },
        { title: "Овог / ургийн нэр", width: 18 }, { title: "Амьд", width: 8 },
        { title: "Нас барсан огноо", width: 14 }, { title: "Утас", width: 14 },
        { title: "Гавьяа шагнал", width: 22 }, { title: "Танилцуулга", width: 40 },
        { title: "Эцэг", width: 22 }, { title: "Эх", width: 22 },
        { title: "Нөхөр / эхнэр", width: 24 }, { title: "Хүүхдийн тоо", width: 11 },
        { title: "Хүүхдүүд", width: 50 }, { title: "Бүртгэсэн огноо", width: 18 }
      ],
      rows
    });
  return bytes;
}

async function backupData(env) {
    const data = {
      app: 'iFamily',
      format: 'i-family-backup-v1',
      exported_at: new Date().toISOString(),
      // SELECT * шинэ багана нэмэгдэх бүрт автомат багтана
      members: await all(env, 'SELECT * FROM members'),
      children: await all(env, 'SELECT * FROM children'),
      unions: await all(env, 'SELECT * FROM unions'),
      // password/salt — PBKDF2 хэш (нээлттэй нууц үг БИШ). Зөвхөн супер
      // админы backup-т орно; ингэснээр шилжилт хийхэд хүмүүсийн нэвтрэлт хэвээр.
      users: await all(env, 'SELECT id, phone, name, role, member_id, created_at, password, salt FROM users'),
      design: await all(env, 'SELECT * FROM design'),
      albums: await all(env, 'SELECT * FROM albums'),
      album_photos: await all(env, 'SELECT * FROM album_photos'),
      audit: await all(env, 'SELECT * FROM audit'),
      link_requests: await all(env, 'SELECT * FROM link_requests'),
      field_scores: await all(env, 'SELECT * FROM field_scores'),
      member_photos: await all(env, 'SELECT * FROM member_photos'),
      member_events: await all(env, 'SELECT * FROM member_events'),
      default_avatars: await all(env, 'SELECT * FROM default_avatars'),
      photo_comments: await all(env, 'SELECT * FROM photo_comments'),
      push_subs: await all(env, 'SELECT * FROM push_subs'),
      layout_locks: await all(env, 'SELECT * FROM layout_locks'),
      score_ranks: await all(env, 'SELECT * FROM score_ranks')
    };
    data.counts = {
      members: data.members.length, children: data.children.length, unions: data.unions.length,
      users: data.users.length, design: data.design.length, albums: data.albums.length,
      photos: data.album_photos.length, audit: data.audit.length,
      link_requests: data.link_requests.length,
      field_scores: data.field_scores.length,
      member_photos: data.member_photos.length,
      member_events: data.member_events.length,
      default_avatars: data.default_avatars.length,
      photo_comments: data.photo_comments.length,
      push_subs: data.push_subs.length,
      layout_locks: data.layout_locks.length,
      score_ranks: data.score_ranks.length
    };
  return data;
}

export async function handle(req, env) {
  await initDb(env);
  const url = new URL(req.url);
  const path = url.pathname;
  try {
    if (path.startsWith('/api/')) return await api(req, env, url, path);
    // Удам модны тусдаа хуудас: Cloudflare static assets .html-ийг /udam руу
    // redirect хийдэг тул extensionless замыг өөрөө үйлчилнэ.
    if ((path === '/udam' || path === '/udam/') && req.method === 'GET' && env.ASSETS) {
      const a = await env.ASSETS.fetch(new Request(new URL('/udam', req.url), req));
      if (a.status === 200) {
        const h = new Headers(a.headers);
        h.set('content-type', 'text/html; charset=utf-8');
        h.set('cache-control', 'no-store, must-revalidate');
        h.set('cdn-cache-control', 'no-store');
        return new Response(a.body, { status: 200, headers: h });
      }
    }
    // public/ дахь статик файлууд (PWA, клиент JS, icon, зурхайн хуудас)
    if (env.ASSETS && req.method !== 'POST' && /\.(js|mjs|png|jpg|svg|ico|webmanifest|css|html|json|txt)$/.test(path)) {
      const a = await env.ASSETS.fetch(req);
      if (a.status !== 404) {
        // Клиент JS ба service worker-ийг КЭШЛЭХГҮЙ — шинэ deploy хийсний
        // дараа утсан дээр хуучин код үлдэж, өөрчлөлт «ороогүй» харагддаг байв.
        if (/\.(js|mjs)$/.test(path)) {
          const h = new Headers(a.headers);
          h.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
          h.set('cdn-cache-control', 'no-store');
          h.delete('etag');
          return new Response(a.body, { status: a.status, statusText: a.statusText, headers: h });
        }
        return a;
      }
    }

    const design = await getDesign(env);
    const user = await sessionUser(req, env);
    if (path.startsWith('/p/')) {
      const slug = decodeURIComponent(path.slice(3));
      if (design.is_public !== '1' || !design.public_slug || design.public_slug !== slug) {
        return new Response(notFoundPage(), {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' }
        });
      }
      const state = await buildState(null, env, { publicView: true });
      return html(appPage({ state, theme: design.theme, card: design.card }));
    }
    if (!user) return html(loginPage({ theme: design.theme, devOtp: !design.tg_token }));
    const state = await buildState(user, env, { root: Number(url.searchParams.get('root')) || 0 });
    return html(appPage({ state, theme: design.theme, card: design.card }));
  } catch (e) {
    if (e && e.status) return json({ error: e.message }, e.status);
    return json({ error: String((e && e.message) || e) }, 500);
  }
}

async function api(req, env, url, path) {
  const method = req.method;
  const user = await sessionUser(req, env);
  const need = () => { if (!user) throw httpErr(401, 'Нэвтрээгүй байна'); return user; };
  const needAdmin = () => {
    need();
    if (user.role !== 'super' && user.role !== 'admin') throw httpErr(403, 'Эрх хүрэлцэхгүй байна');
    return user;
  };
  const needSuper = () => {
    need();
    if (user.role !== 'super') throw httpErr(403, 'Зөвхөн супер админ');
    return user;
  };

  // --- нэвтрэлт ---
  if (path === '/api/register' && method === 'POST') return handleRegister(req, env);
  if (path === '/api/login' && method === 'POST') return handleLogin(req, env);
  if (path === '/api/logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': 'ifam=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }

  // --- хувийн профайл (миний профайл) ---
  if (path === '/api/me' && method === 'GET') {
    need();
    const mem = user.member_id
      ? await get(env, 'SELECT id, name FROM members WHERE id=?', user.member_id) : null;
    const pr = await get(env, `SELECT r.id, r.member_id, r.created_at, r.status, m.name AS card_name
      FROM link_requests r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.id DESC LIMIT 1`, user.id);
    return json({
      id: user.id, name: user.name, phone: user.phone, role: user.role,
      member_id: user.member_id || null,
      member_name: mem ? mem.name : null,
      pending: pr || null,
      has_password: !!(user.password && user.salt)
    });
  }
  // «Холболт хүлээж буй» дэлгэцээс 5 секунд тутам дуудах хөнгөн статус.
  // Бүтэн мод/layout-д хүрэхгүй — зөвхөн холбогдсон эсэх ба хүлээгдэж буй хүсэлт.
  if (path === '/api/my-status' && method === 'GET') {
    need();
    const mem = user.member_id
      ? await get(env, 'SELECT id, name FROM members WHERE id=?', user.member_id) : null;
    const pr = await get(env, `SELECT r.id, r.member_id, r.created_at, m.name AS card_name
      FROM link_requests r LEFT JOIN members m ON m.id = r.member_id
      WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.id DESC LIMIT 1`, user.id);
    const isAdm = user.role === 'admin' || user.role === 'super';
    return json({
      member_id: user.member_id || null,
      member_name: mem ? mem.name : null,
      role: user.role,
      awaiting: !isAdm && !user.member_id,
      pending: pr || null
    }, 200, { 'cache-control': 'no-store', 'cdn-cache-control': 'no-store' });
  }
  if (path === '/api/me/password' && method === 'POST') {
    need();
    const b = await readBody(req);
    const oldPw = String(b.old_password || '');
    const newPw = String(b.new_password || '');
    if (!user.password || !user.salt || (await hashPassword(oldPw, user.salt)) !== user.password) {
      throw httpErr(400, 'Хуучин нууц үг буруу байна');
    }
    if (newPw.length < 4) throw httpErr(400, 'Шинэ нууц үг хамгийн багадаа 4 тэмдэгт байх ёстой');
    const salt = newSalt();
    await run(env, 'UPDATE users SET password=?, salt=? WHERE id=?',
      await hashPassword(newPw, salt), salt, user.id);
    await audit(env, user, 'password', 'өөрийн нууц үг солив');
    return json({ ok: true });
  }

  // --- модын байдал ---
  if (path === '/api/state' && method === 'GET') {
    need();
    return json(await buildState(user, env, { root: Number(url.searchParams.get('root')) || 0 }));
  }

  // Удам мод (тусдаа хуудас) — зөвхөн шаардлагатай хөнгөн өгөгдөл.
  // Үндсэн модны layout-д хүрэхгүй; /udam.html хуудсаас уншина.
  if (path === '/api/lineage' && method === 'GET') {
    need();
    const ctx = await contextOf(user, env);
    // Админ бүх модыг харна. Бусад хэрэглэгч ЗӨВХӨН өөрийн цусан
    // хамаатныг харна — хань, хадам, танил зэрэг цусан бус хүн орохгүй.
    let vis;
    if (ctx.isAdmin) {
      vis = ctx.vis;
    } else {
      vis = new Set();
      if (user.member_id) {
        for (const id of bloodLineSet(ctx.rel, Number(user.member_id))) {
          if (ctx.vis.has(id)) vis.add(id);
        }
      }
    }
    const has = (id) => vis.has(Number(id));
    return json({
      admin: ctx.isAdmin,
      blood_only: !ctx.isAdmin,
      members: ctx.members.filter(m => vis.has(m.id)).map(m => ({
        id: m.id, name: m.name || '', sex: m.sex || '?',
        birth_year: m.birth_year || '', birth_date: m.birth_date || '',
        clan: m.clan || '', alive: m.alive, death_date: m.death_date || ''
      })),
      children: ctx.children
        .filter(c => has(c.child_id))
        .map(c => ({
          f: c.father_id && has(c.father_id) ? c.father_id : null,
          m: c.mother_id && has(c.mother_id) ? c.mother_id : null,
          c: c.child_id
        }))
        .filter(c => c.f || c.m),
      unions: ctx.unions
        .filter(u => has(u.a_id) && has(u.b_id))
        .map(u => ({ a: u.a_id, b: u.b_id }))
    });
  }

  // «БҮТЭН МОД» — ХАТУУ ҮЕИЙН МӨР (Row 1, Row 2, Row 3 …). Зөвхөн viewer-ийн
  // цусан шугам; хань (бэр/хүргэн) нь зөвхөн НЭЭЛТТЭЙ салбар дээр, холын худ
  // (хань талын эцэг/эх) ХЭЗЭЭ Ч гарахгүй. `open` — аккордеоноор нээсэн хүн.
  if (path === '/api/full-layout' && method === 'GET') {
    need();
    const ctx = await contextOf(user, env);
    const id = Number(url.searchParams.get('id')) || (user && user.member_id) || 0;
    if (!id || !ctx.vis.has(id)) {
      return json({ viewer: 0, open: 0, openFamily: [], openable: [], cards: [], nodes: [], edges: [], width: 0, height: 0 }, 404);
    }
    // Бэр/хүргэн (цусан бус хань) дээр дарвал — ТҮҮНИЙ тал руу шилжинэ:
    // нээсэн хүний эцэг/эх, ах/дүү, хүүхдүүд гарч, холын худ нуугдана.
    // «Дахин дарахад хураах» — ижил хүн дээр 2 дахь удаа дарахад түүний
    // хүүхдүүд нуугдана (жишээ кодын toggle-той ижил).
    const reqClosed = /^(1|true|yes)$/i.test(url.searchParams.get('closed') || '');
    // Бэр/хүргэн дээр дарахад ч ижил дүрэм: мод БҮТНЭЭРЭЭ харагдана, зөвхөн
    // үеийн мөр нь дарсан хүнээр төвлөрнө (түүний эцэг/эх, ах/дүү, хань,
    // хүүхэд бүгд харагдана — юу ч нуугдахгүй).
    // Бүтэн модонд ЦУСАН үр удам бүхэлдээ харагдана: харагдах хүрээнд
    // байгаа хүн бүрийн хүүхэд, ач/зээ … (алс холын үеэл ч) нэмэгдэнэ.
    const visAll = new Set(ctx.vis);
    // БҮХ ӨВГИЙГ дээшээ нээж, дараа нь тэдний БҮХ үр удмыг доошоо нэмнэ:
    // үеэл, үеэлийн хүүхэд, ах/дүүгийн ач/зээ — алс холын ч бүгд харагдана.
    {
      const q = [...visAll];
      while (q.length) {
        const c0 = q.pop();
        for (const p0 of ctx.rel.par.get(c0) || []) {
          if (!visAll.has(p0)) { visAll.add(p0); q.push(p0); }
        }
      }
    }
    {
      const q = [...visAll];
      while (q.length) {
        const p0 = q.pop();
        for (const k0 of ctx.rel.kids.get(p0) || []) {
          if (!visAll.has(k0)) { visAll.add(k0); q.push(k0); }
        }
      }
    }
    for (const id0 of [...visAll]) {
      for (const sp0 of ctx.rel.sp.get(id0) || []) if (!visAll.has(sp0)) visAll.add(sp0);
    }
    const calc = (openId, closed) => buildFullLayout({
      members: ctx.members, rel: ctx.rel, vis: visAll, viewerId: id, openId,
      closedKids: !!closed
    });
    // ТОГТООСОН байрлал байвал түүнийгээ буцаана (гишүүдийн бүрэлдэхүүн
    // өөрчлөгдөөгүй л бол) — хэрэглэгчийн «тогтоосон» байрлал хэвээр үлдэнэ.
    const reqOpen = Number(url.searchParams.get('open')) || 0;
    const lock = await get(env, 'SELECT data FROM layout_locks WHERE viewer_id=?', id);
    if (lock && lock.data) {
      try {
        const saved = JSON.parse(lock.data);
        const savedOpen = Number(saved.open) || 0;
        // «👥» тэмдгээр ӨӨР салбар нээхэд тогтоосон байрлалыг албадаж
        // харуулахгүй — шинэ хүмүүс гарна. Тогтоолт нь хэвээр (locked=true).
        if (!reqClosed && (!reqOpen || reqOpen === savedOpen)) {
          const now = calc(savedOpen, false);
          const same = saved.v === now.v && Array.isArray(saved.cards) && saved.cards.length === now.cards.length &&
            saved.cards.every(x => now.cards.includes(x));
          if (same) return json({ ...saved, locked: true, fixed: true });
        }
      } catch (e) { /* эвдэрсэн бол дахин тооцоолно */ }
    }
    return json({ ...calc(reqOpen, reqClosed), closed: reqClosed, locked: !!(lock && lock.data), fixed: false });
  }

  // БАЙРЛАЛ ТОГТООХ / ТАЙЛАХ — тухайн хэрэглэгчийн үеийн мөр D1-д хадгалагдана.
  if (path === '/api/layout-lock' && method === 'POST') {
    need();
    const b = await readBody(req);
    const ctx = await contextOf(user, env);
    const id = Number(b.viewer) || (user && user.member_id) || 0;
    if (!id || !ctx.vis.has(id)) return json({ error: 'Хүрээнд байхгүй' }, 400);
    if (b.lock === false) {
      await run(env, 'DELETE FROM layout_locks WHERE viewer_id=?', id);
      await audit(env, user, 'layout', `#${id} тогтоосон байрлал тайлагдлаа`);
      return json({ ok: true, locked: false });
    }
    const L = buildFullLayout({
      members: ctx.members, rel: ctx.rel, vis: ctx.vis, viewerId: id,
      openId: Number(b.open) || 0
    });
    await run(env, `INSERT INTO layout_locks(viewer_id, data, updated_at) VALUES(?,?,datetime('now'))
      ON CONFLICT(viewer_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`, id, JSON.stringify(L));
    await audit(env, user, 'layout', `#${id} байрлал тогтоогдлоо (${L.cards.length} карт)`);
    return json({ ok: true, locked: true, layout: L });
  }

  // Фокус-горимын НЯГТ байрлал: зөвхөн фокусын хүмүүс + шууд нуугдсан хамаатан
  // (хань, үеэл, хүүхэд гэх мэт) — нуугдсан хүмүүс байрлалтай болж, зай хураана
  if (path === '/api/focus-layout' && method === 'GET') {
    need();
    const id = Number(url.searchParams.get('id')) || 0;
    const ctx = await contextOf(user, env);
    // Харагдах хүрээний БҮХ цустан үр удам — дарсан хүний хүүхэд, ач/зээ
    // (алс үеийн ч) фокус-горимд гарна.
    const visAll = new Set(ctx.vis);
    // БҮХ ӨВГИЙГ дээшээ нээж, дараа нь тэдний БҮХ үр удмыг доошоо нэмнэ:
    // үеэл, үеэлийн хүүхэд, ах/дүүгийн ач/зээ — алс холын ч бүгд харагдана.
    {
      const q = [...visAll];
      while (q.length) {
        const c0 = q.pop();
        for (const p0 of ctx.rel.par.get(c0) || []) {
          if (!visAll.has(p0)) { visAll.add(p0); q.push(p0); }
        }
      }
    }
    {
      const q = [...visAll];
      while (q.length) {
        const p0 = q.pop();
        for (const k0 of ctx.rel.kids.get(p0) || []) {
          if (!visAll.has(k0)) { visAll.add(k0); q.push(k0); }
        }
      }
    }
    for (const id0 of [...visAll]) {
      for (const sp0 of ctx.rel.sp.get(id0) || []) if (!visAll.has(sp0)) visAll.add(sp0);
    }
    const empty = { focus: id, cards: [], hidden: [], nodes: [], edges: [], width: 0, height: 0 };
    if (!id || !ctx.vis.has(id)) return json(empty, 404);
    const fs = focusCards(ctx.rel, id);
    const blood = focusBlood(ctx.rel, id);
    // 1–2-р үе: зөвхөн ЦУСАН хамаарал нь карт болж харагдана.
    const cards = new Set([...blood].filter(x => ctx.vis.has(x)));
    // ХАНЬ (бэр/хүргэн) анхдагчаар НУУГДМАЛ — тухайн хүн дээр дарахад л ил гарна.
    const spouseHidden = new Set([...fs].filter(x =>
      !blood.has(x) && ctx.vis.has(x) && !cards.has(x)));
    // Хэрэглэгчийн ӨӨРИЙН карт фокус-горимд үргэлж харагдана — өөр хүн рүү
    // шилжихэд «Би» карт алга болохгүй.
    // `self=0` — БУСАД ХҮН РҮҮ ШИЛЖСЭН (drill-down) үед «Би» болон түүний гэр
    // бүрийн блок ОРОХГҮЙ: карт нээхэд доорх бүх хүн хураагдаж, зөвхөн
    // дарсан хүний хүүхдүүд (болон дээд цусан өвөг) гарна.
    const selfId = url.searchParams.get('self') === '0' ? null
      : ((user && user.member_id) || null);
    // Хэрэглэгч фокусын картдаа ороогүй бол түүнийг ГЭР БҮЛЭЭР нь (эцэг/эх +
    // ах/дүү) хамт нэмнэ — «Би» карт бусдын эгнээнд ганцаараа холилдохгүй,
    // өөрийн гэр бүлийн блок болж харагдана.
    const selfFam = new Set();
    if (selfId && ctx.vis.has(selfId) && !cards.has(selfId)) {
      selfFam.add(selfId);
      for (const p of ctx.rel.par.get(selfId) || []) if (ctx.vis.has(p)) selfFam.add(p);
      for (const p of ctx.rel.par.get(selfId) || [])
        for (const k of ctx.rel.kids.get(p) || []) if (ctx.vis.has(k)) selfFam.add(k);
      for (const x of selfFam) cards.add(x);
    } else if (selfId && ctx.vis.has(selfId)) {
      cards.add(selfId);
    }
    // `open` — хэрэглэгчийн дарж нээсэн хүмүүс: тэд БҮТЭН КАРТ болж байрлана.
    const open = new Set(String(url.searchParams.get('open') || '')
      .split(',').map(Number).filter(x => x > 0));
    // Хаалт нь ЗӨВХӨН нээлттэй (open) картуудыг хасна — цусан карт хэзээ ч
    // хасагдахгүй.
    const bloodCards = new Set(cards);
    // `self=0` (drill-down: өөр хүн рүү шилжсэн) үед ХАНЬ (нөхөр/эхнэр, бэр/
    // хүргэн) нь карт болж ХАРАГДАНА — «Хулгана дээр дарахад Намжил гардаггүй,
    // Цагааны хүргэн байхгүй» гэсэн алдааг зассан. Цусан карт хэвээр тул
    // хаалтын дүрэм тэднийг хөндөхгүй.
    const drillView = url.searchParams.get('self') === '0';
    // Drill-down (өөр хүн рүү шилжсэн) үед ХАНЬ (нөхөр/эхнэр, хүргэн/бэр)
    // НЭМЭГДЭНЭ: Цагаан дээр дарахад Хулганагийн хажууд Намжил (түүний
    // нөхөр) гарна. Үндэс логикийг зассан тул байрлал эвдрэхгүй.
    if (drillView) for (const d of spouseHidden) {
      if (ctx.vis.has(d)) cards.add(d);
    }
    // ҮНДСЭН ХАРАГДАЦ: зөвхөн ХАМГИЙН АХМАД үе (эцэг/эх нь харагдахгүй
    // хүмүүс) ҮЛДЭНЭ — бусад бүх хүн нуугдана. Тухайн хүн дээр дарахад
    // хүүхдүүд нь гарна (drill-down).
    if (!drillView) {
      for (const x of [...cards]) {
        const hasParent = [...(ctx.rel.par.get(x) || [])].some(p => ctx.vis.has(p));
        if (hasParent) cards.delete(x);
      }
    }
    for (const x of open) if (ctx.vis.has(x) && !cards.has(x)) cards.add(x);
    // ДАРСАН хүний хүүхдүүд (болон хань) фокус-горимд ЗААВАЛ харагдана.
    for (const x of open) {
      if (!ctx.vis.has(x)) continue;
      for (const k of ctx.rel.kids.get(x) || []) if (visAll.has(k)) { cards.add(k); bloodCards.add(k); }
      for (const sp of ctx.rel.sp.get(x) || []) if (visAll.has(sp)) cards.add(sp);
    }
    // `closed` — ХААГДСАН ГЭР БҮЛ (эцэг/эхийн id): тэдний хүүхдүүд нуугдана.
    // Гэр бүл сэлгэхэд өмнөх гэр бүл бүхэлдээ хураагдана — «Би» карт үлдэнэ.
    const closed = new Set(String(url.searchParams.get('closed') || '')
      .split(',').map(Number).filter(x => x > 0));
    if (closed.size) {
      // ЦУСАН БУС (бэр/хүргэн) карт — open жагсаалтад байсан эсэхээс үл
      // хамаарч ХАСНА. Цусан карт (bloodCards) ХЭЗЭЭ Ч хасагдахгүй, «Би» ч үлдэнэ.
      const drop = (x) => {
        if (x != null && x !== selfId && !bloodCards.has(x)) cards.delete(x);
      };
      for (const h of closed) {
        drop(h);                                              // толгой өөрөө (бэр/хүргэн бол)
        for (const sp of ctx.rel.sp.get(h) || []) drop(sp);    // толгойн хань
        for (const k of ctx.rel.kids.get(h) || []) {
          if (k === selfId) continue;                          // «Би» карт үргэлж харагдана
          drop(k);                                             // хүүхэд (цусан бус бол)
          for (const sp of ctx.rel.sp.get(k) || []) drop(sp);  // хүүхдийн хань
          for (const g of ctx.rel.kids.get(k) || []) drop(g);  // ач/зээ (нээлттэй байсан бол)
        }
      }
    }
    // ХАНЬ (бэр/хүргэн) нь ЗӨВХӨН хань нь өөрөө харагдаж байвал л харагдана.
    // Хүүхдүүд хаагдахад тэдний хань ч ХАМТ алга болно — эс бөгөөс «хүүхэд
    // нуугдсан атлаа бэр/хүргэн ганцаараа үлдэх» алдаа гардаг.
    for (const x of [...cards]) {
      if (bloodCards.has(x) || x === selfId || selfFam.has(x)) continue;
      const sps = [...(ctx.rel.sp.get(x) || [])];
      if (sps.length && !sps.some(sp => cards.has(sp))) cards.delete(x);
    }
    // Нуугдах хүмүүс — ЗӨВХӨН цусан үр хүүхэд (үеэл, ач/зээ гэх мэт).
    // Хань (бэр/хүргэн) болон цусан хамааралгүй хүн фокус-горимд ХАРАГДАХГҮЙ.
    // ӨВӨӨ/ЭМЭЭГЭЭС ДЭЭШ өвөг (3-р үе ба түүнээс дээш) — тэдний АХ/ДҮҮ,
    // бусад хүүхэд (Мажиг, Бондог …) фокус-горимд ОРОХГҮЙ.
    const ancUp = new Set();
    {
      const gp = new Set();
      for (const pr of (ctx.rel.par.get(id) || [])) for (const g of ctx.rel.par.get(pr) || []) gp.add(g);
      let qq = [...gp];
      while (qq.length) {
        const nx = [];
        for (const g of qq) for (const pr of ctx.rel.par.get(g) || []) {
          if (!ancUp.has(pr)) { ancUp.add(pr); nx.push(pr); }
        }
        qq = nx;
      }
    }
    const direct = new Set();
    for (const x of cards) {
      if (ancUp.has(x)) continue;   // дээд өвгийн бусад хүүхэд нэмэгдэхгүй
      if (x === selfId || selfFam.has(x)) continue; // өөрийн гэр бүлийн нэмэлт салбар хэрэггүй
      if (closed.has(x)) continue;                  // хаагдсан гэр бүлийн хүүхэд огт гарахгүй
      for (const k of ctx.rel.kids.get(x) || []) if (!cards.has(k) && ctx.vis.has(k)) direct.add(k);
    }
    // ХАДАМ ААВ/ЭЭЖ: хань (бэр/хүргэн)-ийн эцэг/эх — ТУСДАА бүлэг.
    // Гол модны геометрийг эвдэхгүйн тулд байрлалыг доор гараар өгнө.
    // Хадам (цусан бус) фокус-горимд ХАРАГДАХГҮЙ.
    const inlaw = new Set();
    // ГЭР БҮЛ = эцэг/эх хос (сав). Хүүхдүүд нь эхлээд ХААЛТТАЙ (нуугдмал) —
    // гэр бүлийн карт дээр дарахад нээгдэж, хүүхдүүд ил гарна.
    // Нуугдмал хань ч байрлалтай болно (нээгдэхэд зай нь бэлэн)
    for (const d of spouseHidden) if (!cards.has(d)) direct.add(d);
    const keep = new Set([...cards, ...direct]);
    const keepMain = new Set([...keep].filter(x => !inlaw.has(x)));
    // Байрлалд ЗӨВХӨН бүтэн картууд орно — нуугдмал (сүнс) хань/хүүхдүүд
    // мөрөнд нэмэлт өргөн эзэлж, зайг тэгш бус болгодог байв. Тэдний тоог
    // картын «👥 +N» тэмдэг харуулна.
    const members = ctx.members.filter(m => cards.has(m.id));
    const children = ctx.children.filter(c =>
      cards.has(c.child_id) && (cards.has(c.father_id) || cards.has(c.mother_id)));
    const unions = ctx.unions.filter(u => cards.has(u.a_id) && cards.has(u.b_id));
    // Эрэмбэ: ЭЭЖИЙН тал ЗҮҮН, ААВЫН тал БАРУУН (мөр бүрт). Түлхүүр цэгүүд:
    //   ээжийн өвөг 0 · ээжийн ах/дүү 1 · ээж 2 · аав 3 · аавын ах/дүү 4 · аавын өвөг 5
    const sexOf = new Map(ctx.members.map(m => [m.id, m.sex]));
    const pars = [...(ctx.rel.par.get(id) || [])];
    const mom = pars.find(p => sexOf.get(p) === 'f') ?? null;
    const dad = pars.find(p => p !== mom) ?? null;
    const order = new Map();
    const put = (x, v) => { if (x != null && !order.has(x)) order.set(x, v); };
    const side = (p, [gp, sib, self]) => {
      if (p == null) return;
      // тухайн талын БҮХ үеийн өвөг (хүртэл дээшээ) — нуугдсан ч эрэмбээ хадгална
      const anc = new Set();
      let q = [...(ctx.rel.par.get(p) || [])];
      while (q.length) {
        const nx = [];
        for (const g of q) {
          if (anc.has(g)) continue;
          anc.add(g);
          for (const gg of ctx.rel.par.get(g) || []) nx.push(gg);
        }
        q = nx;
      }
      for (const g of anc) put(g, gp);
      // АХ/ДҮҮ НАР ИЖИЛ ЗЭРЭГЛЭЛТЭЙ: тухайн гэр бүлийн БҮХ хүүхэд (эцэг/эх
      // өөрөө ч хамт) нэг зэрэглэл авна — ингэснээр тэд ТӨРСНИЙ ДАРААЛААР
      // (1,2,3…10) эрэмбэлэгдэж, нэг нь дунд руу шилжихгүй. Талын ялгаа
      // (ээжийн тал зүүн / аавын тал баруун) зэрэглэлүүдийн хооронд хэвээр.
      for (const g of anc)
        for (const k of ctx.rel.kids.get(g) || []) put(k, sib);
      put(p, self);   // зөвхөн дээрхээс зэрэглэл аваагүй бол
    };
    // ЭЦЭГ/ЭХ ХОС хүүхдүүдийнхээ ЗҮҮН ИРМЭГТ тэгшилнэ: ах/дүү нарынхаа
    // хажууд ойрхон зогсож, хүүхдүүд нь доор нь (нөгөө айлын баганад орохгүй).
    // Зөвхөн ААВ/ЭЭЖ (фокус хүний эцэг/эх) зүүн ирмэгээсээ эхэлнэ; ӨВӨӨ/ЭМЭЭ
    // нь хүүхдүүдийнхээ (ах/дүү нарын мөр) ЯГ ГОЛД төвлөрнө.
    const alignLeft = new Set();
    for (const p of pars) if (p != null) alignLeft.add(p);
    const compactIds = new Set();   // блок өргөн хүүхдээрээ тэлэхгүй id-ууд

    side(mom, [0, 1, 2]);   // ээжийн тал → зүүн
    side(dad, [5, 4, 3]);   // аавын тал → баруун
    // ЭЦЭГ/ЭХ ХОС мөрийнхөө ХАМГИЙН АРД (баруун захад) байрлана:
    // төрсөн дарааллаар ах/дүү нарынхаа дараа — Сувдэрдэнэ, ард нь нөхөр
    // Ганхүү, түүний дээр нь эцэг нь (зураас зөв, давхцалгүй гарна).
    if (mom != null) order.set(mom, 90);
    if (dad != null) order.set(dad, 90.5);
    // ── ФОКУС ХҮН мөрийнхөө ЭХЭНД (эцэг/эхийнхээ яг доор) байрлана ──
    // Өмнө нь фокус хүн төрсөн дарааллаараа хаана ч байсан тул эцэг/эх нь
    // мөрийн зүүн ирмэгт тэгшилснээр холбоос нь бүх ах/дүүсийн картын
    // дээгүүр урт хэвтээ шугамаар явж, хажуугийн картад хүрсэн мэт харагддаг
    // байв. Одоо фокус хүн эхэндээ → цусан холбоо нь дээшээ БОГИНО босоо
    // шугамаар эцэг/эх рүүгээ явна; ах/дүү нар баруун тийшээ холбоогоо
    // хадгална (тэдний шугам тасрахгүй).
    if (keepMain.has(id)) {
      const sibGrp = new Set([id]);
      for (const p of (ctx.rel.par.get(id) || []))
        for (const k of ctx.rel.kids.get(p) || []) if (keepMain.has(k)) sibGrp.add(k);
      const rest = sortMembers(ctx.members.filter(m => sibGrp.has(m.id) && m.id !== id));
      [id, ...rest.map(m => m.id)].forEach((x, i) => order.set(x, 1 + i * 0.01));
    }
    // ── ДАРСАН ГЭР БҮЛ ГОЛД: `mid` — дарсан ах/дүүг мөрийнхөө ГОЛ байрлалд
    // (эцэг/эхийнхээ доор) шилжүүлнэ; бусдын харьцангуй дараалал хэвээр.
    const midId = Number(url.searchParams.get('mid')) || 0;
    if (midId && keepMain.has(midId)) {
      // Дарсан хүний АХ/ДҮҮ НАР (аль ч мөрөнд) — түүнийг гол байрлалд
      // шилжүүлж, бусдын харьцангуй дараалал хэвээр үлдэнэ.
      const parsM = ctx.rel.par.get(midId) || new Set();
      const grp = new Set([midId]);
      for (const p of parsM) for (const k of ctx.rel.kids.get(p) || []) if (keepMain.has(k)) grp.add(k);
      if (grp.size > 1) {
        const cur = order.get(midId);
        const list = sortMembers(ctx.members.filter(m => grp.has(m.id)));
        list.sort((x, y) => (order.get(x.id) ?? cur ?? 1) - (order.get(y.id) ?? cur ?? 1));
        const at = list.findIndex(m => m.id === midId);
        if (at >= 0) {
          const [picked] = list.splice(at, 1);
          // Голын байрлалаас НЭГ ХҮНИЙ АРД (баруун тийш).
          list.splice(Math.floor(list.length / 2) + 1, 0, picked);
          const base = (cur != null && order.get(midId) === cur) ? cur : (cur != null ? cur : 1);
          list.forEach((m, i) => order.set(m.id, base + i * 0.01));
        }
        // Дарсан гэр бүлийн блок хүүхдүүдээрээ тэлэхгүй — зай жигд.
        for (const m of grp) compactIds.add(m);
      }
    }
    // Ээж/аав ах дүү нарынхаа ТӨРСӨН ДАРААЛААР (хамгийн ХОЙНО) байрлана —
    // ингэсэн үед холбоос зураас (bus) зөв, давхцалгүй гардаг.
    // Фокус-горимд зайг шахаж, картуудыг нэг харагдацад багцална: нуугдсан хүмүүс
    // зөвхөн жижиг икон тул гагцхүү 26px өргөн эзэлнэ (нээгдсэн бол бүтэн карт)
    const narrow = new Set([...keepMain].filter(x => !cards.has(x)));
    const layout = layoutTree({
      members, children, unions, order,
      // Бүх ах/дүү блок ИЖИЛ өргөнтэй (184) — хань/хүүхэд байсан ч зай жигд
      // Фокус мөрийн блок өргөн ЗӨВХӨН өөрийн карт/хосоор тодорхойлогдоно —
      // нээгдсэн хүүхдүүд ах/дүүгийн зайг өөрчлөхгүй.
      gaps: { h: 18, unit: 12, couple: 32, ghost: 16, ghostGap: 12, childGap: 4, unitMin: 184, narrow, alignLeft, compactIds }
    });
    // Сөрөг байрлал гарвал бүх модыг баруун тийш шилжүүлнэ (канвас 0-ээс)
    {
      const minX = Math.min(...layout.nodes.map(n => n.x));
      if (minX < 0) {
        const d = -minX;
        for (const n of layout.nodes) n.x += d;
        for (const e of layout.edges) {
          for (const k of ['x', 'x1', 'x2']) if (e[k] != null) e[k] += d;
          for (const st of e.stubs || []) st.x += d;
        }
      }
    }
    // ── ХАДАМ ААВ/ЭЭЖ-ийг хань руугаа нэг мөр дээр тавина (тусдаа, чөлөөт слотод) ──
    const inlawPlaced = new Set();
    if (inlaw.size) {
      const CW = 156, CH = 96, RH = 140, GAPX = 24;
      const nodeOf = new Map(layout.nodes.map(n => [n.id, n]));
      // Хадам хосууд (эцэг + эх) — нэг бүлэг. Давхардахгүй: хүн зөвхөн НЭГ бүлэгт.
      const seen = new Set();
      const units = [];
      for (const id of inlaw) {
        if (seen.has(id) || nodeOf.has(id)) continue;
        const u = [id, ...(ctx.rel.sp.get(id) || [])]
          .filter(x => inlaw.has(x) && !nodeOf.has(x) && !seen.has(x));
        for (const x of u) seen.add(x);
        if (!u.length) continue;
        let anchor = null, anchorId = null;
        for (const x of u) {
          for (const k of ctx.rel.kids.get(x) || []) {
            const kn = nodeOf.get(k);
            if (kn) { anchor = kn; anchorId = k; break; }
          }
          if (anchor) break;
        }
        units.push({ u, anchor, anchorId });
      }
      // Хадам үргэлж хань руугаа НЭГ МӨР ДЭЭШ. Хань 0-р мөрөнд байвал бүх модыг
      // нэг мөр доошлуулж, хадамд дээд мөр гаргаж өгнө.
      if (units.some(x => x.anchor && x.anchor.y === 0)) {
        for (const n of layout.nodes) { n.y += RH; n.gen = (n.gen || 0) + 1; }
        for (const e of layout.edges) {
          if (e.t === 's') { e.y1 += RH; e.y2 += RH; }
          else if (e.t === 'p') { e.y += RH; }
          else if (e.t === 'b') {
            e.y0 += RH; e.y1 += RH;
            for (const st of e.stubs || []) { st.y0 += RH; st.y1 += RH; }
          } else if (e.t === 'c') { e.y1 += RH; e.y2 += RH; }
        }
      }
      const hits = (x, y, w) => layout.nodes.some(n =>
        Math.abs(n.y - y) < 4 && x < n.x + (n.w || CW) + 16 && n.x < x + w + 16);
      const freeSpot = (target, y, w) => {
        // Сөрөг байрлал руу гарахгүй (канвас 0-ээс эхэлдэг)
        const t0 = Math.max(0, target);
        if (!hits(t0, y, w)) return t0;
        for (let i = 1; i <= 60; i++) {
          for (const d of [1, -1]) {
            const x = t0 + d * i * (CW + GAPX + 8);
            if (x < 0) continue;
            if (!hits(x, y, w)) return x;
          }
        }
        return t0;
      };
      const midOf = (n) => n.x + (n.w || CW) / 2;
      for (const { u, anchor, anchorId } of units) {
        const uw = u.length * CW + (u.length - 1) * 32;
        const y = anchor ? Math.max(0, anchor.y - RH) : 0;
        const target = anchor ? Math.round(anchor.x + CW / 2 - uw / 2) : 0;
        let ux = freeSpot(target, y, uw);
        for (const m of u) {
          const n = { id: m, x: Math.round(ux), y, gen: Math.round(y / RH), w: CW };
          layout.nodes.push(n); nodeOf.set(m, n); inlawPlaced.add(m);
          ux += CW + 32;
        }
        if (anchor) {
          const first = nodeOf.get(u[0]), last = nodeOf.get(u[u.length - 1]);
          const stemX = Math.round((midOf(first) + midOf(last)) / 2);
          const busY = y + CH + 24;
          layout.edges.push({
            t: 'b', a: u[0], b: u[u.length - 1], inlaw: true,
            kids: [anchorId], x: stemX, y0: y + CH / 2, y1: busY,
            stubs: [{ c: anchorId, x: midOf(anchor), y0: busY, y1: anchor.y }]
          });
        }
      }
      let mx = 0, my = 0;
      for (const n of layout.nodes) { mx = Math.max(mx, n.x + (n.w || CW)); my = Math.max(my, n.y + RH); }
      layout.width = mx; layout.height = my;
    }
    // ДАВХЦАЛ АРИЛГАХ (фокус): нэг мөрөнд карт бие биендээ орвол баруун
    // талын картуудыг гулсуулж, хөндлөн зайг 16px-аас багагүй болгоно.
    {
      const dxOf = new Map();
      const byRow = new Map();
      for (const n of layout.nodes) {
        if (!byRow.has(n.y)) byRow.set(n.y, []);
        byRow.get(n.y).push(n);
      }
      for (const list of byRow.values()) {
        list.sort((a, b) => a.x - b.x);
        let prevR = null;
        for (const n of list) {
          const w = n.w || 156;
          if (prevR != null && n.x < prevR + 16) {
            const d = prevR + 16 - n.x;
            n.x += d;
            dxOf.set(n.id, (dxOf.get(n.id) || 0) + d);
          }
          prevR = n.x + w;
        }
      }
      if (dxOf.size) {
        const dxFor = (e) => {
          const ids = e.t === 's' ? [e.a] : e.t === 'p' ? [e.a] : e.t === 'b' ? [e.a]
            : e.t === 'c' ? [e.p] : [];
          for (const id of ids) if (dxOf.has(id)) return dxOf.get(id);
          return 0;
        };
        for (const e of layout.edges) {
          const d = dxFor(e);
          if (!d) continue;
          for (const k of ['x', 'x1', 'x2']) if (e[k] != null) e[k] += d;
        }
      }
    }
    // Бүх шилжилт, давхцал арилгасны дараа хүрээг ДАХИН тооцно — эс бөгөөс
    // fit() хэт том зум тавьж, захын картууд дэлгэцнээс гарч тасарна.
    {
      let mx = 0, my = 0;
      for (const n of layout.nodes) {
        mx = Math.max(mx, n.x + (n.w || 156));
        my = Math.max(my, n.y + 140);
      }
      layout.width = mx; layout.height = my;
    }
    return json({
      focus: id, cards: [...cards, ...inlawPlaced], hidden: [...direct].filter(x => !cards.has(x)),
      nodes: layout.nodes, edges: layout.edges, width: layout.width, height: layout.height
    });
  }

  if (path === '/api/pick' && method === 'GET') {
    need();
    const ctx = await contextOf(user, env);
    const kind = url.searchParams.get('kind') || 'any';
    const of = Number(url.searchParams.get('of')) || 0;
    let list = ctx.members.filter(x => ctx.vis.has(x.id));
    if (of) {
      const sp = ctx.rel.sp.get(of) || new Set();
      const kidsOf = ctx.rel.kids.get(of) || new Set();
      const parOf = ctx.rel.par.get(of) || new Set();
      list = list.filter(x => x.id !== of);
      if (kind === 'child') {
        list = list.filter(x => !isAncestor(ctx.rel, x.id, of)); // өөрийнхөө удам биш
        list = list.filter(x => !kidsOf.has(x.id));
      } else if (kind === 'parent') {
        list = list.filter(x => !isAncestor(ctx.rel, of, x.id)); // хүүхэд биш
        list = list.filter(x => !parOf.has(x.id));
      } else if (kind === 'spouse') {
        list = list.filter(x => !sp.has(x.id));
      }
    }
    return json({
      members: sortMembers(list).map(x => ({
        id: x.id, name: x.name, sex: x.sex, birth_year: x.birth_year, birth_date: x.birth_date,
        alive: x.alive,
        has_parents: (ctx.rel.par.get(x.id) || new Set()).size > 0
      }))
    });
  }

  // --- гишүүний нүүр зураг (base64-ийг тусад нь, кэштэй) ---
  let pm = path.match(/^\/api\/members\/(\d+)\/photo$/);
  if (pm && method === 'GET') {
    need();
    const id = Number(pm[1]);
    const mem = await get(env, 'SELECT id, photo FROM members WHERE id=?', id);
    if (!mem) throw httpErr(404, 'Зураг олдохгүй');
    // Админд бүх зураг нээлттэй; бусад хэрэглэгчид харах хүрээгээ шалгана.
    if (user.role !== 'super' && user.role !== 'admin') {
      const ctx = await contextOf(user, env);
      if (!ctx.vis.has(id)) throw httpErr(404, 'Зураг олдохгүй');
    }
    // Хувилбар (?v=) өөрчлөгдөөгүй бол 304 — дахин татахгүй, дуудлагын хэмжээ хамгийн бага
    const pver = url.searchParams.get('v') || '0';
    const petag = '"' + pver + '"';
    if (req.headers.get('if-none-match') === petag) {
      return new Response(null, { status: 304, headers: {
        'cache-control': 'public, max-age=86400', 'etag': petag
      } });
    }
    let src = String(mem.photo || '');
    if (LAZY_PHOTO_RE.test(src)) src = ''; // өөрөө рүүгээ заасан линк — эвдэрсэн зураг
    // Нүүр зураг тохируулаагүй бол цомгийн хамгийн эхний зургийг харуулна
    if (!src) {
      const ph = await get(env, 'SELECT url FROM member_photos WHERE member_id=? ORDER BY id LIMIT 1', id);
      src = String((ph && ph.url) || '');
    }
    if (!src) throw httpErr(404, 'Зураг олдохгүй');
    const m = src.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!m) {
      if (/^https?:\/\//i.test(src)) return Response.redirect(src, 302);
      throw httpErr(404, 'Зураг олдохгүй');
    }
    const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
    return new Response(bytes, { headers: {
      'content-type': m[1],
      // Браузер 1 өдөр локал кэшээс авна — хуудас нээх бүрт дахин татахгүй.
      // Зураг солигдвол state дэх ?v= хувилбар өөрчлөгдөж, шинэ линк татагдана.
      'cache-control': 'public, max-age=86400',
      'etag': petag,
      'x-content-type-options': 'nosniff'
    } });
  }

  // --- гишүүн ---
  let mm = path.match(/^\/api\/members\/(\d+)(\/update|\/delete)?$/);
  if (mm) {
    const id = Number(mm[1]);
    const action = mm[2] || '';
    if (method === 'GET' && !action) {
      need();
      const ctx = await contextOf(user, env);
      const mem = ctx.members.find(x => x.id === id);
      if (!mem || !ctx.vis.has(id)) throw httpErr(404, 'Гишүүн олдохгүй');
      const hasBio = ctx.isAdmin || ctx.bio.has(id);
      const photos = await all(env, 'SELECT id, url, created_at FROM member_photos WHERE member_id=? ORDER BY id', id);
      const events = await all(env, 'SELECT id, event_date, title, photo FROM member_events WHERE member_id=? ORDER BY event_date, id', id);
      return json({
        member: sanitize(mem, hasBio, canEdit(user, id, ctx.trMap)),
        relations: relationsOf(ctx, id),
        has_bio: hasBio, photos, events
      });
    }
    if (method === 'POST' && action === '/update') {
      need();
      const ctx = await contextOf(user, env);
      if (!canEdit(user, id, ctx.trMap)) {
        throw httpErr(403, 'Доод эрэмбэтэй хүн дээд эрэмбэтэй хүний мэдээлэл засах эрхгүй');
      }
      const mem = ctx.members.find(x => x.id === id);
      if (!mem) throw httpErr(404, 'Гишүүн олдохгүй');
      const b = await readBody(req);
      await run(
        env,
        `UPDATE members SET name=?, sex=?, birth_year=?, birth_date=?, birth_place=?, clan=?,
         alive=?, phone=?, bio=?, honors=?, photo=?, death_date=?, emoji=? WHERE id=?`,
        String(b.name || mem.name).trim() || mem.name,
        b.sex !== undefined ? normSex(b.sex) : mem.sex,
        String(b.birth_year !== undefined ? b.birth_year : mem.birth_year).trim() ||
          String(b.birth_date !== undefined ? b.birth_date : mem.birth_date || '').trim().slice(0, 4),
        String(b.birth_date !== undefined ? b.birth_date : mem.birth_date).trim(),
        String(b.birth_place !== undefined ? b.birth_place : mem.birth_place).trim(),
        String(b.clan !== undefined ? b.clan : mem.clan).trim(),
        b.alive !== undefined
          ? ((b.alive === false || b.alive === 0 || b.alive === '0') ? 0 : 1)
          : (mem.alive === 0 ? 0 : 1),
        String(b.phone !== undefined ? b.phone : mem.phone).trim(),
        String(b.bio !== undefined ? b.bio : mem.bio || ''),
        String(b.honors !== undefined ? b.honors : mem.honors || '').trim().slice(0, 2000),
        // Засах форм нь state-ийн lazy линкийг буцааж илгээдэг — тэр үед хадгалагдсан
        // бодит зургийг хөндөхгүй.
        (() => {
          if (b.photo === undefined) return normPhoto(mem.photo || '');
          const raw = String(b.photo || '');
          // Хоосон утга ирвэл зөвхөн «зургийг устгах» гэж ЗОРИУД илгээсэн үед л устгана
          if (!raw && mem.photo && b.photo_dirty !== true) return normPhoto(mem.photo || '');
          return LAZY_PHOTO_RE.test(raw) ? normPhoto(mem.photo || '') : normPhoto(raw);
        })(),
        normDeath(b.death_date !== undefined ? b.death_date : mem.death_date || ''),
        normEmoji(b.emoji !== undefined ? b.emoji : mem.emoji || ''),
        id
      );
      // Оноо②③: засахад шинээр өгөхгүй — зөвхөн хоосон→дүүрсэн талбарт л оноо
      const freshU = await get(env, 'SELECT * FROM members WHERE id=?', id);
      const gotU = await scoreMember(env, user, id, mem, freshU);
      if (b.rel_as && Number(b.rel_id)) {
        await applyRel(env, user, ctx, id,
          b.sex !== undefined ? normSex(b.sex) : mem.sex, String(b.rel_as), Number(b.rel_id));
      }
      await audit(env, user, 'update_member', `${mem.name} (#${id})`);
      return json({ ok: true, points: gotU.reduce((s, x) => s + x.points, 0) });
    }
    if (method === 'POST' && action === '/delete') {
      need();
      const ctx = await contextOf(user, env);
      // Устгах нь БУЦААХ БОЛОМЖГҮЙ тул зөвхөн админ/супер админд үлдээнэ
      if (!(user.role === 'admin' || user.role === 'super')) {
        throw httpErr(403, 'Зөвхөн админ устгах боломжтой');
      }
      if (!canEdit(user, id, ctx.trMap)) throw httpErr(403, 'Устгах эрхгүй');
      const mem = ctx.members.find(x => x.id === id);
      if (!mem) throw httpErr(404, 'Гишүүн олдохгүй');
      await run(env, 'DELETE FROM children WHERE child_id=? OR father_id=? OR mother_id=?', id, id, id);
      await run(env, 'DELETE FROM unions WHERE a_id=? OR b_id=?', id, id);
      await run(env, 'DELETE FROM field_scores WHERE member_id=?', id);
      await run(env, 'DELETE FROM member_photos WHERE member_id=?', id);
      await run(env, 'DELETE FROM member_events WHERE member_id=?', id);
      await run(env, 'DELETE FROM members WHERE id=?', id);
      await run(env, 'UPDATE users SET member_id=NULL WHERE member_id=?', id);
      await audit(env, user, 'delete_member', `${mem.name} (#${id})`);
      return json({ ok: true });
    }
  }

  if (path === '/api/members' && method === 'POST') {
    need();
    const ctx = await contextOf(user, env);
    if (!ctx.isAdmin && !user.member_id) throw httpErr(403, 'Картгүй хэрэглэгч гишүүн нэмэх эрхгүй');
    const b = await readBody(req);
    if (b.father_id && !canEdit(user, Number(b.father_id), ctx.trMap)) throw httpErr(403, 'Эрхгүй');
    if (b.mother_id && !canEdit(user, Number(b.mother_id), ctx.trMap)) throw httpErr(403, 'Эрхгүй');
    if (b.spouse_id && !canEdit(user, Number(b.spouse_id), ctx.trMap)) throw httpErr(403, 'Эрхгүй');
    const { id, points } = await createMember(env, user, b);
    if (b.rel_as && Number(b.rel_id)) {
      await applyRel(env, user, ctx, id, normSex(b.sex), String(b.rel_as), Number(b.rel_id));
    }
    return json({ id, points });
  }

  // --- холбох ---
  if (path === '/api/link' && method === 'POST') {
    need();
    const ctx = await contextOf(user, env);
    const b = await readBody(req);
    // ШИНЭ гишүүн үүсгээд шууд холбох үед тэр гишүүн харагдах хүрээнд (vis)
    // ороогүй байдаг — тиймээс өөрийн үүсгэсэн гишүүнийг зөвшөөрнө.
    const meId = user.member_id || user.id;
    const seen = (m) => !!m && (ctx.vis.has(m.id) ||
      ctx.isAdmin || m.created_by === meId || m.created_by === user.id);
    if (b.kind === 'child') {
      const child_id = Number(b.child_id), parent_id = Number(b.parent_id);
      const as = b.as === 'mother' ? 'mother' : 'father';
      const child = ctx.members.find(x => x.id === child_id);
      const parent = ctx.members.find(x => x.id === parent_id);
      if (!seen(child) || !seen(parent)) {
        throw httpErr(404, 'Хоёр талын аль алиныг олсонгүй');
      }
      if (!canEdit(user, child_id, ctx.trMap)) throw httpErr(403, 'Холбох эрхгүй');
      if (isAncestor(ctx.rel, child_id, parent_id)) throw httpErr(400, 'Цикл үүсэхгүй: эцэг/эх нь өөрийн хүүхэд байж чадахгүй');
      const existing = await all(env, 'SELECT * FROM children WHERE child_id=?', child_id);
      if (as === 'father' && existing.some(e => e.father_id === parent_id)) throw httpErr(400, 'Аль хэдийн эцэгээр холбогдсон');
      if (as === 'mother' && existing.some(e => e.mother_id === parent_id)) throw httpErr(400, 'Аль хэдийн эхээр холбогдсон');
      await insert(env, `INSERT INTO children(father_id, mother_id, child_id, rel_type) VALUES(?,?,?,?)`,
        as === 'father' ? parent_id : null,
        as === 'mother' ? parent_id : null,
        child_id, String(b.rel_type || 'Төрсөн'));
      await audit(env, user, 'link', `${parent.name} → ${child.name} (${as === 'father' ? 'эцэг' : 'эх'})`);
      return json({ ok: true });
    }
    if (b.kind === 'spouse') {
      const a_id = Number(b.a_id), b_id = Number(b.b_id);
      const A = ctx.members.find(x => x.id === a_id), B = ctx.members.find(x => x.id === b_id);
      if (!seen(A) || !seen(B)) throw httpErr(404, 'Олдохгүй');
      if (!canEdit(user, a_id, ctx.trMap) && !canEdit(user, b_id, ctx.trMap)) {
        throw httpErr(403, 'Холбох эрхгүй');
      }
      if (a_id === b_id) throw httpErr(400, 'Өөртэйгөө холбож болохгүй');
      const dup = await get(env, 'SELECT * FROM unions WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)',
        a_id, b_id, b_id, a_id);
      if (dup) throw httpErr(400, 'Аль хэдийн холбогдсон');
      await insert(env, 'INSERT INTO unions(a_id, b_id) VALUES(?,?)', a_id, b_id);
      await audit(env, user, 'link', `${A.name} ⇄ ${B.name} (хань)`);
      return json({ ok: true });
    }
    throw httpErr(400, 'Буруу холбооны төрөл');
  }

  // Буруу холбосон хамаатныг УСТГАХ (эцэг/эх, хань, хүүхэд)
  if (path === '/api/link/delete' && method === 'POST') {
    need();
    // Буруу холбоос устгах нь зөвхөн админ/супер админд
    if (!(user.role === 'admin' || user.role === 'super')) {
      throw httpErr(403, 'Зөвхөн админ холбоос устгах боломжтой');
    }
    const ctx = await contextOf(user, env);
    const b = await readBody(req);
    const kind = String(b.kind || '');
    const id = Number(b.id);
    const other = Number(b.other_id);
    const A = ctx.members.find(x => x.id === id);
    const B = ctx.members.find(x => x.id === other);
    if (!A || !B) throw httpErr(404, 'Холбоос олдсонгүй');
    if (!canEdit(user, id, ctx.trMap)) throw httpErr(403, 'Устгах эрхгүй');
    if (kind === 'parent') {
      await run(env, 'DELETE FROM children WHERE child_id=? AND (father_id=? OR mother_id=?)', id, other, other);
      await audit(env, user, 'unlink', `${A.name} ⇠ ${B.name} (эцэг/эх)`);
      return json({ ok: true });
    }
    if (kind === 'child') {
      await run(env, 'DELETE FROM children WHERE child_id=? AND (father_id=? OR mother_id=?)', other, id, id);
      await audit(env, user, 'unlink', `${A.name} ⇢ ${B.name} (хүүхэд)`);
      return json({ ok: true });
    }
    if (kind === 'sibling') {
      // Ах/дүү нь ХАМТ эцэг/эхээс бодогддог тул: тухайн хүний (other) энэ хүнтэй
      // хамтдаг эцэг/эхийн холбоог л салгана — «Би» талын эцэг/эх хөндөгдөхгүй.
      if (!canEdit(user, id, ctx.trMap) && !canEdit(user, other, ctx.trMap)) {
        throw httpErr(403, 'Устгах эрхгүй');
      }
      const pA = ctx.rel.par.get(id) || new Set();
      const pB = ctx.rel.par.get(other) || new Set();
      const shared = [...pA].filter(x => pB.has(x));
      if (!shared.length) throw httpErr(400, 'Хамтдаг эцэг/эх олдсонгүй');
      for (const sp of shared) {
        await run(env, 'UPDATE children SET father_id=NULL WHERE child_id=? AND father_id=?', other, sp);
        await run(env, 'UPDATE children SET mother_id=NULL WHERE child_id=? AND mother_id=?', other, sp);
      }
      await run(env, 'DELETE FROM children WHERE child_id=? AND father_id IS NULL AND mother_id IS NULL', other);
      await audit(env, user, 'unlink', `${A.name} ⇹ ${B.name} (ах/дүү)`);
      return json({ ok: true });
    }
    if (kind === 'spouse') {
      await run(env, 'DELETE FROM unions WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)', id, other, other, id);
      await audit(env, user, 'unlink', `${A.name} ⇎ ${B.name} (хань)`);
      return json({ ok: true });
    }
    throw httpErr(400, 'Буруу холбоосын төрөл');
  }

  // --- дизайн ---
  if (path === '/api/design') {
    if (method === 'GET') {
      need();
      const d = await getDesign(env);
      return json({
        theme: d.theme, card: d.card, link1: d.link1, link2: d.link2, link3: d.link3,
        public_slug: d.public_slug, is_public: d.is_public,
        tg_set: !!d.tg_token, tg_chat: d.tg_chat, can_full: user.role === 'super'
      });
    }
    if (method === 'POST') {
      need();
      const isSuper = user.role === 'super';
      if (!isSuper && user.role !== 'admin') throw httpErr(403, 'Эрхгүй');
      const b = await readBody(req);
      const allowed = isSuper
        ? ['theme', 'card', 'link1', 'link2', 'link3', 'public_slug', 'is_public', 'tg_token', 'tg_chat']
        : ['tg_token', 'tg_chat']; // админ зөвхөн Telegram тохиргоо
      const patch = {};
      for (const k of allowed) if (k in b) patch[k] = b[k];
      if ('tg_token' in patch && !String(patch.tg_token).trim()) delete patch.tg_token;
      if ('tg_chat' in patch && !String(patch.tg_chat).trim()) delete patch.tg_chat;
      await setDesign(env, patch);
      await audit(env, user, 'design', Object.keys(patch).join(','));
      return json({ ok: true });
    }
  }

  // --- анхдагч дүрс (зураггүй хүмүүст) ---
  if (path === '/api/avatars' && method === 'GET') {
    const rows = await all(env, 'SELECT slot, url FROM default_avatars');
    const avatars = {};
    for (const r of rows) {
      if (!AVATAR_SLOTS.includes(r.slot) || !r.url) continue;
      // base64-ийг хариултад хийхгүй — 8 дүрс ~250KB болж, карт бүр дээр
      // дахин render болдог. Браузер зургийг тусад нь, кэштэй татна.
      avatars[r.slot] = /^data:image\//i.test(String(r.url))
        ? '/api/avatars/' + r.slot
        : r.url;
    }
    return json({ avatars });
  }
  let avm = path.match(/^\/api\/avatars\/([a-z_]+)$/);
  if (avm && AVATAR_SLOTS.includes(avm[1])) {
    if (method === 'GET') {
      const row = await get(env, 'SELECT url FROM default_avatars WHERE slot=?', avm[1]);
      const raw = String((row && row.url) || '');
      const m = raw.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
      if (!m) throw httpErr(404, 'Дүрс олдохгүй');
      const bytes = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
      return new Response(bytes, { headers: {
        'content-type': m[1],
        'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff'
      } });
    }
    needSuper(); // анхдагч дүрс — зөвхөн супер админ солино
    if (method === 'POST') {
      const b = await readBody(req);
      const url = normPhoto(b.url);
      if (!url) throw httpErr(400, 'Зураг шаардлагатай');
      await run(env, `INSERT INTO default_avatars(slot,url,updated_at) VALUES(?,?,datetime('now'))
        ON CONFLICT(slot) DO UPDATE SET url=excluded.url, updated_at=excluded.updated_at`, avm[1], url);
      await audit(env, user, 'avatar_set', avm[1]);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await run(env, 'DELETE FROM default_avatars WHERE slot=?', avm[1]);
      await audit(env, user, 'avatar_del', avm[1]);
      return json({ ok: true });
    }
  }

  // --- хэрэглэгч / эрх ---
  // --- Admin: модтой холбоогүй гишүүд + давхар нэрс ---
  if (path === '/api/admin/orphans' && method === 'GET') {
    needAdmin();
    const members = await all(env, `SELECT id, name, sex, birth_year, birth_date, phone, created_at
      FROM members ORDER BY id`);
    const children = await all(env, 'SELECT father_id, mother_id, child_id FROM children');
    const unions = await all(env, 'SELECT a_id, b_id FROM unions');
    const linked = new Set();
    for (const c of children) {
      if (c.father_id) linked.add(Number(c.father_id));
      if (c.mother_id) linked.add(Number(c.mother_id));
      if (c.child_id) linked.add(Number(c.child_id));
    }
    for (const u of unions) {
      if (u.a_id) linked.add(Number(u.a_id));
      if (u.b_id) linked.add(Number(u.b_id));
    }
    const slim = m => ({ id: m.id, name: m.name, sex: m.sex, birth_year: m.birth_year,
      birth_date: m.birth_date, phone: m.phone, created_at: m.created_at });
    const isolated = members.filter(m => !linked.has(Number(m.id))).map(slim);
    const nameById = new Map(members.map(m => [m.id, m.name || '']));
    const parInfo = new Map();
    for (const c of children) {
      const id = Number(c.child_id);
      if (!id) continue;
      if (!parInfo.has(id)) parInfo.set(id, { f: null, m: null });
      const p = parInfo.get(id);
      if (c.father_id) p.f = Number(c.father_id);
      if (c.mother_id) p.m = Number(c.mother_id);
    }
    const normName = (v) => String(v || '').toLowerCase()
      .replace(/[.,·]/g, ' ').replace(/\s+/g, ' ').trim();
    const givenOf = (v) => {
      const a = normName(v).split(' ').filter(Boolean);
      return a.length ? a[a.length - 1] : '';
    };
    // Эцэг/эхийн нэрийг инициал, цэг таслалаас үл хамааруулж харьцуулна:
    // «Баярсайхан» = «Б.Баярсайхан», «Эрдэнэчимэг» = «Н.Эрдэнэчимэг».
    const normParentName = (v) => {
      const a = normName(v).split(' ').filter(Boolean);
      const full = a.filter(x => x.length > 1);
      return full.length ? full[full.length - 1] : (a[0] || '');
    };
    const parentSig = (id) => {
      const p = parInfo.get(Number(id));
      if (!p) return '';
      const f = p.f ? normParentName(nameById.get(p.f)) : '';
      const m = p.m ? normParentName(nameById.get(p.m)) : '';
      return (f || m) ? f + '|' + m : '';
    };
    const parentLabel = (id) => {
      const p = parInfo.get(Number(id));
      if (!p || (!p.f && !p.m)) return 'эцэг/эх тодорхойгүй';
      return [p.f ? 'аав: ' + (nameById.get(p.f) || ('#' + p.f)) : '',
        p.m ? 'ээж: ' + (nameById.get(p.m) || ('#' + p.m)) : ''].filter(Boolean).join(' · ');
    };
    const yearOf = (m) => {
      const bd = String(m.birth_date || '').match(/^(\d{4})/);
      if (bd) return bd[1];
      const by = String(m.birth_year || '').match(/\d{4}/);
      return by ? by[0] : '';
    };
    // Ижил нэр + ижил төрсөн он + эцэг/эхийн нэр ижил — л давхар гэж үзнэ.
    // Эцэг/эх нь өөр бол ижил нэртэй ч өөр хүн (жишээ нь олон «Баярсайхан»).
    const byName = new Map();
    for (const m of members) {
      const nm = String(m.name || '').trim();
      if (!nm) continue;
      const k = nm + '\u0000' + yearOf(m) + '\u0000' + parentSig(m.id);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(m);
    }
    const duplicates = [...byName.values()]
      // Зөвхөн ижил нэр гэдгээр бус, төрсөн он эсвэл эцэг/эхийн нэр
      // бас таарсан үед л давхар гэж үзнэ.
      .filter(arr => arr.length > 1 && (yearOf(arr[0]) || parentSig(arr[0].id)))
      .map(arr => ({
        name: String(arr[0].name || '').trim(),
        year: yearOf(arr[0]),
        parent: parentLabel(arr[0].id),
        members: arr.map(m => ({ ...slim(m), linked: linked.has(Number(m.id)) }))
      }))
      .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));

    // Нэрний бичиглэл өөр (Мягмардож / Мягмардорж) ч эцэг/эхийн нэр,
    // төрсөн он ижил байвал давхар байж болзошгүй.
    const lev = (a, b) => {
      const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        let prev = d[0];
        d[0] = i;
        for (let j = 1; j <= b.length; j++) {
          const tmp = d[j];
          d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
          prev = tmp;
        }
      }
      return d[b.length];
    };
    const buckets = new Map();
    for (const m of members) {
      const given = givenOf(m.name);
      const year = yearOf(m);
      const psig = parentSig(m.id);
      if (!given || !year || !psig) continue; // эцэг/эх тодорхойгүй бол таамаглахгүй
      const k = year + '\u0000' + psig;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(m);
    }
    const similar = [];
    for (const [k, arr] of buckets) {
      const year = k.split('\u0000')[0];
      const groups = [];
      for (const m of arr) {
        const given = givenOf(m.name);
        let grp = groups.find(x => x.given === given ||
          (given.length >= 5 && x.given.length >= 5 && lev(given, x.given) <= 1));
        if (!grp) { grp = { given, members: [] }; groups.push(grp); }
        grp.members.push(m);
      }
      for (const grp of groups) {
        if (grp.members.length < 2) continue;
        if (new Set(grp.members.map(m => normName(m.name))).size < 2) continue;
        similar.push({
          given: grp.given, year,
          parent: parentLabel(grp.members[0].id),
          reason: 'ижил эцэг/эхийн нэр',
          members: grp.members.map(m => ({ ...slim(m), linked: linked.has(Number(m.id)) }))
        });
      }
    }
    similar.sort((a, b) => b.members.length - a.members.length || a.given.localeCompare(b.given));
    return json({ total: members.length, isolated, duplicates, similar });
  }
  if (path === '/api/users' && method === 'GET') {
    needAdmin();
    const rows = await all(env, 'SELECT * FROM users ORDER BY id');
    const mems = await all(env, 'SELECT id, name FROM members');
    const mmap = new Map(mems.map(x => [x.id, x.name]));
    return json({
      users: rows.map(u => ({
        id: u.id, phone: u.phone, name: u.name, role: u.role,
        member_id: u.member_id || null, member_name: u.member_id ? (mmap.get(u.member_id) || null) : null
      })),
      members: sortMembers(mems).map(x => ({ id: x.id, name: x.name, birth_year: '' }))
    });
  }
  mm = path.match(/^\/api\/users\/(\d+)\/(role|link|reset-code|delete)$/);
  if (mm && method === 'POST') {
    const uid = Number(mm[1]);
    if (mm[2] === 'delete') {
      needSuper(); // зөвхөн супер админ хэрэглэгч устгана
      const target = await get(env, 'SELECT * FROM users WHERE id=?', uid);
      if (!target) throw httpErr(404, 'Хэрэглэгч олдохгүй');
      if (target.id === user.id) throw httpErr(400, 'Өөрийн бүртгэлээ устгах боломжгүй');
      if (target.role === 'super') {
        const cnt = await get(env, 'SELECT COUNT(*) AS c FROM users WHERE role=?', 'super');
        if (cnt && cnt.c <= 1) throw httpErr(400, 'Сүүлийн супер админыг устгах боломжгүй');
      }
      await run(env, 'DELETE FROM link_requests WHERE user_id=?', uid);
      await run(env, 'DELETE FROM otps WHERE phone=?', target.phone);
      await run(env, 'DELETE FROM users WHERE id=?', uid);
      await audit(env, user, 'delete_user', `${target.phone} (${target.name || 'нэргүй'})`);
      return json({ ok: true });
    }
    if (mm[2] === 'reset-code') {
      needAdmin(); // Том/Жижиг админ шинэ код өгнө
      const target = await get(env, 'SELECT * FROM users WHERE id=?', uid);
      if (!target) throw httpErr(404, 'Хэрэглэгч олдохгүй');
      const code = makeCode();
      await issueOtp(env, target.phone, code, 'admin', 30 * 60000);
      await audit(env, user, 'reset_code', `#${uid} → ${target.phone.slice(0, 4)}****`);
      return json({ ok: true, code });
    }
    if (mm[2] === 'role') {
      needSuper();
      const b = await readBody(req);
      const role = ['member', 'coord', 'admin', 'super'].includes(b.role) ? b.role : 'member';
      const target = await get(env, 'SELECT * FROM users WHERE id=?', uid);
      if (!target) throw httpErr(404, 'Хэрэглэгч олдохгүй');
      if (target.role === 'super' && role !== 'super') {
        const cnt = await get(env, 'SELECT COUNT(*) AS c FROM users WHERE role=?', 'super');
        if (cnt && cnt.c <= 1) throw httpErr(400, 'Сүүлийн супер админыг бууруулж болохгүй');
      }
      await run(env, 'UPDATE users SET role=? WHERE id=?', role, uid);
      await audit(env, user, 'role', `${target.phone} → ${role}`);
      return json({ ok: true });
    }
    if (mm[2] === 'link') {
      needAdmin();
      const b = await readBody(req);
      const mid = b.member_id ? Number(b.member_id) : null;
      if (mid) {
        const mem = await get(env, 'SELECT * FROM members WHERE id=?', mid);
        if (!mem) throw httpErr(404, 'Карт олдохгүй');
      }
      await run(env, 'UPDATE users SET member_id=? WHERE id=?', mid, uid);
      await audit(env, user, 'link_user', `#${uid} → карт ${mid || 'байхгүй'}`);
      return json({ ok: true });
    }
  }

  // --- карт холбох хүсэлт: хэрэглэгч модон дээрх бүх нэрээс өөрийн нэрээ сонгож илгээнэ ---
  if (path === '/api/link-requests/members' && method === 'GET') {
    need();
    // Ижил нэртэй хүмүүсийг ялгахын тулд аавын нэрийг (эцгийн нэр) хамт буцаана.
    const mems = await all(env, `SELECT m.id, m.name, m.birth_year, m.birth_date, m.sex, m.alive,
      m.photo,
      (SELECT f.name FROM children c JOIN members f ON f.id = c.father_id
        WHERE c.child_id = m.id AND c.father_id IS NOT NULL ORDER BY c.id LIMIT 1) AS father_name
      FROM members m`);
    // Зургийн өгөгдлийг өөрөө биш, зөвхөн БАЙГАА эсэхийг буцаана (хариу хөнгөн байх ёстой)
    return json({ members: sortMembers(mems).map(x => ({
      id: x.id, name: x.name, birth_year: x.birth_year, birth_date: x.birth_date,
      sex: x.sex, alive: x.alive, photo: !!x.photo,
      pat: x.father_name ? genitiveName(x.father_name) : ''
    })) });
  }
  if (path === '/api/link-requests' && method === 'GET') {
    needAdmin();
    const rows = await all(env, `SELECT r.id, r.user_id, r.member_id, r.created_at, r.status,
      u.name AS uname, u.phone, m.name AS card_name
      FROM link_requests r JOIN users u ON u.id = r.user_id
      LEFT JOIN members m ON m.id = r.member_id
      WHERE r.status = 'pending' ORDER BY r.id`);
    return json({ requests: rows });
  }
  if (path === '/api/link-requests' && method === 'POST') {
    need();
    if (user.member_id) throw httpErr(400, 'Таны карт аль хэдийн модтой холбогдсон байна');
    const b = await readBody(req);
    const mid = Number(b.member_id);
    const mem = await get(env, 'SELECT * FROM members WHERE id=?', mid);
    if (!mem) throw httpErr(404, 'Карт олдохгүй');
    await run(env, "DELETE FROM link_requests WHERE user_id=? AND status='pending'", user.id);
    await insert(env, 'INSERT INTO link_requests(user_id, member_id) VALUES(?,?)', user.id, mid);
    await audit(env, user, 'link_request', `${mem.name} (#${mid}) руу хүсэлт илгээсэн`);
    // Карт холбох хүсэлт → админы утсанд мэдэгдэл
    try { await notifyAdmins(env, '📇 Карт холбох хүсэлт', `${user.name || user.phone} → «${mem.name}»`, '/?req=1'); } catch (e) {}
    return json({ ok: true });
  }
  const lr = path.match(/^\/api\/link-requests\/(\d+)\/(approve|reject)$/);
  if (lr && method === 'POST') {
    needAdmin();
    const rid = Number(lr[1]);
    const act = lr[2];
    const row = await get(env, "SELECT * FROM link_requests WHERE id=? AND status='pending'", rid);
    if (!row) throw httpErr(404, 'Хүсэлт олдохгүй эсвэл аль хэдийн шийдэгдсэн');
    const u = await get(env, 'SELECT * FROM users WHERE id=?', row.user_id);
    const m = await get(env, 'SELECT * FROM members WHERE id=?', row.member_id);
    if (!u || !m) throw httpErr(404, 'Хэрэглэгч эсвэл карт олдохгүй');
    if (act === 'reject') {
      await run(env, "UPDATE link_requests SET status='rejected', handled_by=?, handled_at=datetime('now') WHERE id=?",
        user.id, rid);
      await audit(env, user, 'link_reject', `${u.name || u.phone} → ${m.name} (татгалзсан)`);
      return json({ ok: true, status: 'rejected' });
    }
    await run(env, 'UPDATE users SET member_id=? WHERE id=?', row.member_id, row.user_id);
    await run(env, "UPDATE link_requests SET status='approved', handled_by=?, handled_at=datetime('now') WHERE id=?",
      user.id, rid);
    await run(env, "UPDATE link_requests SET status='superseded', handled_by=?, handled_at=datetime('now') WHERE user_id=? AND status='pending'",
      user.id, row.user_id);
    await audit(env, user, 'link_approve', `${u.name || u.phone} → ${m.name} (хүсэлт батлагдлаа)`);
    return json({ ok: true, status: 'approved' });
  }

  // --- Web Push: админд утасны мэдэгдэл (шинэ бүртгэл / карт холбох хүсэлт) ---
  if (path === '/api/push/key' && method === 'GET') {
    need();
    const key = await pushPublicKey(env);
    return json({ key, enabled: !!key });
  }
  if (path === '/api/push/subscribe' && method === 'POST') {
    need();
    const b = await readBody(req);
    const endpoint = String(b.endpoint || '');
    const keys = b.keys || {};
    if (!/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) throw httpErr(400, 'Push subscription буруу байна');
    await run(env, `INSERT INTO push_subs(user_id, endpoint, p256dh, auth) VALUES(?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`,
      user.id, endpoint, String(keys.p256dh), String(keys.auth));
    return json({ ok: true });
  }

  // --- 🎂 Төрсөн өдрийн мэдэгдэл: апп нээгдэхэд нэг удаа шалгуулна ---
  if (path === '/api/birthday/notify' && method === 'POST') {
    const r = await sendDailyPush(env);
    return json({ ok: true, ...r });
  }
  // --- Web Push: төлөв ба туршилт (админ өөрөө шалгах) ---
  if (path === '/api/push/status' && method === 'GET') {
    needAdmin();
    const key = await pushPublicKey(env);
    let subs = 0, mine = 0, thisDevice = null;
    try {
      const a = await get(env, 'SELECT COUNT(*) AS c FROM push_subs');
      subs = (a && a.c) || 0;
      const m = await get(env, 'SELECT COUNT(*) AS c FROM push_subs WHERE user_id=?', user.id);
      mine = (m && m.c) || 0;
      // Тухайн PWA/төхөөрөмжийн subscription серверт бүртгэгдсэн эсэх.
      const ep = url.searchParams.get('endpoint');
      if (ep) {
        const t = await get(env, 'SELECT id FROM push_subs WHERE user_id=? AND endpoint=?', user.id, ep);
        thisDevice = !!t;
      }
    } catch (e) { /* хүснэгт хараахан үүсээгүй */ }
    return json({ keyConfigured: !!key, subs, mine, thisDevice });
  }
  if (path === '/api/push/test' && method === 'POST') {
    needAdmin();
    const subs = await all(env, 'SELECT id, endpoint, p256dh, auth FROM push_subs WHERE user_id=?', user.id);
    const results = [];
    for (const sb of subs) {
      let host = '';
      try { host = new URL(sb.endpoint).host; } catch (e) { host = '?'; }
      try {
        const r = await sendPush(env, sb, { title: '🔔 iFamily — туршилт', body: 'Мэдэгдэл ажиллаж байна', url: '/', tag: 'ifamily-test' });
        results.push({ host, ok: r.ok, status: r.status || 0, gone: !!r.gone });
        if (r.gone) await run(env, 'DELETE FROM push_subs WHERE id=?', sb.id);
      } catch (e) {
        results.push({ host, ok: false, status: 0, error: String(e.message || e) });
      }
    }
    return json({ subs: subs.length, results });
  }

  // --- Excel bulk import ---
  if (path === '/api/import' && method === 'POST') {
    needAdmin();
    const b = await readBody(req);
    return json(await handleImport(env, user, b.rows || []));
  }

  // --- Excel экспорт (админ): бүх бүртгэгдсэн хүний мэдээлэл ---
  if (path === '/api/export.xlsx' && method === 'GET') {
    needSuper();   // backup файлууд — зөвхөн супер админ
    const ctx = await contextOf(user, env);
    const bytes = xlsxBytes(ctx);
    const fn = "i-family-members-" + new Date().toISOString().slice(0, 10) + ".xlsx";
    return new Response(bytes, { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": "attachment; filename=\"" + fn + "\"",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "pragma": "no-cache", "expires": "0", "vary": "Cookie"
    } });
  }

  // --- БҮРЭН ZIP (супер админ): дата + Excel + CSV + D1 схем + тайлбар нэг файлаар ---
  if (path === '/api/export.zip' && method === 'GET') {
    needSuper();   // backup файлууд — зөвхөн супер админ
    const ctx = await contextOf(user, env);
    const data = await backupData(env);
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const stamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '');
    const escCell = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const csv = (rows, cols) => '\uFEFF' + [cols.join(',')]
      .concat(rows.map(r => cols.map(c => escCell(r[c])).join(','))).join('\r\n');
    const nm = new Map(ctx.members.map(m => [m.id, m.name || '']));
    const chRows = data.children.map(c => ({
      id: c.id, child_id: c.child_id, child: nm.get(c.child_id) || '',
      father_id: c.father_id, father: nm.get(c.father_id) || '',
      mother_id: c.mother_id, mother: nm.get(c.mother_id) || '',
      rel_type: c.rel_type || '', created_at: c.created_at || ''
    }));
    const unRows = data.unions.map(u => ({
      id: u.id, a_id: u.a_id, a: nm.get(u.a_id) || '', b_id: u.b_id, b: nm.get(u.b_id) || '',
      status: u.status || '', created_at: u.created_at || ''
    }));
    const sql = '-- iFamily D1 схем (' + day + ')\n' + SCHEMA +
      '\n\n-- migrations (байвал алгасна)\n' + MIGRATIONS.map(m => '/* try */ ' + m + ';').join('\n') + '\n';
    const readme = [
      'iFamily — бүрэн багц (' + day + ')',
      '',
      'Файлууд:',
      '  ifamily-backup-' + day + '.json  — БҮРЭН backup (members, children, unions, users,',
      '      audit, field_scores, member_photos, member_events, albums, link_requests, design,',
      '      default_avatars, photo_comments, push_subs, layout_locks, score_ranks).',
      '      Апп дотор Админ → Restore-оор буцааж оруулна (format: i-family-backup-v1).',
      '  i-family-members-' + day + '.xlsx — модны Excel хувилбар.',
      '  members.csv / children.csv / unions.csv / users.csv — Excel-д нээгдэх хүснэгтүүд.',
      '  D1-SCHEMA.sql — Cloudflare D1 баазын бүрэн схем (18 хүснэгт).',
      '  photos/ — гишүүдийн зургууд (member_<гишүүн>_<зураг>.<ext>).',
      '  member-photos.csv — зураг бүрийн ID, гишүүн, ZIP файл, эх URL.',
      '  avatars/ — анхдагч дүрсүүд (slot.jpg эсвэл slot.png).',
      '  site/ — САЙТЫН БҮХ ЭХ КОД: index.html (ажиллаж байгаа хуудасны HTML),',
      '      src/ (app.js, ui.js, tree.js, fulltree.js, db.js, zip.js ...), public/',
      '      (tree_client.js, sw.js, manifest, splash/), package.json, wrangler.jsonc,',
      '      site-manifest.json, server.js, тестүүд болон бүх зураг.',
      '  default-avatars.csv — слот бүрийн ZIP файл, шинэчлэгдсэн огноо.',
      '',
      'Одоогийн тоо: ' + JSON.stringify(data.counts),
      '',
      'D1 гэж юу вэ: Cloudflare D1 (SQLite) дээр бүх гэр бүлийн өгөгдөл хадгалагдана. Worker',
      'env.DB-ээр prepared statement явуулж уншина/бичнэ. Схемыг src/db.js initDb() автоматаар',
      'үүсгэдэг. Preview болон Production нь тусдаа D1-тэй.',
      '',
      'Энэ файлыг ямар ч үед Админ → «Бүрэн ZIP»-ээр дахин татаж болно (үргэлж шинэ дата).'
    ].join('\n');
    const files = [
      { name: 'ifamily-backup-' + day + '.json', data: JSON.stringify(data, null, 2) },
      { name: 'i-family-members-' + day + '.xlsx', data: xlsxBytes(ctx) },
      { name: 'members.csv', data: csv(data.members, ['id','name','sex','birth_year','birth_date','death_date','birth_place','clan','alive','phone','bio','honors','emoji','created_by','created_at']) },
      { name: 'children.csv', data: csv(chRows, ['id','child_id','child','father_id','father','mother_id','mother','rel_type','created_at']) },
      { name: 'unions.csv', data: csv(unRows, ['id','a_id','a','b_id','b','status','created_at']) },
      { name: 'users.csv', data: csv(data.users, ['id','phone','name','role','member_id','created_at']) },
      { name: 'D1-SCHEMA.sql', data: sql },
      { name: 'README.txt', data: readme }
    ];
    // Гишүүдийн зургуудыг ZIP доторх photos/ хавтас руу нэмнэ:
    //  • data:image/...;base64 — шууд decode хийнэ
    //  • https://... — татаж оруулна (алдаа/хэт том бол алгасна)
    const photoRows = [];
    const extOf = (u) => {
      const d = /^data:image\/(png|jpe?g|gif|webp)/i.exec(u);
      const f = /\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.exec(u);
      const e = ((d && d[1]) || (f && f[1]) || 'jpg').toLowerCase();
      return e === 'jpeg' ? 'jpg' : e;
    };
    for (const ph of (data.member_photos || [])) {
      const url = String(ph.url || '').trim();
      if (!url) continue;
      const fname = 'photos/member_' + ph.member_id + '_' + ph.id + '.' + extOf(url);
      let bytes = null;
      try {
        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
          const bin = atob(url.slice(url.indexOf(',') + 1));
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else if (/^https?:\/\//i.test(url)) {
          const r = await fetch(url);
          if (r.ok) {
            const buf = new Uint8Array(await r.arrayBuffer());
            if (buf.length && buf.length <= 8 * 1024 * 1024) bytes = buf;
          }
        }
      } catch (e) { bytes = null; }
      if (bytes) files.push({ name: fname, data: bytes });
      photoRows.push({ id: ph.id, member_id: ph.member_id, file: bytes ? fname : '', url });
    }
    if (photoRows.length) {
      files.push({ name: 'member-photos.csv', data: csv(photoRows, ['id','member_id','file','url']) });
    }
    // Анхдагч дүрсүүд (админы оруулсан 8 слот) — avatars/ хавтас руу:
    const avRows = [];
    for (const av of (data.default_avatars || [])) {
      if (!AVATAR_SLOTS.includes(av.slot)) continue;
      const url = String(av.url || '').trim();
      if (!url) continue;
      const fname = 'avatars/' + av.slot + '.' + extOf(url);
      let bytes = null;
      try {
        if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(url)) {
          const bin = atob(url.slice(url.indexOf(',') + 1));
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } else if (/^https?:\/\//i.test(url)) {
          const r = await fetch(url);
          if (r.ok) {
            const buf = new Uint8Array(await r.arrayBuffer());
            if (buf.length && buf.length <= 8 * 1024 * 1024) bytes = buf;
          }
        }
      } catch (e) { bytes = null; }
      if (bytes) files.push({ name: fname, data: bytes });
      avRows.push({ slot: av.slot, file: bytes ? fname : '', updated_at: av.updated_at || '' });
    }
    if (avRows.length) {
      files.push({ name: 'default-avatars.csv', data: csv(avRows, ['slot','file','updated_at']) });
    }
    // --- САЙТЫН БҮХ ЭХ КОД -> ZIP доторх site/ хавтас ---
    // Текст файлууд (src/, public/, package.json, wrangler.jsonc, D1-SCHEMA.sql,
    // тестүүд ...) нь build үед src/source_bundle.js-д орсон байдаг.
    // Зураг зэрэг хоёртын файлыг ASSETS-ээс шууд уншина.
    for (const f of SOURCE_TEXT) files.push({ name: 'site/' + f.path, data: f.text });
    const dbgBin = [];
    for (const p of SOURCE_BIN) {
      try {
        // ASSETS нь public/-ыг үндэс болгодог тул уг префиксийг хасна.
        // Эхлээд сайтын өөрийн URL-аас, болохгүй бол ASSETS binding-ээс уншина.
        const u = new URL('/' + p.replace(/^public\//, ''), req.url).toString();
        let r = null;
        try { r = await fetch(u); } catch (e) { r = null; }
        if ((!r || !r.ok) && env.ASSETS) {
          try { r = await env.ASSETS.fetch(u); } catch (e) { r = null; }
        }
        if (r && r.ok) files.push({ name: 'site/' + p, data: new Uint8Array(await r.arrayBuffer()) });
      } catch (e) { dbgBin.push(p + ':ERR ' + String(e && e.message || e)); }
    }
    // index.html — ажиллаж байгаа хуудасны бодит HTML хувилбар
    try {
      const r0 = await fetch(new URL('/', req.url), {
        headers: { cookie: req.headers.get('cookie') || '' }
      });
      if (r0.ok) files.push({ name: 'site/index.html', data: await r0.text() });
    } catch (e) { /* алгасна */ }
    const zip = makeZip(files);
    await audit(env, user, 'backup_zip', JSON.stringify(data.counts));
    return new Response(zip, { headers: {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="ifamily-FULL-' + stamp + '.zip"',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      'pragma': 'no-cache', 'expires': '0', 'vary': 'Cookie'
    } });
  }

  // --- Бүрэн restore (админ): backup JSON-оос бүх өгөгдлийг сэргээнэ ---
  if (path === '/api/restore' && method === 'POST') {
    needAdmin();
    const b = await readBody(req);
    if (!b || b.format !== 'i-family-backup-v1') throw httpErr(400, 'Backup файл биш байна (format: i-family-backup-v1)');
    const CLEAR = ['member_events', 'member_photos', 'album_photos', 'albums', 'field_scores',
      'link_requests', 'children', 'unions', 'members', 'design',
      'default_avatars', 'photo_comments', 'score_ranks', 'layout_locks'];
    if (b.clear) {
      for (const t of CLEAR) { try { await run(env, 'DELETE FROM ' + t); } catch (e) {} }
    }
    const restored = {};
    // ① ХЭРЭГЛЭГЧДИЙН БҮРТГЭЛ эхэлж — бусад хүснэгтийн user_id-г утсаар
    // хөрвүүлэхэд хэрэгтэй. Backup нь ХУУЧИН баазын user id-г агуулдаг тул
    // шинэ бааз дээр (id дахин дугаарлагдсан) оноо БУРУУ хүнд оноогддог байв.
    const idMap = {};   // хуучин user.id → шинэ user.id
    let linked = 0;
    for (const u of (b.users || [])) {
      const phone = String(u && u.phone || '').replace(/\D/g, '');
      if (!phone) continue;
      try {
        const ex = await get(env, 'SELECT id FROM users WHERE phone=?', phone);
        let nid = ex && ex.id;
        if (ex) {
          if (u.password && u.salt) {
            await run(env, 'UPDATE users SET name=?, role=?, member_id=?, password=?, salt=? WHERE id=?',
              u.name || '', u.role || 'member', u.member_id || null, u.password, u.salt, ex.id);
          } else {
            // Backup-д хэш байхгүй бол БАЙГАА нууц үгийг устгахгүй
            await run(env, 'UPDATE users SET name=?, role=?, member_id=? WHERE id=?',
              u.name || '', u.role || 'member', u.member_id || null, ex.id);
          }
        } else {
          nid = await insert(env, 'INSERT INTO users(phone, name, role, member_id, password, salt) VALUES(?,?,?,?,?,?)',
            phone, u.name || '', u.role || 'member', u.member_id || null,
            u.password || null, u.salt || null);
        }
        if (u.id != null && nid) idMap[Number(u.id)] = Number(nid);
        linked++;
      } catch (e) { /* нэг хэрэглэгч алдаатай бол бусдыг үргэлжлүүлнэ */ }
    }
    restored.users = linked;
    // ② Бусад хүснэгт — user_id/viewer_id-г шинэ id рүү хөрвүүлж бичнэ.
    // Хуучин бааз дээр ч байгаагүй (устсан) хэрэглэгчийн мөр = алгасна
    // (хуучин сайт дээр ч тэр оноо хэнд ч харагдахгүй байсан).
    const USERREF = {
      field_scores: 'user_id', link_requests: 'user_id', push_subs: 'user_id',
      score_ranks: 'user_id', photo_comments: 'user_id', layout_locks: 'viewer_id'
    };
    for (const t of ['design', 'members', 'children', 'unions', 'field_scores', 'albums',
      'album_photos', 'member_photos', 'member_events', 'link_requests',
      'default_avatars', 'photo_comments', 'score_ranks', 'layout_locks']) {
      const col = USERREF[t];
      let rows = b[t];
      if (!Array.isArray(rows) || !rows.length) { restored[t] = 0; continue; }
      let orphan = 0;
      if (col) {
        rows = rows.map(r => {
          if (!Object.prototype.hasOwnProperty.call(r, col)) return r;
          const nid = idMap[Number(r[col])];
          if (nid == null) { orphan++; return null; }
          return { ...r, [col]: nid };
        }).filter(Boolean);
      }
      const mk = (r) => {
        const cols = Object.keys(r);
        return env.DB.prepare('INSERT OR REPLACE INTO ' + t + '(' + cols.join(',') + ') VALUES(' +
          cols.map(() => '?').join(',') + ')').bind(...cols.map(c => r[c]));
      };
      let ok = 0, skipped = 0;
      for (let i = 0; i < rows.length; i += 40) {
        const chunk = rows.slice(i, i + 40);
        try { await env.DB.batch(chunk.map(mk)); ok += chunk.length; }
        catch (e) {
          for (const r of chunk) { try { await mk(r).run(); ok++; } catch (e2) { skipped++; } }
        }
      }
      restored[t] = ok;
      if (skipped) restored[t + '_skipped'] = skipped;
      if (orphan) restored[t + '_orphan'] = orphan;
    }
    await audit(env, user, 'restore', JSON.stringify(restored));
    return json({ ok: true, restored, linked });
  }

  // --- Бүрэн backup (супер админ) ---
  if (path === '/api/backup' && method === 'GET') {
    needSuper();   // backup файлууд — зөвхөн супер админ
    const data = await backupData(env);
    await audit(env, user, 'backup', `татсан: ${JSON.stringify(data.counts)}`);
    const fname = 'ifamily-backup-' + new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '') + '.json';
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': 'attachment; filename="' + fname + '"',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'pragma': 'no-cache', 'expires': '0', 'vary': 'Cookie'
      }
    });
  }

  // --- аудит ---
  if (path === '/api/audit' && method === 'GET') {
    needAdmin();
    const rows = await all(
      env,
      `SELECT a.*, u.name AS uname, u.phone AS uphone FROM audit a
       LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100`
    );
    return json({ rows });
  }

  // --- сануулга ---
  if (path === '/api/reminders' && method === 'GET') {
    need();
    const ctx = await contextOf(user, env);
    return json(await remindersFor(ctx, Number(url.searchParams.get('page')) || 1,
      url.searchParams.get('past') === '1', Number(url.searchParams.get('limit')) || 0));
  }

  // --- цомог ---
  if (path === '/api/albums' && method === 'GET') {
    need();
    const rows = await all(env, 'SELECT * FROM albums ORDER BY id DESC');
    const out = [];
    for (const a of rows) {
      if (await albumAccess(user, a)) {
        const cnt = await get(env, 'SELECT COUNT(*) AS c FROM album_photos WHERE album_id=?', a.id);
        out.push({ id: a.id, owner_id: a.owner_id, title: a.title, visibility: a.visibility, photos: (cnt && cnt.c) || 0 });
      }
    }
    return json({ albums: out });
  }
  if (path === '/api/albums' && method === 'POST') {
    need();
    const b = await readBody(req);
    if (!user.member_id) throw httpErr(403, 'Картгүй хэрэглэгч цомог үүсгэх эрхгүй');
    const vis = ['all', 'private', 'circle'].includes(b.visibility) ? b.visibility : 'all';
    const id = await insert(env, 'INSERT INTO albums(owner_id, title, visibility, members) VALUES(?,?,?,?)',
      user.member_id, String(b.title || 'Цомог').trim(), vis, JSON.stringify(b.members || []));
    await audit(env, user, 'album_create', `#${id} ${b.title || ''}`);
    return json({ id });
  }
  mm = path.match(/^\/api\/albums\/(\d+)(\/photos)?$/);
  if (mm && method === 'GET') {
    need();
    const id = Number(mm[1]);
    const a = await get(env, 'SELECT * FROM albums WHERE id=?', id);
    if (!a) throw httpErr(404, 'Цомог олдохгүй');
    if (!(await albumAccess(user, a))) throw httpErr(403, 'Харах эрхгүй');
    const photos = await all(env, 'SELECT * FROM album_photos WHERE album_id=? ORDER BY id', id);
    return json({ album: { id: a.id, title: a.title, visibility: a.visibility, owner_id: a.owner_id }, photos });
  }
  if (mm && method === 'POST' && mm[2] === '/photos') {
    need();
    const id = Number(mm[1]);
    const a = await get(env, 'SELECT * FROM albums WHERE id=?', id);
    if (!a) throw httpErr(404, 'Цомог олдохгүй');
    if (!(await albumAccess(user, a))) throw httpErr(403, 'Нэмэх эрхгүй');
    if (a.owner_id !== user.member_id && user.role !== 'super' && user.role !== 'admin') {
      throw httpErr(403, 'Зөвхөн эзэн нэмнэ');
    }
    const b = await readBody(req);
    const url2 = String(b.url || '').trim();
    if (!url2) throw httpErr(400, 'Зураг нэмэх шаардлагатай');
    await insert(env, 'INSERT INTO album_photos(album_id, url, caption) VALUES(?,?,?)',
      id, url2, String(b.caption || '').trim());
    return json({ ok: true });
  }

  // --- түвшин ахих мэдэгдэл (нүүр хуудсанд нэг удаа) ---
  if (path === '/api/level-up' && method === 'GET') {
    need();
    return json({ levelUp: await levelUpFor(env, user) });
  }
  if (path === '/api/level-seen' && method === 'POST') {
    need();
    const b = await readBody(req);
    return json({ ok: true, n: await markLevelSeen(env, user, b.n) });
  }

  // --- оноо / түвшин / лидерүүд ---
  if (path === '/api/scores' && method === 'GET') {
    need();
    const ctx = await contextOf(user, env);
    return json(await scoresPayload(env, user, ctx, canEdit));
  }

  // --- Оноо тэнцүүлэх (админ): хэрэглэгчийн нийт оноог тогтмол утгад тааруулна ---
  // «legacy_bonus» бичлэгээр зөрүүг нөхнө — дүрэм, 200 хязгаарт нөлөөлөхгүй,
  // «Миний бүртгэл»-д «Өмнөх бүртгэлээс шилжүүлсэн оноо» гэж бичлэг хэлбэрээр харагдана.
  if (path === '/api/score-set' && method === 'POST') {
    needAdmin();
    const b = await readBody(req);
    const phone = String(b.phone || '').replace(/\D/g, '');
    const target = Math.round(Number(b.target));
    if (!phone || !Number.isFinite(target)) throw httpErr(400, 'Утасны дугаар болон оноо шаардлагатай');
    const u = await get(env, 'SELECT * FROM users WHERE phone=?', phone);
    if (!u) throw httpErr(404, 'Энэ дугаартай хэрэглэгч олдсонгүй');
    const sum = await get(env, 'SELECT COALESCE(SUM(points),0) AS s FROM field_scores WHERE user_id=?', u.id);
    const before = Number(sum && sum.s) || 0;
    const prev = await get(env, "SELECT * FROM field_scores WHERE user_id=? AND field_key LIKE 'legacy_bonus%'", u.id);
    const others = before - (prev ? Number(prev.points) || 0 : 0);
    const bonus = target - others;
    if (prev) await run(env, "UPDATE field_scores SET points=?, created_at=datetime('now') WHERE id=?", bonus, prev.id);
    else {
      const mid = u.member_id || -u.id;
      const clash = await get(env, "SELECT id FROM field_scores WHERE member_id=? AND field_key='legacy_bonus'", mid);
      const key = clash ? 'legacy_bonus_' + u.id : 'legacy_bonus';
      await run(env, 'INSERT INTO field_scores(member_id, field_key, user_id, points) VALUES(?,?,?,?)', mid, key, u.id, bonus);
    }
    const after = others + bonus;
    await audit(env, user, 'score_set', phone + ': ' + before + ' -> ' + after + ' (нэмэлт ' + bonus + ')');
    return json({ ok: true, phone, before, after, bonus });
  }

  // --- гишүүний нэмэлт зураг / огноотой үйл явдал (оноотой) ---
  mm = path.match(/^\/api\/members\/(\d+)\/(photos|events)$/);
  if (mm && method === 'POST') {
    need();
    const id = Number(mm[1]);
    const kind = mm[2];
    const ctx = await contextOf(user, env);
    if (!canEdit(user, id, ctx.trMap)) throw httpErr(403, 'Эрхгүй');
    const mem = ctx.members.find(x => x.id === id);
    if (!mem) throw httpErr(404, 'Гишүүн олдохгүй');
    const b = await readBody(req);
    if (kind === 'photos') {
      const url = normPhoto(b.url);
      if (!url) throw httpErr(400, 'Зураг шаардлагатай');
      const pcnt = await get(env, 'SELECT COUNT(*) AS c FROM member_photos WHERE member_id=?', id);
      if (Number((pcnt && pcnt.c) || 0) >= 5) throw httpErr(400, 'Нэмэлт зурагийн дээд тал (5) хүрсэн байна');
      await insert(env, 'INSERT INTO member_photos(member_id, url, created_by) VALUES(?,?,?)',
        id, url, user.id);
      // Нүүр зураг хоосон бол эхний нэмэлт зургийг нүүр болгоно — модны карт дээр харагдана
      let cover = mem.photo || '';
      if (!cover) {
        await run(env, 'UPDATE members SET photo=? WHERE id=?', url, id);
        cover = url;
      }
      const gotP = await scoreNewPhoto(env, user, id);
      await audit(env, user, 'member_photo', `${mem.name} (#${id})`);
      return json({ ok: true, points: gotP, photo: cover });
    }
    const date = String(b.date || '').trim();
    const title = String(b.title || '').trim();
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) throw httpErr(400, 'Огноо шаардлагатай (ЖИШЭЭ: 2026-07-11)');
    if (!title) throw httpErr(400, 'Үйл явдлын нэр шаардлагатай');
    const ecnt = await get(env, 'SELECT COUNT(*) AS c FROM member_events WHERE member_id=?', id);
    if (Number((ecnt && ecnt.c) || 0) >= 4) throw httpErr(400, 'Үйл явалын дээд тал (4) хүрсэн байна');
    // Зураг сонголтоор — том зургийг клиент тал дээр жижигрүүлж илгээдэг
    const photo = b.photo ? normPhoto(b.photo) : '';
    await insert(env, 'INSERT INTO member_events(member_id, event_date, title, photo, created_by) VALUES(?,?,?,?,?)',
      id, date, title.slice(0, 300), photo, user.id);
    const gotE = await scoreNewEvent(env, user, id);
    await audit(env, user, 'member_event', `${mem.name} (#${id}) ${date}`);
    return json({ ok: true, points: gotE });
  }

  // ---------- ЗУРГИЙН КОММЕНТ (өөрийн болон бусдын зурагт) ----------
  mm = path.match(/^\/api\/members\/(\d+)\/photos\/(\d+)\/comments$/);
  if (mm) {
    need();
    const id = Number(mm[1]), pid = Number(mm[2]);
    const ctx = await contextOf(user, env);
    if (!ctx.vis.has(id)) throw httpErr(404, 'Гишүүн олдохгүй');
    const list = () => all(env,
      'SELECT c.id, c.text, c.created_at, c.user_id, u.name AS user_name, (c.user_id = ?) AS mine ' +
      'FROM photo_comments c LEFT JOIN users u ON u.id=c.user_id ' +
      'WHERE c.member_id=? AND c.photo_id=? ORDER BY c.id', user.id, id, pid);
    if (method === 'GET') return json({ comments: await list() });
    if (method === 'POST') {
      const b = await readBody(req);
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) throw httpErr(400, 'Коммент хоосон байна');
      const cnt = await get(env, 'SELECT COUNT(*) AS c FROM photo_comments WHERE member_id=? AND photo_id=?', id, pid);
      if (Number((cnt && cnt.c) || 0) >= 300) throw httpErr(400, 'Комментын дээд хэмжээ (300) хүрсэн');
      await insert(env, 'INSERT INTO photo_comments(photo_id, member_id, user_id, text) VALUES(?,?,?,?)',
        pid, id, user.id, text);
      await audit(env, user, 'photo_comment', `${id}/${pid}`);
      return json({ ok: true, comments: await list() });
    }
  }

  // Комментыг устгах — зөвхөн өөрийнхөө (эсвэл админ)
  mm = path.match(/^\/api\/comments\/(\d+)\/delete$/);
  if (mm && method === 'POST') {
    need();
    const cid = Number(mm[1]);
    const c = await get(env, 'SELECT * FROM photo_comments WHERE id=?', cid);
    if (!c) throw httpErr(404, 'Коммент олдсонгүй');
    if (c.user_id !== user.id && !(user.role === 'admin' || user.role === 'super')) {
      throw httpErr(403, 'Эрхгүй');
    }
    await run(env, 'DELETE FROM photo_comments WHERE id=?', cid);
    await audit(env, user, 'photo_comment_del', String(cid));
    return json({ ok: true });
  }

  // Нэмэлт зургийг устгах (нүүр зураг байсан бол нүүрийг ч цэвэрлэнэ)
  mm = path.match(/^\/api\/members\/(\d+)\/photos\/(\d+)\/delete$/);
  if (mm && method === 'POST') {
    need();
    const id = Number(mm[1]), pid = Number(mm[2]);
    const ctx = await contextOf(user, env);
    const mem = ctx.members.find(x => x.id === id);
    if (!mem) throw httpErr(404, 'Гишүүн олдохгүй');
    if (!canEdit(user, id, ctx.trMap)) throw httpErr(403, 'Устгах эрхгүй');
    const ph = await get(env, 'SELECT url FROM member_photos WHERE id=? AND member_id=?', pid, id);
    if (!ph) throw httpErr(404, 'Зураг олдсонгүй');
    if (mem.photo && ph.url && mem.photo === ph.url) {
      await run(env, 'UPDATE members SET photo=? WHERE id=?', '', id);
    }
    await run(env, 'DELETE FROM member_photos WHERE id=?', pid);
    await run(env, 'DELETE FROM photo_comments WHERE member_id=? AND photo_id=?', id, pid);
    await audit(env, user, 'member_photo_del', `${mem.name} (#${id})`);
    return json({ ok: true });
  }

  // ---------- НҮҮР ЗУРАГ (өөрийн эсвэл засах эрхтэй хүний) ----------
  mm = path.match(/^\/api\/members\/(\d+)\/cover$/);
  if (mm && method === 'POST') {
    need();
    const id = Number(mm[1]);
    const ctx = await contextOf(user, env);
    const mem = ctx.members.find(x => x.id === id);
    if (!mem) throw httpErr(404, 'Гишүүн олдохгүй');
    if (!canEdit(user, id, ctx.trMap)) throw httpErr(403, 'Нүүр зураг солих эрхгүй');
    const b = await readBody(req);
    const pid = Number(b.photo_id) || 0;
    let url = '';
    if (pid > 0) {
      const ph = await get(env, 'SELECT url FROM member_photos WHERE id=? AND member_id=?', pid, id);
      if (!ph) throw httpErr(404, 'Зураг олдсонгүй');
      url = ph.url;
    } else if (b.url !== undefined) {
      url = normPhoto(b.url) || '';
    }
    await run(env, 'UPDATE members SET photo=? WHERE id=?', url, id);
    await audit(env, user, 'cover_photo', `${mem.name} (#${id})`);
    return json({ ok: true, photo: url });
  }

  throw httpErr(404, 'Маршрут олдохгүй');
}

// ---------- 🎂 Төрсөн өдөр ба баярын мэдэгдэл (Web Push) ----------
// Өдөрт НЭГ удаа, Улаанбаатарын 09:00-с хойш: тухайн өдрийн төрсөн өдөр ба
// улсын/билгийн баярыг БҮРТГҮҮЛСЭН БҮХ төхөөрөмж рүү илгээнэ.
// (Админ мэдэгдэл — notifyAdmins — энэ функцээс хамааралгүй, хэвээр ажиллана.)
const DAILY_PUSH_TITLE = 'iFamily · Сануулга';
export async function sendDailyPush(env) {
  try {
    const ubNow = new Date(Date.now() + 8 * 3600 * 1000);   // УБ цаг (UTC+8)
    const todayKey = ubNow.toISOString().slice(0, 10);
    const mmdd = todayKey.slice(5, 10);
    if (ubNow.getUTCHours() < 9) return { sent: 0, skipped: 'too-early' };
    const done = await get(env, "SELECT value FROM design WHERE key='daily_push_date'");
    if (done && done.value === todayKey) return { sent: 0, skipped: 'already-sent' };

    // ① Төрсөн өдөр (нас барсан болон огноогүй хүн орохгүй)
    const bdays = await all(env,
      "SELECT id, name, birth_date FROM members WHERE alive=1 AND birth_date LIKE ?", '%-' + mmdd);
    // Аавын нэр (эцгийн нэр) — «Ганбаатрын Билгүүдэй» гэж хэлбэрт оруулна
    let pat = new Map();
    if (bdays.length) {
      try {
        const fam = await all(env, `SELECT c.child_id, f.name AS fname, f.sex AS fsex
          FROM children c JOIN members f ON f.id = c.father_id WHERE c.father_id IS NOT NULL ORDER BY c.id`);
        const byChild = new Map();
        for (const r of fam) if (!byChild.has(r.child_id)) byChild.set(r.child_id, r.fname);
        pat = new Map(bdays.map(b => [b.id, byChild.get(b.id) || '']));
      } catch (e) { pat = new Map(); }
    }
    const fullName = (b) => {
      const d = pat.get(b.id);
      return d ? genitiveName(d) + ' ' + b.name : b.name;
    };
    // Нас: энэ жилийн төрсөн өдрөөр (2026-11-17, 2006 онд төрсөн → 20)
    const ageOf = (b) => {
      const y = Number(String(b.birth_date || '').slice(0, 4));
      const cur = Number(todayKey.slice(0, 4));
      return Number.isFinite(y) && y > 0 && cur > y ? cur - y : null;
    };

    // ② Өнөөдрийн баяр (тогтмол MM-DD + билгийн тоолол)
    const holidays = [];
    for (const h of HOLIDAYS) if (h.md === mmdd) holidays.push({ name: h.name, icon: h.icon || '🇲🇳' });
    for (const e of (LUNAR_EVENTS[ubNow.getUTCFullYear()] || [])) {
      if (e.d === todayKey) holidays.push({ name: e.n, icon: '🇲🇳' });
    }

    const msgs = [];
    if (bdays.length === 1) {
      const b = bdays[0], a = ageOf(b);
      msgs.push({
        title: '🎂 Төрсөн өдөр',
        body: a != null
          ? `Өнөөдөр ${fullName(b)} ${a} нас хүрч байна! Төрсөн өдрийн мэнд хүргэе! 🎂`
          : `Өнөөдөр ${fullName(b)}-н төрсөн өдөр! 🎂`,
        url: '/', tag: 'bday'
      });
    } else if (bdays.length > 1) {
      const parts = bdays.map(b => { const a = ageOf(b); return a != null ? `${fullName(b)} (${a} нас)` : fullName(b); });
      msgs.push({ title: '🎂 Төрсөн өдөр', body: `Өнөөдөр ${bdays.length} хүний төрсөн өдөр: ${parts.join(', ')} 🎂`, url: '/', tag: 'bday' });
    }
    for (const h of holidays) {
      msgs.push({ title: DAILY_PUSH_TITLE, body: `Өнөөдөр ${h.name}! ${h.icon}`, url: '/', tag: 'holiday' });
    }

    // Бүртгүүлсэн БҮХ төхөөрөмж (админ төдийгүй)
    let subs = [];
    try { subs = await all(env, 'SELECT id, endpoint, p256dh, auth FROM push_subs'); } catch (e) { subs = []; }
    let sent = 0;
    for (const s of subs) {
      for (const m of msgs) {
        try {
          const r = await sendPush(env, s, m);
          if (r.ok) sent++;
          else if (r.gone) { await run(env, 'DELETE FROM push_subs WHERE id=?', s.id); break; }
        } catch (e) { /* нэг төхөөрөмж эвдэрсэн ч бусдад саад болохгүй */ }
      }
    }
    await run(env, "INSERT INTO design(key,value) VALUES('daily_push_date',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", todayKey);
    return { sent, birthdays: bdays.length, holidays: holidays.length, devices: subs.length };
  } catch (e) {
    return { sent: 0, error: String(e && e.message || e) };
  }
}

// ---------- өглөөний Telegram сануулга (cron) ----------
export async function scheduled(env) {
  await initDb(env);
  try { await sendDailyPush(env); } catch (e) { /* push алдаа telegram-д саад болохгүй */ }
  const d = await getDesign(env);
  if (!d.tg_token || !d.tg_chat) return;
  const rows = await all(env, "SELECT name, birth_date FROM members WHERE alive=1 AND birth_date != ''");
  const now = new Date();
  const key = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = rows.filter(r => String(r.birth_date).slice(5, 10) === key);
  if (!today.length) return;
  const text = '🎂 iFamily — өнөөдөр төрсөн өдөр:\n' +
    today.map(r => `• ${r.name} (${r.birth_date})`).join('\n');
  await sendTelegram(d.tg_token, d.tg_chat, text);
}
