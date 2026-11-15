// Онооны систем — iFamily
// Үндсэн дүрэм:
//  ① Анхдагч эрх: шинэ хүн үүсгэж талбар бөглөсөн даруйд оноо анх оруулсан хэрэглэгчид очно.
//  ② Засахад оноо өгөхгүй: зөвхөн хоосон → дүүрсэн үед л оноо; дахин бөглөх/засахад ДАХИЖ ӨГӨХГҮЙ.
//  ③ Хоосон талбарын өрсөлдөөн: үлдсэн хоосон талбарыг хэн түрүүлж бөглөнө тэр хүн авна.
//  ④ Нэг хүний хязгаар: нэг хүний картнаас авч болох дээд оноо 200.
// Бүртгэл: field_scores(member_id, field_key) UNIQUE — нэг талбар нэг удаа л бүртгэгдэнэ.
import { all, get, run } from './db.js';

export const MEMBER_CAP = 200;

// 10 түвшин — жишээ: 325 оноо = «Нахиа»(3), дараагийн «Навч»(4) 700 хүртэл 375 үлдэнэ
export const LEVELS = [
  { n: 1, name: 'Үр', at: 0 },
  { n: 2, name: 'Найлзуур', at: 100 },
  { n: 3, name: 'Нахиа', at: 300 },
  { n: 4, name: 'Навч', at: 700 },
  { n: 5, name: 'Салаа', at: 1200 },
  { n: 6, name: 'Их мод', at: 1800 },
  // 7, 8, 10: албан ёсны «угийн бичиг» нэр томьёогоор (Монголын түүхийн тайлбар толь,
  // «Угийн бичиг хөтлөх журам»). «Ургийн» нь ярианы хувилбар, «улгийн» нь буруу.
  // 9: «удмын түүх» нь тогтсон хэллэг (family history) тул «Удмын түүхч» хэвээр.
  { n: 7, name: 'Угийн хөтөч', at: 2600 },
  { n: 8, name: 'Угийн бичээч', at: 3600 },
  { n: 9, name: 'Удмын түүхч', at: 5000 },
  { n: 10, name: 'Угийн бичгийн эзэн', at: 7000 }
];

export function levelOf(score) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (score >= l.at) lv = l;
  return lv;
}

const str = (v) => String(v == null ? '' : v).trim();

// Талбар бүрийн оноо + шалгалт. test() хоёр утга (хуучин/шинэ мөр) дээр
// харьцуулагдаж, зөвхөн хоосон→дүүрсэн үед л оноо бүртгэгдэнэ.
export const FIELD_RULES = [
  { key: 'name_sex', cat: 'info', points: 15,
    label: 'Нэр, хүйсээ бөглөж хүн нэмэх',
    step: '{n} хүний нэр, хүйсийг бөглөх',
    test: (m) => !!str(m.name) && (m.sex === 'm' || m.sex === 'f') },
  { key: 'clan', cat: 'info', points: 15,
    label: 'Ургийн овог',
    step: '{n} хүний ургийн овогийг бөглөх',
    test: (m) => !!str(m.clan) },
  { key: 'birth_date', cat: 'info', points: 25,
    label: 'Төрсөн огноо — бүтэн (он, сар, өдөр)',
    step: '{n} хүний төрсөн огноог бүтэн бичих',
    test: (m) => /^\d{4}-\d{1,2}-\d{1,2}$/.test(str(m.birth_date)) },
  { key: 'birth_place', cat: 'info', points: 10,
    label: 'Төрсөн газар',
    step: '{n} хүний төрсөн газрыг бөглөх',
    test: (m) => !!str(m.birth_place) },
  { key: 'phone', cat: 'info', points: 5,
    label: 'Утасны дугаар (8 орон)',
    step: '{n} хүний утасны дугаарыг бөглөх',
    test: (m) => str(m.phone).replace(/\D/g, '').length === 8 },
  { key: 'honors', cat: 'info', points: 10,
    label: 'Гавьяа шагнал',
    step: '{n} хүний гавьяа шагналыг бөглөх',
    test: (m) => !!str(m.honors) },
  { key: 'death_date', cat: 'info', points: 15,
    label: 'Нас барсан огноо',
    step: '{n} хүний нас барсан огноог бөглөх',
    test: (m) => !!str(m.death_date) },
  { key: 'bio_200', cat: 'info', points: 25,
    label: 'Намтар 200+ тэмдэгт',
    step: '{n} хүний намтар (200+ тэмдэгт) бичих',
    test: (m) => str(m.bio).length >= 200 },
  { key: 'bio_1000', cat: 'info', points: 45,
    label: 'Намтар 1000+ тэмдэгт',
    step: '{n} хүний намтар (1000+ тэмдэгт) бичих',
    test: (m) => str(m.bio).length >= 1000 },
  { key: 'photo_first', cat: 'photo', points: 15,
    label: 'Хүний анхны зураг',
    step: '{n} хүнд зураг оруулах',
    test: (m) => !!str(m.photo) }
];

// «Оноо хэрхэн тооцогддог вэ?» жагсаалт
export const RULES_LIST = [
  { label: 'Нэр, хүйсээ бөглөж хүн нэмэх', points: 15 },
  { label: 'Ургийн овог', points: 15 },
  { label: 'Төрсөн огноо — бүтэн (он, сар, өдөр)', points: 25 },
  { label: 'Төрсөн газар', points: 10 },
  { label: 'Утасны дугаар (8 орон)', points: 5 },
  { label: 'Гавьяа шагнал', points: 10 },
  { label: 'Нас барсан огноо', points: 15 },
  { label: 'Намтар 200+ тэмдэгт', points: 25 },
  { label: 'Намтар 1000+ тэмдэгт', points: 45 },
  { label: 'Нэг хүний картанд дээд оноо', points: 200, cap: true },
  { label: 'Хүний анхны зураг', points: 15 },
  { label: 'Нэмэлт зураг (1 бүр, дээд тал 5)', points: 3 },
  { label: 'Огноотой үйл явдал (1 бүр, дээд тал 4)', points: 5 }
];

// Нэг талбарын оноог бүртгэнэ:
//  - аль хэдийн мөр байвал (хэн нэгэн анх бөглөсөн) дахин өгөхгүй;
//  - нэг хүний 200 хязгаар хэтэрвэл үлдсэн хэмжээгээр л нэмнэ (эсвэл 0).
async function awardField(env, user, memberId, key, points) {
  const exists = await get(env,
    'SELECT user_id, points FROM field_scores WHERE member_id=? AND field_key=?',
    memberId, key);
  if (exists) return 0; // ② анх бөглөсөн хүний оноо хэвээр үлдэнэ
  const cur = await get(env,
    "SELECT COALESCE(SUM(points),0) AS s FROM field_scores WHERE user_id=? AND member_id=? AND field_key<>'legacy_bonus'",
    user.id, memberId);
  const left = MEMBER_CAP - (cur ? Number(cur.s) || 0 : 0);
  if (left <= 0) return 0; // ④ нэг хүний хязгаар хүрсэн
  const p = Math.min(points, left);
  await run(env,
    'INSERT OR IGNORE INTO field_scores(member_id, field_key, user_id, points) VALUES(?,?,?,?)',
    memberId, key, user.id, p);
  const row = await get(env,
    'SELECT user_id, points FROM field_scores WHERE member_id=? AND field_key=?',
    memberId, key);
  return (row && row.user_id === user.id) ? (Number(row.points) || 0) : 0;
}

// Гишүүн үүсгэх / засах / импортлох үед дуудна.
// oldM = null бол шинэ гишүүн — бүх дүүрсэн талбар анх оруулсан хүнд очно.
export async function scoreMember(env, user, memberId, oldM, newM) {
  if (!user || !memberId || !newM) return [];
  const got = [];
  for (const rule of FIELD_RULES) {
    const before = oldM ? !!rule.test(oldM) : false;
    const after = !!rule.test(newM);
    if (!before && after) {
      const p = await awardField(env, user, memberId, rule.key, rule.points);
      if (p > 0) got.push({ key: rule.key, points: p });
    }
  }
  return got;
}

// Нэмэлт зураг нэмэхэд: 1 бүр +3, дээд тал 5 (photo_extra_1..5)
export async function scoreNewPhoto(env, user, memberId) {
  const cnt = await get(env, 'SELECT COUNT(*) AS c FROM member_photos WHERE member_id=?', memberId);
  const n = Number(cnt && cnt.c) || 0;
  if (n < 1 || n > 5) return 0;
  return awardField(env, user, memberId, 'photo_extra_' + n, 3);
}

// Огноотой үйл явдал нэмэхэд: 1 бүр +5, дээд тал 4 (event_1..4)
export async function scoreNewEvent(env, user, memberId) {
  const cnt = await get(env, 'SELECT COUNT(*) AS c FROM member_events WHERE member_id=?', memberId);
  const n = Number(cnt && cnt.c) || 0;
  if (n < 1 || n > 4) return 0;
  return awardField(env, user, memberId, 'event_' + n, 5);
}

// /api/scores хариулт: түвшин, лидерүүд, бүрэлдэхүүн, дараагийн алхам, дүрэм, бүртгэл
export async function scoresPayload(env, user, ctx, canEdit) {
  const rows = await all(env, 'SELECT member_id, field_key, user_id, points FROM field_scores');
  const users = await all(env, 'SELECT id, name, phone FROM users');

  const totals = new Map();      // user_id → нийт оноо
  const myByMember = new Map();  // member_id → надад энэ хүнээс авсан оноо (200 хязгаар)
  const claimed = new Set();     // 'member|field' — аль хэдийн бүртгэгдсэн
  const myCat = { info: 0, photo: 0, event: 0, legacy: 0 };
  for (const r of rows) {
    const p = Number(r.points) || 0;
    totals.set(r.user_id, (totals.get(r.user_id) || 0) + p);
    claimed.add(r.member_id + '|' + r.field_key);
    if (r.user_id === user.id) {
      // Өмнөх бүртгэлээс шилжүүлсэн оноо (legacy_bonus) 200 хязгаарт орохгүй
      if (String(r.field_key).indexOf('legacy_bonus') === 0) { myCat.legacy += p; continue; }
      myByMember.set(r.member_id, (myByMember.get(r.member_id) || 0) + p);
      const k = String(r.field_key);
      const cat = k.indexOf('photo') === 0 ? 'photo' : k.indexOf('event') === 0 ? 'event' : 'info';
      myCat[cat] += p;
    }
  }

  // Системийн лидерүүд: бүх бүртгэлтэй хэрэглэгч, оноогоор эрэмбэ (тэнцүү бол нэрээр)
  const board = users.map(u => ({
    id: u.id,
    name: String(u.name || u.phone || ('#' + u.id)),
    score: totals.get(u.id) || 0,
    me: u.id === user.id
  })).sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'mn'));
  let rank = 0, prevScore = null;
  board.forEach((b, i) => {
    if (b.score !== prevScore) { rank = i + 1; prevScore = b.score; }
    b.rank = rank;
    const l = levelOf(b.score);
    b.level = l.n + '. ' + l.name;
  });

  // Би: түвшин, дараагийн түвшин хүртэл үлдсэн оноо, байрлалын өөрчлөлт (+1/−1)
  const myScore = totals.get(user.id) || 0;
  const lv = levelOf(myScore);
  const nx = LEVELS[lv.n] || null;
  const need = nx ? Math.max(0, nx.at - myScore) : 0;
  const pct = nx ? Math.min(100, Math.round((myScore / nx.at) * 1000) / 10) : 100;
  const meRow = board.find(b => b.me);
  const myRank = meRow ? meRow.rank : board.length;
  const prevRow = await get(env, 'SELECT rank FROM score_ranks WHERE user_id=?', user.id);
  const delta = prevRow && prevRow.rank != null ? Number(prevRow.rank) - myRank : null;
  await run(env,
    `INSERT INTO score_ranks(user_id, rank, updated_at) VALUES(?,?,datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET rank=excluded.rank, updated_at=excluded.updated_at`,
    user.id, myRank);

  // Дараагийн алхам: би засах эрхтэй, хоосон, одоо хэн ч оноо аваагүй талбарууд
  const editable = ctx.members.filter(m =>
    ctx.vis.has(m.id) && canEdit(user, m.id, ctx.trMap));
  const phRows = await all(env, 'SELECT member_id, COUNT(*) AS c FROM member_photos GROUP BY member_id');
  const evRows = await all(env, 'SELECT member_id, COUNT(*) AS c FROM member_events GROUP BY member_id');
  const photoCnt = new Map(phRows.map(r => [r.member_id, Number(r.c) || 0]));
  const eventCnt = new Map(evRows.map(r => [r.member_id, Number(r.c) || 0]));
  const leftOf = (m) => MEMBER_CAP - (myByMember.get(m.id) || 0);

  const steps = [];
  for (const rule of FIELD_RULES) {
    let count = 0, points = 0;
    for (const m of editable) {
      if (rule.test(m)) continue;                          // аль хэдийн дүүрсэн
      if (claimed.has(m.id + '|' + rule.key)) continue;    // аль хэдийн хэн нэгэн авсан
      const left = leftOf(m);
      if (left <= 0) continue;                             // энэ хүнээс 200 хүрсэн
      count++;
      points += Math.min(rule.points, left);
    }
    if (count) steps.push({ label: rule.step.replace('{n}', count), points });
  }
  { // нэмэлт зураг: сул слот бүр +3 (дээд тал 5)
    let count = 0, points = 0;
    for (const m of editable) {
      let left = leftOf(m);
      if (left <= 0) continue;
      const c = photoCnt.get(m.id) || 0;
      for (let k = c + 1; k <= 5; k++) {
        if (claimed.has(m.id + '|photo_extra_' + k)) continue;
        if (left <= 0) break;
        const p = Math.min(3, left);
        count++; points += p; left -= p;
      }
    }
    if (count) steps.push({ label: count + ' нэмэлт зураг нэмэх', points });
  }
  { // огноотой үйл явдал: сул слот бүр +5 (дээд тал 4)
    let count = 0, points = 0;
    for (const m of editable) {
      let left = leftOf(m);
      if (left <= 0) continue;
      const c = eventCnt.get(m.id) || 0;
      for (let k = c + 1; k <= 4; k++) {
        if (claimed.has(m.id + '|event_' + k)) continue;
        if (left <= 0) break;
        const p = Math.min(5, left);
        count++; points += p; left -= p;
      }
    }
    if (count) steps.push({ label: count + ' огноотой үйл явдал нэмэх', points });
  }
  steps.sort((a, b) => b.points - a.points);

  // Миний бүртгэл (сүүлийн30)
  const recs = await all(env,
    `SELECT fs.member_id, fs.field_key, fs.points, fs.created_at, m.name AS member_name
     FROM field_scores fs LEFT JOIN members m ON m.id = fs.member_id
     WHERE fs.user_id=? ORDER BY fs.id DESC LIMIT 30`, user.id);
  const labelOf = (key) => {
    const r = FIELD_RULES.find(x => x.key === key);
    if (r) return r.label;
    const k = String(key);
    if (k.indexOf('legacy_bonus') === 0) return 'Өмнөх бүртгэлээс шилжүүлсэн оноо';
    if (k.indexOf('photo_extra_') === 0) return 'Нэмэлт зураг';
    if (k.indexOf('event_') === 0) return 'Огноотой үйл явдал';
    return k;
  };
  const records = recs.map(r => ({
    member: r.member_name || ('#' + r.member_id),
    label: labelOf(r.field_key),
    points: Number(r.points) || 0,
    at: String(r.created_at || '').slice(0, 16)
  }));

  // Лидерүүдийн хуудас: эхний 10 + би эхний 10-д ороогүй бол миний мөр
  const top = board.slice(0, 10);
  const meIdx = board.findIndex(b => b.me);
  const display = meIdx > 9 ? top.concat([null, board[meIdx]]) : top;

  return {
    levels: LEVELS,
    me: {
      score: myScore, rank: myRank, users: board.length, delta,
      level: { n: lv.n, name: lv.name },
      next: nx ? { n: nx.n, name: nx.name, at: nx.at } : null,
      need, pct, breakdown: myCat
    },
    board: display,
    steps,
    rules: RULES_LIST,
    records
  };
}
