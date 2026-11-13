// I Family онооны системийн e2e шалгалт — http://127.0.0.1:3000 дээр
// Дүрэм: анхдагч эрх, засахад оноо өгөхгүй, хоосон талбарын өрсөлдөөн, 200 хязгаар.
// Ажиллуулах: node test-scores.mjs (сервер ажиллаж байх ёстой)
const B = 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
};

async function req(method, path, body, cookie) {
  const h = {};
  if (body) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const r = await fetch(B + path, {
    method, headers: h, body: body ? JSON.stringify(body) : undefined
  });
  const sc = r.headers.get('set-cookie') || '';
  const m = sc.match(/ifam=[^;]+/);
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j, cookie: m ? m[0] : cookie };
}

console.log('1) Нэвтрэлт + хамгаалалт');
let r = await req('POST', '/api/login', { phone: '88776576', password: 'Test1234' });
ok(r.status === 200 && !!r.cookie, 'супер админ нэвтрэлт');
const S = r.cookie;
if (!S) { console.log('СУПЕР НЭВТРЭЛТ АМЖИЛТГҮЙ — тест зогсоолоо'); process.exit(1); }
r = await req('GET', '/api/scores');
ok(r.status === 401, 'нэвтрээгүй хүн /api/scores = 401');
// эхлэлийн төлөв (аккаунт аль хэдийн оноо цуглуулсан байж болно) — дараагийн
// шалгалтууд нийт утга бус, Δ (өөрчлөлт)-гээр шалгана
r = await req('GET', '/api/scores', null, S);
const base = {
  score: r.j.me.score,
  info: r.j.me.breakdown.info,
  photo: r.j.me.breakdown.photo,
  event: r.j.me.breakdown.event
};

// Leaderboard нь БҮХ бүртгэлтэй хэрэглэгчийг жагсаадаг тул бүртгэлийн тоо
// (хэрэглэгч устгах боломжтой болсноор) 6-аас доош орвол тестийн урьдчилсан
// нөхцөл биелэхгүй. Дутуу тоог түр бүртгэлээр нөхнө — шалгалт хэвээрээ.
r = await req('GET', '/api/scores', null, S);
const missingUsers = 6 - ((r.j && Array.isArray(r.j.board)) ? r.j.board.length : 0);
for (let i = 0; i < missingUsers; i++) {
  await req('POST', '/api/register', {
    phone: '8' + String((Date.now() + i * 97) % 1e7).padStart(7, '0'),
    name: 'Түр бүртгэл ' + (i + 1), password: 'Test1234', confirm: 'Test1234'
  });
}

console.log('2) Анхдагч эрх — шинэ хүн үүсгэхэд дүүрсэн бүх талбарын оноо');
const bio250 = 'Намтарын тест мэдээлэл. '.repeat(12); // ~288 тэмдэгт
r = await req('POST', '/api/members', {
  name: 'Тест Оноо', sex: 'm', clan: 'Тестов', birth_date: '1990-05-05',
  birth_place: 'Улаанбаатар', phone: '99112233', honors: 'Тест шагнал',
  bio: bio250, photo: '/img/t1'
}, S);
const id1 = r.j.id;
ok(!!id1, 'шинэ гишүүн үүслээ #' + id1 + (r.j.error ? ' — ' + r.j.error : ''));
ok(r.j.points === 120, 'анх оруулсан оноо = 120 (15+15+25+10+5+10+25+15), бодит: ' + r.j.points);

console.log('3) Засахад оноо өгөхгүй (дүүрсэн талбар өөрчлөхөд +0)');
r = await req('POST', `/api/members/${id1}/update`, {
  name: 'Тест Оноо', sex: 'm', clan: 'Тестов-шинэ', birth_date: '1990-05-05',
  birth_place: 'Улаанбаатар', phone: '99112233', honors: 'Тест шагнал',
  bio: bio250, photo: '/img/t1'
}, S);
ok(r.status === 200 && r.j.points === 0, 'өөрчлөхөд +0 (бодит: ' + r.j.points + ')');

console.log('4) Хоосон талбар нөхөх = +15');
r = await req('POST', `/api/members/${id1}/update`, {
  name: 'Тест Оноо', sex: 'm', clan: 'Тестов-шинэ', birth_date: '1990-05-05',
  birth_place: 'Улаанбаатар', phone: '99112233', honors: 'Тест шагнал',
  bio: bio250, photo: '/img/t1', death_date: '2020-01-01'
}, S);
ok(r.j.points === 15, 'нас барсан огноо +15 (бодит: ' + r.j.points + ')');

console.log('5) Намтар 1000+ = +45 (200+ аль хэдийн авсан, давхардсангүй)');
const bio1100 = 'Намтарын урт мэдээлэл. '.repeat(50); // ~1150 тэмдэгт
r = await req('POST', `/api/members/${id1}/update`, {
  name: 'Тест Оноо', sex: 'm', clan: 'Тестов-шинэ', birth_date: '1990-05-05',
  birth_place: 'Улаанбаатар', phone: '99112233', honors: 'Тест шагнал',
  bio: bio1100, photo: '/img/t1', death_date: '2020-01-01'
}, S);
ok(r.j.points === 45, 'bio_1000 +45 (бодит: ' + r.j.points + ')');

console.log('6) Нэмэлт зураг: 1 бүр +3, дээд тал 5');
for (let i = 1; i <= 5; i++) {
  r = await req('POST', `/api/members/${id1}/photos`, { url: '/img/extra' + i }, S);
  ok(r.j.points === 3, `зураг ${i}/5 = +3 (бодит: ${r.j.points})`);
}
r = await req('POST', `/api/members/${id1}/photos`, { url: '/img/extra6' }, S);
ok(r.status === 400, '6-р нэмэлт зураг = 400 (дээд тал 5)');

console.log('7) Нэг хүний 200 хязгаар');
r = await req('POST', `/api/members/${id1}/events`, { date: '2020-01-01', title: 'Тест үйл явдал' }, S);
ok(r.j.points === 5, '1-р үйл явдал +5 → нийт 200 хүрлээ (бодит: ' + r.j.points + ')');
r = await req('POST', `/api/members/${id1}/events`, { date: '2020-02-01', title: 'Тест2' }, S);
ok(r.j.points === 0, '2-р үйл явдал +0 (200 хязгаар хүрсэн, бодит: ' + r.j.points + ')');

console.log('8) /api/scores бүтэц');
r = await req('GET', '/api/scores', null, S);
const j = r.j;
const finalScore = base.score + 200; // энэ удаагийн шинэ гишүүнээс: 120+15+45+15+5 = 200
ok(r.status === 200 && j.levels && j.levels.length === 10, '10 түвшин ирлээ');
ok(j.me.score === finalScore,
  'нийт оноо = ' + finalScore + ' (' + base.score + ' + 200), бодит: ' + j.me.score);
// түвшний дүрмийн хуулбар (0/100/300/700/...) — эцсийн оноогоор шалгана
const RULES = [[0, 'Үр'], [100, 'Найлзуур'], [300, 'Нахиа'], [700, 'Навч'], [1200, 'Салаа'],
  [1800, 'Их мод'], [2600, 'Угийн хөтөч'], [3600, 'Угийн бичээч'], [5000, 'Удмын түүхч'], [7000, 'Угийн бичгийн эзэн']];
let exp = RULES[0], expIdx = 0;
RULES.forEach((l, i) => { if (finalScore >= l[0]) { exp = l; expIdx = i; } });
ok(!!j.me.level && j.me.level.name === exp[1],
  'түвшин: ' + (j.me.level && j.me.level.n) + '. ' + (j.me.level && j.me.level.name) +
  ' (' + finalScore + ' → ' + exp[1] + ')');
const expNext = RULES[expIdx + 1];
ok(expNext
  ? !!(j.me.next && j.me.next.name === expNext[1] && j.me.need === expNext[0] - finalScore)
  : (j.me.next == null && j.me.need === 0),
  'дараагийн ' + (expNext
    ? '«' + expNext[1] + '» (' + expNext[0] + ') хүртэл ' + j.me.need + ' оноо'
    : 'түвшингүй (дээд түвшин)'));
ok(Array.isArray(j.board) && j.board.length >= 6, 'leaderboard: ' + j.board.length + ' хэрэглэгч');
ok(j.board.some(b => b && b.me), 'миний мөр leaderboard-д байна (#' + j.me.rank + ')');
ok(Array.isArray(j.rules) && j.rules.length === 13, 'дүрмийн жагсаалт: ' + j.rules.length + ' заалт');
ok(Array.isArray(j.steps) && j.steps.length > 0,
  'дараагийн алхам: ' + j.steps.length + ' санал, тэргүүн: «' +
  (j.steps[0] && j.steps[0].label) + ' +' + (j.steps[0] && j.steps[0].points) + '»');
ok(Array.isArray(j.records) && j.records.length >= 10, 'миний бүртгэл: ' + j.records.length + ' мөр');
ok(j.me.breakdown.info === base.info + 165 && j.me.breakdown.photo === base.photo + 30 &&
  j.me.breakdown.event === base.event + 5,
  'бүрэлдэхүүн (Δ): мэдээлэл+' + (j.me.breakdown.info - base.info) +
  ' зураг+' + (j.me.breakdown.photo - base.photo) +
  ' үйл явдал+' + (j.me.breakdown.event - base.event) + ' (хүлээх:165/30/5)');

console.log('9) Хоосон талбарын өрсөлдөөн — хэн түрүүлж бөглөнө тэр авна');
r = await req('POST', '/api/members', { name: 'Тест Хоосон', sex: 'f' }, S);
const id2 = r.j.id;
ok(!!id2 && r.j.points === 15, 'зөвхөн нэр+хүйс = +15 (бодит: ' + r.j.points + ')');

r = await req('POST', '/api/register', {
  phone: '7' + String(Date.now() % 1e7).padStart(7, '0'), // давхар бүртгэлээс зайлсхийх
  name: 'Тест Хэрэглэгч', password: 'Test1234', confirm: 'Test1234'
});
ok(r.status === 200 && !!r.cookie, 'шинэ хэрэглэгч бүртгэгдлээ (жирийн эрх)');
const U = r.cookie;
if (U) {
  r = await req('POST', '/api/link-requests', { member_id: id2 }, U);
  ok(r.status === 200, 'карт холбох хүсэлт илгээлээ');
  r = await req('GET', '/api/link-requests', null, S);
  const rq = (r.j.requests || []).find(x => x.member_id === id2);
  ok(!!rq, 'хүсэлт админд ирлээ');
  if (rq) {
    r = await req('POST', `/api/link-requests/${rq.id}/approve`, {}, S);
    ok(r.status === 200, 'админ зөвшөөрлөө → шинэ хэрэглэгчтэй карт холбогдлоо');

    r = await req('POST', `/api/members/${id2}/update`,
      { name: 'Тест Хоосон', sex: 'f', clan: 'Өрсөлдөгчийн овог' }, U);
    ok(r.status === 200 && r.j.points === 15,
      'хоосон овогийг ШИНЭ хүн нөхөхөд +15 (бодит: ' + r.j.points + ')');

    r = await req('POST', `/api/members/${id2}/update`,
      { name: 'Тест Хоосон', sex: 'f', clan: 'Суперийн овог' }, S);
    ok(r.status === 200 && r.j.points === 0,
      'супер дахин захихад +0 — анх бөглөсөн хүн хэвээр (бодит: ' + r.j.points + ')');

    r = await req('GET', '/api/scores', null, U);
    ok(r.j.me.score === 15 && (r.j.records || []).some(x => x.label === 'Ургийн овог'),
      'анх бөглөсөн хүний оноо хэвээр үлдлээ: ' + r.j.me.score +
      ' оноо, «Ургийн овог» бүртгэлд байна');
  }
} else {
  ok(false, 'шинэ хэрэглэгч бүртгэл амжилтгүй');
}

console.log('10) Цэвэрлэгээ — тест гишүүдийг устгах');
r = await req('POST', `/api/members/${id1}/delete`, {}, S);
ok(r.status === 200, 'тест гишүүн #' + id1 + ' устгалаа');
r = await req('POST', `/api/members/${id2}/delete`, {}, S);
ok(r.status === 200, 'тест гишүүн #' + id2 + ' устгалаа');
r = await req('GET', '/api/scores', null, S);
ok(!(r.j.records || []).some(x => x.member === 'Тест Оноо' || x.member === 'Тест Хоосон'),
  'устгасны дараа бүртгэлээс ариллаа (нийт оноо: ' + r.j.me.score + ')');

console.log('▶ ' + pass + ' амжилттай, ' + fail + ' амжилтгүй');
process.exit(fail ? 1 : 0);
