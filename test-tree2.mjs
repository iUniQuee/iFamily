// «БҮТЭН МОД» — 2-р ТЕСТ МОД (зургуудаас санаа авсан жишээ).
//
// Зураг дээрх бүтэц:
//   • Дээд мөр: Дашням + Төрбат (хос, ногоон холбоос) · Цагаан (ах/дүү)
//   • Дунд мөр: Мажиг · Намжил (сонгогдсон) + Хулгана — 1942-2000 | 58, 1940-2001 | 61
//   • Доод мөр: Н.Батэрдэнэ · Б.Баярсайхан · Н.Эрдэнэчимэг (сонгогдсон, ★/i/✎)
//     — зөвхөн ЦӨӨН хүүхэд харагдана, бусад нь `👥 +N` тэмдэг дор нуугдана.
//   • Н.Эрдэнэчимэг доор нь хосын зангилаа → дараагийн үе.
import { buildRelations, CARD_W, ROW_H } from './src/tree.js';
import { buildFullLayout, COUPLE_GAP } from './src/fulltree.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function eq(name, a, b) {
  ok(name + ` (${JSON.stringify(a)} === ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

// ---------- fixture: зураг дээрх гэр бүл ----------
// 1 Дашням + 2 Төрбат → 3 Намжил, 8 Мажиг
// 4 Цагаан — Дашнямын ах/дүү (дээд мөр)
// 3 Намжил + 5 Хулгана → 10 хүүхэд (6 Сувдэрдэнэ, 7 Эрдэнэчимэг, 20 Н.Батэрдэнэ,
//    21 Б.Баярсайхан, 22..27 — бусад нь `👥 +N` дор)
// 6 Сувдэрдэнэ + 9 Ганхүү → 10 Энгүүн, 11 Тэлмүүн
// 7 Эрдэнэчимэг + 12 Баярсайхан (хань, зөвхөн нээхэд) → 13 Мягмардож, 14 Маралмаа
// 15/16 — холын худ (Баярсайханы эцэг/эх) → ХЭЗЭЭ Ч гарахгүй
const members = [
  { id: 1, name: 'Дашням', sex: 'm', birth_year: '1910' },
  { id: 2, name: 'Төрбат', sex: 'f', birth_year: '1912' },
  { id: 3, name: 'Намжил', sex: 'm', birth_year: '1942' },
  { id: 4, name: 'Цагаан', sex: 'm', birth_year: '1913' },
  { id: 5, name: 'Хулгана', sex: 'f', birth_year: '1940' },
  { id: 6, name: 'Н.Сувдэрдэнэ', sex: 'f', birth_year: '1958' },
  { id: 7, name: 'Н.Эрдэнэчимэг', sex: 'f', birth_year: '1967' },
  { id: 8, name: 'Мажиг', sex: 'm', birth_year: '1944' },
  { id: 9, name: 'Ганхүү', sex: 'm', birth_year: '1956' },
  { id: 10, name: 'Энгүүн', sex: 'm', birth_year: '1988' },
  { id: 11, name: 'Тэлмүүн', sex: 'm', birth_year: '1991' },
  { id: 12, name: 'Б.Баярсайхан', sex: 'm', birth_year: '1967' },
  { id: 13, name: 'Мягмардож', sex: 'm', birth_year: '1990' },
  { id: 14, name: 'Маралмаа', sex: 'f', birth_year: '1995' },
  { id: 15, name: 'Болд', sex: 'm', birth_year: '1940' },
  { id: 16, name: 'Мэндбилэг', sex: 'f', birth_year: '1942' },
  { id: 20, name: 'Н.Батэрдэнэ', sex: 'f', birth_year: '1960' },
  { id: 21, name: 'Б.Баярсайхан', sex: 'm', birth_year: '1962' },
  // Намжил + Хулганагийн бусад хүүхдүүд — мөрөнд `👥 +N` дор нуугдана
  { id: 22, name: 'Н.Энхчимэг', sex: 'f', birth_year: '1963' },
  { id: 23, name: 'Н.Уранчимэг', sex: 'f', birth_year: '1965' },
  { id: 24, name: 'Н.Оюунчимэг', sex: 'f', birth_year: '1968' },
  { id: 25, name: 'Н.Батзориг', sex: 'm', birth_year: '1970' },
  { id: 26, name: 'Н.Отгончимэг', sex: 'f', birth_year: '1972' },
  { id: 27, name: 'Н.Батбаатар', sex: 'm', birth_year: '1975' }
];
const children = [
  { father_id: 1, mother_id: 2, child_id: 3 },
  { father_id: 1, mother_id: 2, child_id: 8 },
  { father_id: 4, mother_id: null, child_id: 5 },   // Цагаан — Хулганагийн эцэг (дээд мөр)
  { father_id: 3, mother_id: 5, child_id: 6 },
  { father_id: 3, mother_id: 5, child_id: 7 },
  { father_id: 3, mother_id: 5, child_id: 20 },
  { father_id: 3, mother_id: 5, child_id: 21 },
  { father_id: 3, mother_id: 5, child_id: 22 },
  { father_id: 3, mother_id: 5, child_id: 23 },
  { father_id: 3, mother_id: 5, child_id: 24 },
  { father_id: 3, mother_id: 5, child_id: 25 },
  { father_id: 3, mother_id: 5, child_id: 26 },
  { father_id: 3, mother_id: 5, child_id: 27 },
  { father_id: 9, mother_id: 6, child_id: 10 },
  { father_id: 9, mother_id: 6, child_id: 11 },
  { father_id: 12, mother_id: 7, child_id: 13 },
  { father_id: 12, mother_id: 7, child_id: 14 },
  { father_id: 15, mother_id: 16, child_id: 12 }
];
const unions = [
  { a_id: 1, b_id: 2 },   // Дашням + Төрбат (ногоон холбоос)
  { a_id: 3, b_id: 5 },   // Намжил + Хулгана
  { a_id: 6, b_id: 9 },
  { a_id: 7, b_id: 12 },
  { a_id: 15, b_id: 16 }
];
const rel = buildRelations(children, unions);

const rows = (L) => {
  const m = new Map();
  for (const n of L.nodes) {
    if (!m.has(n.y)) m.set(n.y, []);
    m.get(n.y).push(n);
  }
  for (const v of m.values()) v.sort((a, b) => a.x - b.x);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
};
const overlaps = (L) => {
  let bad = 0;
  for (const [, list] of rows(L)) {
    for (let i = 1; i < list.length; i++) if (list[i].x < list[i - 1].x + CARD_W) bad++;
  }
  return bad;
};

console.log('1) Зураг дээрх бүтэц — 3 үе, viewer = Н.Батэрдэнэ (#20)');
const T = buildFullLayout({ members, rel, viewerId: 20 });
const N = new Map(T.nodes.map(n => [n.id, n]));
const rowOf = (id) => (N.has(id) ? N.get(id).y / ROW_H : null);
const has = (id) => N.has(id);

ok('анхдагч нээлттэй салбар = өөрийн эцэг/эх (#3 Намжил)', T.open === 3);
ok('анх ороход цусан холбоотой бүх үе (өвөө/эмээ) харагдана',
  [1, 2, 4].every(id => has(id)) && has(8));   // 8 = эцэг/эхийн ах/дүү
ok('2-р мөр: эцэг/эх (Намжил + Хулгана) нэг мөрөнд, өвөө/эмээний доор',
  rowOf(3) === rowOf(5) && rowOf(3) === rowOf(1) + 1);
ok('доод мөр: viewer + 9 ах/дүү бүгд НЭГ мөрөнд',
  [6, 7, 20, 21, 22, 23, 24, 25, 26, 27].every(id => has(id) && rowOf(id) === rowOf(20)));
ok('viewer-ийн үе viewer-ийн эцэг/эхийн МӨРНИЙ доор',
  rowOf(20) === rowOf(3) + 1);
// 4 мөр: өвөө/эмээ → эцэг/эх → viewer+ах/дүү → үеэл (13,14)
eq('мод дөрвөн мөр өндөртэй (өвөө/эмээ → эцэг/эх → хүүхэд → үеэл)', T.height, 4 * ROW_H);

console.log('2) «Хэдэн хүүхдийн л харуулж байгаа» — 10 хүүхэд нэг мөрөнд, давхцалгүй');
const kidRow = rows(T).find(([y]) => y === N.get(20).y)[1].map(n => n.id);
const BLOOD_KIDS = [6, 7, 20, 21, 22, 23, 24, 25, 26, 27];
eq('нээлттэй гэр бүлийн 10 цусан хүүхэд бүгд багтана',
  kidRow.filter(id => BLOOD_KIDS.includes(id)).length, 10);
eq('мөрөнд давхцсан карт байхгүй', overlaps(T), 0);
// Дүрэм: эхлээд ганц картууд (ахмадаас залуу), дараа нь хосууд.
ok('ганц хүүхдүүд ахмадаас залуу (20:1960 → 21:1962 → … → 27:1975)',
  kidRow.filter(id => BLOOD_KIDS.includes(id) && !rel.sp.has(id)).join(',') ===
  [20, 21, 22, 23, 24, 25, 26, 27].join(','),
  kidRow.join(','));
ok('хосууд хамгийн төгсгөлд, цусан гишүүнийхээ онoор (6:1958 → 7:1967)',
  kidRow.filter(id => BLOOD_KIDS.includes(id) && rel.sp.has(id)).join(',') === '6,7',
  kidRow.join(','));
ok('хань нь хүүхдийнхээ ЯГ хажууд (Сувдэрдэнэ+Ганхүү, Эрдэнэчимэг+Баярсайхан)',
  has(9) && has(12) &&
  N.get(9).y === N.get(6).y && N.get(12).y === N.get(7).y);
ok('үеэл (Мягмардож, Маралмаа) ч анхдагчаар харагдана — D1-ийн бүх гишүүн модонд орно',
  has(13) && has(14) && rowOf(13) === rowOf(14) && rowOf(13) === rowOf(20) + 1);
ok('хань хажууд нь (10px) — Сувдэрдэнэ + Ганхүү',
  N.get(9).y === N.get(6).y && N.get(9).x - (N.get(6).x + CARD_W) === COUPLE_GAP);
ok('ах/дүү нарын зай 46px', N.get(21).x - (N.get(20).x + CARD_W) === 46);

console.log('3) Сонгосон хүн (Н.Эрдэнэчимэг) нээхэд — хос + хүүхдүүд');
const E = buildFullLayout({ members, rel, viewerId: 20, openId: 7 });
const EN = new Map(E.nodes.map(n => [n.id, n]));
ok('нээгдсэн салбар = #7', E.open === 7);
ok('нөхөр Баярсайхан зэрэгцэнэ (★/i/✎ картын хажууд)',
  EN.has(12) && EN.get(12).y === EN.get(7).y && EN.get(12).x - (EN.get(7).x + CARD_W) === COUPLE_GAP);
ok('хүүхдүүд нь дараагийн мөрөнд (хосын зангилааны доор)',
  EN.has(13) && EN.has(14) && EN.get(13).y === EN.get(14).y && EN.get(13).y === EN.get(7).y + ROW_H);
ok('хүүхдүүд эцэг/эхийнхээ голд',
  Math.abs((EN.get(12).x + EN.get(7).x + CARD_W) / 2 - (EN.get(13).x + EN.get(14).x + CARD_W) / 2) <= 2);
ok('ах/дүүгийн хань (Ганхүү #9) харагдахгүй, өөрийн нөхөр (#12) хажууд хэвээр',
  !EN.has(9) && EN.has(6) && EN.has(12) && EN.get(12).y === EN.get(7).y);
eq('нээлттэй үедээ ч давхцалгүй', overlaps(E), 0);
ok('холын худ: анхдагч харагдацад орохгүй, нээсэн үед дээшээ харагдана',
  !T.nodes.some(n => n.id === 15 || n.id === 16) &&
  EN.has(15) && EN.has(16) && EN.get(15).y < EN.get(12).y);

console.log('4) Зөвхөн цөөн хүүхэдтэй гэр бүл (зургийн Мажиг)');
// Мажиг + Долгор → 2 хүүхэд
const small = buildRelations(
  [...children, { father_id: 8, mother_id: 17, child_id: 18 }, { father_id: 8, mother_id: 17, child_id: 19 }],
  [...unions, { a_id: 8, b_id: 17 }]
);
const sM = [...members, { id: 17, name: 'Долгор', sex: 'f', birth_year: '1946' },
  { id: 18, name: 'Мажгийн хүү', sex: 'm', birth_year: '1968' },
  { id: 19, name: 'Мажгийн охин', sex: 'f', birth_year: '1970' }];
const S = buildFullLayout({ members: sM, rel: small, viewerId: 20, openId: 8 });
const SN = new Map(S.nodes.map(n => [n.id, n]));
ok('Мажиг нээхэд хань Долгор зэрэгцэнэ', SN.has(17) && SN.get(17).y === SN.get(8).y);
eq('2 хүүхэд нэг мөрөнд, зай 46px',
  SN.get(19).x - (SN.get(18).x + CARD_W), 46);
ok('2 хүүхэд эцэг/эхийнхээ голд',
  Math.abs((SN.get(17).x + SN.get(8).x + CARD_W) / 2 - (SN.get(18).x + SN.get(19).x + CARD_W) / 2) <= 2);
eq('цөөн хүүхэдтэй гэр бүлд давхцалгүй', overlaps(S), 0);

console.log('');
console.log(`▶ ${pass} амжилттай, ${fail} амжилтгүй`);
process.exit(fail ? 1 : 0);
