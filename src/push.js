// Web Push (VAPID + aes128gcm) — Cloudflare Workers-т зориулсан хөнгөн хэрэгжилт.
// Гадаад сангуй: WebCrypto (ECDH P-256, HKDF-SHA256, AES-128-GCM, ECDSA).
import { all, get, run } from './db.js';

const enc = new TextEncoder();

function b64uDecode(s) {
  const t = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4 ? 4 - (t.length % 4) : 0;
  const bin = atob(t + '='.repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uEncode(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cat(...arrs) {
  const n = arrs.reduce((a, x) => a + x.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

export function parseVapid(env) {
  if (!env || !env.VAPID_KEYS) return null;
  try {
    const k = JSON.parse(env.VAPID_KEYS);
    return k && k.privateJwk && k.publicKey ? k : null;
  } catch (e) { return null; }
}
// VAPID түлхүүрийг олно: ① env.VAPID_KEYS (dashboard secret) ② D1 design.vapid_keys
// ③ байхгүй бол ШИНЭЭР үүсгэж D1-д хадгална (Cloudflare Pages дээр env
// тохируулах шаардлагагүй — push шууд ажиллана).
let VAPID_MEM = null;   // isolate доторх кэш

async function generateVapid() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', kp.publicKey);
  // Browser-т өгөх applicationServerKey = 0x04 || X(32) || Y(32)
  const raw = new Uint8Array(65);
  raw[0] = 4;
  raw.set(b64uDecode(pub.x), 1);
  raw.set(b64uDecode(pub.y), 33);
  return { privateJwk: priv, publicKey: b64uEncode(raw) };
}

export async function getVapid(env) {
  const fromEnv = parseVapid(env);
  if (fromEnv) return fromEnv;
  if (VAPID_MEM) return VAPID_MEM;
  try {
    const row = await get(env, "SELECT value FROM design WHERE key='vapid_keys'");
    if (row && row.value) {
      try {
        const j = JSON.parse(row.value);
        if (j && j.privateJwk && j.publicKey) { VAPID_MEM = j; return j; }
      } catch (e) { /* эвдэрсэн бол доор шинээр үүсгэнэ */ }
    }
    const fresh = await generateVapid();
    await run(env,
      "INSERT INTO design(key,value) VALUES('vapid_keys',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      JSON.stringify(fresh));
    // Зэрэгцээ хүсэлт өөр түлхүүр бичсэн байж болзошгүй — хадгалагдсаныг нь уншина
    const saved = await get(env, "SELECT value FROM design WHERE key='vapid_keys'");
    let out = fresh;
    if (saved && saved.value) {
      try { const j = JSON.parse(saved.value); if (j && j.privateJwk) out = j; } catch (e) {}
    }
    VAPID_MEM = out;
    return out;
  } catch (e) {
    return null;
  }
}

export async function pushPublicKey(env) {
  const v = await getVapid(env);
  return v ? v.publicKey : '';
}

// VAPID JWT (ES256) — push үйлчилгээнд хандах эрх
export async function vapidAuth(vapid, endpoint) {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:ifamily@freebuff.page'
  })));
  const data = enc.encode(header + '.' + claims);
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  return 'vapid t=' + header + '.' + claims + '.' + b64uEncode(sig) + ', k=' + vapid.publicKey;
}

// RFC 8291 (aes128gcm) шифрлэлт
export async function encryptPush(payload, p256dh, auth) {
  const uaPub = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const prk = await hkdf(authSecret, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = cat(enc.encode(payload), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

export async function sendPush(env, sub, payload) {
  const vapid = await getVapid(env);
  if (!vapid) return { ok: false, gone: false };
  const body = await encryptPush(JSON.stringify(payload), sub.p256dh, sub.auth);
  const authorization = await vapidAuth(vapid, sub.endpoint);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization,
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'high'
    },
    body
  });
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}

// Бүх админ/супер админы бүртгэлтэй төхөөрөмж рүү мэдэгдэл илгээнэ
export async function notifyAdmins(env, title, body, url = '/') {
  if (!(await getVapid(env))) return 0;
  let subs = [];
  try {
    subs = await all(env, `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subs s
      JOIN users u ON u.id = s.user_id WHERE u.role IN ('admin','super')`);
  } catch (e) { return 0; }
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await sendPush(env, s, { title, body, url, tag: 'ifamily' });
      if (r.ok) sent++;
      else if (r.gone) await run(env, 'DELETE FROM push_subs WHERE id=?', s.id);
    } catch (e) { /* нэг төхөөрөмж эвдэрсэн ч бусдад саад болохгүй */ }
  }
  return sent;
}
