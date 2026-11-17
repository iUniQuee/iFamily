// staging (тест) сайтын датаг production сайт руу бүрэн хуулна.
// Хэрэглэх:
//   FROM_URL=https://test.pages.dev FROM_PHONE=… FROM_PASS=… \
//   TO_URL=https://ifamily.pages.dev  TO_PHONE=…  TO_PASS=… \
//   node scripts/sync-data.mjs
// Нэмэлт: DRY=1 бол зөвхөн татаж шалгана (production-д бичихгүй).
import { writeFileSync } from 'node:fs';

const E = process.env;
const need = ['FROM_URL', 'FROM_PHONE', 'FROM_PASS', 'TO_URL', 'TO_PHONE', 'TO_PASS'];
const miss = need.filter((k) => !E[k]);
if (miss.length) {
  console.error('Дутуу env: ' + miss.join(', '));
  process.exit(1);
}
const base = (u) => String(u).replace(/\/+$/, '');

async function login(url, phone, password) {
  const r = await fetch(base(url) + '/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });
  const j = await r.json().catch(() => ({}));
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  if (!r.ok || !cookie) throw new Error('Нэвтрэлт амжилтгүй (' + url + '): ' + (j.error || r.status));
  if (!['super', 'admin'].includes((j.user || {}).role)) throw new Error('Админ эрх хэрэгтэй (' + url + ')');
  return cookie;
}

const fromCookie = await login(E.FROM_URL, E.FROM_PHONE, E.FROM_PASS);
const bak = await fetch(base(E.FROM_URL) + '/api/backup', { headers: { cookie: fromCookie } });
if (!bak.ok) throw new Error('Backup татахад алдаа: ' + bak.status);
const data = await bak.json();
if (data.format !== 'i-family-backup-v1') throw new Error('Backup формат буруу: ' + data.format);

const c = data.counts || {};
console.log('Эх сурвалж: members=' + (c.members ?? (data.members || []).length) +
  ' children=' + (c.children ?? (data.children || []).length) +
  ' unions=' + (c.unions ?? (data.unions || []).length) +
  ' photos=' + (c.member_photos ?? (data.member_photos || []).length));

if (E.DRY === '1') {
  writeFileSync('/tmp/ifamily-sync-dry.json', JSON.stringify(data));
  console.log('DRY=1 — production-д бичээгүй. /tmp/ifamily-sync-dry.json');
  process.exit(0);
}

const toCookie = await login(E.TO_URL, E.TO_PHONE, E.TO_PASS);
data.clear = true; // хуучин датаг бүрэн устгаад солино
const res = await fetch(base(E.TO_URL) + '/api/restore', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: toCookie },
  body: JSON.stringify(data)
});
const out = await res.json().catch(() => ({}));
if (!res.ok || !out.ok) throw new Error('Restore алдаа: ' + JSON.stringify(out).slice(0, 300));
console.log('Restore OK → ' + base(E.TO_URL));
console.log('  ' + JSON.stringify(out.restored));

// Баталгаажуулалт: production дээрх state-ийг дахин уншина
const st = await fetch(base(E.TO_URL) + '/api/state', { headers: { cookie: toCookie } });
const s = await st.json();
const gens = {};
for (const n of (s.layout || {}).nodes || []) gens[n.gen] = (gens[n.gen] || 0) + 1;
console.log('  members=' + (s.members || []).length + ' links=' + (s.links || []).length +
  ' gens=' + JSON.stringify(Object.keys(gens).sort().reduce((a, k) => (a[k] = gens[k], a), {})));
