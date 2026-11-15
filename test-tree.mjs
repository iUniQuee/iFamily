// Модын байрлал + харилцааны (цусны хүрээ) шалгуурууд
import {
  layoutTree, buildRelations, visibleSet, bioSet, focusSet,
  isAncestor, sortMembers, CARD_W, ROW_H, H_GAP
} from './src/tree.js';
import { buildFullLayout, COUPLE_GAP, SIB_GAP } from './src/fulltree.js';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function eq(name, a, b) {
  ok(name + ` (${JSON.stringify(a)} === ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

// ---------- fixture: 4 үеийн гэр бүл ----------
// 1: Өвөг (m, 1950) + Эмээ (f, 1952)
// 2: Аав (m, 1975) + Ээж (f, 1978); Аавын Ах (m, 1977)
// 3: Би (m, 2000) + Ах (m, 1998) + Дүү (m, 2004); Би-ийн хань (f, 2001)
// 4: Хүү (m, 2025)
const members = [
  { id: 1, name: 'Өвөг', sex: 'm', birth_year: '1950' },
  { id: 2, name: 'Эмээ', sex: 'f', birth_year: '1952' },
  { id: 3, name: 'Аав', sex: 'm', birth_year: '1975' },
  { id: 4, name: 'Аавын ах', sex: 'm', birth_year: '1977' },
  { id: 5, name: 'Ээж', sex: 'f', birth_year: '1978' },
  { id: 6, name: 'Ах', sex: 'm', birth_year: '1998' },
  { id: 7, name: 'Би', sex: 'm', birth_year: '2000' },
  { id: 8, name: 'Дүү', sex: 'm', birth_year: '2004' },
  { id: 9, name: 'Хань', sex: 'f', birth_year: '2001' },
  { id: 10, name: 'Хүү', sex: 'm', birth_year: '2025' }
];
const children = [
  { father_id: 1, mother_id: 2, child_id: 3, rel_type: 'Төрсөн' },
  { father_id: 1, mother_id: 2, child_id: 4, rel_type: 'Төрсөн' },
  { father_id: 3, mother_id: 5, child_id: 6, rel_type: 'Төрсөн' },
  { father_id: 3, mother_id: 5, child_id: 7, rel_type: 'Төрсөн' },
  { father_id: 3, mother_id: 5, child_id: 8, rel_type: 'Төрсөн' },
  { father_id: 7, mother_id: 9, child_id: 10, rel_type: 'Төрсөн' }
];
const unions = [
  { a_id: 1, b_id: 2 },
  { a_id: 3, b_id: 5 },
  { a_id: 7, b_id: 9 }
];

console.log('1) Байрлал (layout)');
const L = layoutTree({ members, children, unions });
eq('бүх гишүүн байрлана', L.nodes.map(n => n.id).sort((a, b) => a - b), members.map(m => m.id));
ok('давхардсан байрлалгүй', new Set(L.nodes.map(n => n.id)).size === L.nodes.length);
const byId = new Map(L.nodes.map(n => [n.id, n]));
ok('эцэг 1 үе дээшээ байна', byId.get(1).y < byId.get(3).y && byId.get(3).y < byId.get(7).y && byId.get(7).y < byId.get(10).y);
ok('хоёр үеийн хоорондох зай ≥ ROW_H', byId.get(3).y - byId.get(1).y >= ROW_H);
ok('хос нэг мөрөнд байна', byId.get(1).y === byId.get(2).y && byId.get(7).y === byId.get(9).y);
const unitGap = byId.get(2).x - (byId.get(1).x + CARD_W);
ok('хосын картууд зэргэлдээ (slot)', unitGap >= 0 && unitGap < 60, 'gap=' + unitGap);

console.log('2) Эрэмбэ (төрсөн он)');
ok('нийтлэг үед ахмадаас залуу (Аав 1975 < Аавын ах 1977)', byId.get(3).x < byId.get(4).x);
ok('ах (1998) Би (2000) -ээс зүүн талд', byId.get(6).x < byId.get(7).x);
ok('Би (2000) Дүү (2004) -ээс зүүн талд', byId.get(7).x < byId.get(8).x);

console.log('3) Салбар хоорондох давхардалгүй');
const gen3 = L.nodes.filter(n => n.gen === 2).sort((a, b) => a.x - b.x);
let overlap = false;
for (let i = 1; i < gen3.length; i++) {
  if (gen3[i].x < gen3[i - 1].x + CARD_W) overlap = true;
}
ok('3-р үеийн картууд давхардахгүй', !overlap);
ok('хүүхэд нь эцгийнхээ доор байрлана', byId.get(10).x > byId.get(7).x - CARD_W && byId.get(10).x < byId.get(7).x + CARD_W + 60);

console.log('4) Холбоос');
ok('эхнэр/нөхөр холбоос 3 байна', L.edges.filter(e => e.t === 's').length === 3);
const branches = L.edges.filter(e => e.t === 'b');
ok('хосын нэгдсэн салбар 3 байна (3 хос)', branches.length === 3, 'олдсон: ' + branches.length);
eq('бүх 6 хүүхэд нэгдсэн салбарт багтана',
  branches.flatMap(e => e.kids).sort((a, b) => a - b), [3, 4, 6, 7, 8, 10]);
ok('тус дугаар биш 1 шугмаар: хуваагдсан эцэг/эхийн шугам үлдээгүй',
  L.edges.filter(e => e.t === 'c').length === 0, 'олдсон: ' + L.edges.filter(e => e.t === 'c').length);
ok('гол шугмаар хосын төвөөс хүүхдийн эгнээ хүртээ унана',
  branches.every(e => e.y1 > e.y0 && e.x > 0));
ok('салааны тоо = хүүхдийн тоо (6)',
  branches.reduce((n, e) => n + e.stubs.length, 0) === 6);

console.log('4б) Хосгүй хоёр эцэг/эх ч НЭГ шугмаар (зурагийн дагуу)');
const nu = layoutTree({
  members: [
    { id: 1, name: 'Аав', sex: 'm', birth_year: '1970' },
    { id: 2, name: 'Ээж', sex: 'f', birth_year: '1972' },
    { id: 3, name: 'Хүүхэд', sex: 'm', birth_year: '1999' }
  ],
  children: [{ father_id: 1, mother_id: 2, child_id: 3, rel_type: 'Төрсөн' }],
  unions: []
});
eq('хосгүй ч1 нэгдсэн салбар байна', nu.edges.filter(e => e.t === 'b').length, 1);
eq('тусдаа шугам үлдээгүй', nu.edges.filter(e => e.t === 'c').length, 0);
const nub = nu.edges.find(e => e.t === 'b');
eq('хүүхэд салбарт багтана', nub.kids, [3]);

console.log('4г) Ганц эцэгтэй хүүхэд — нэг босоо блок, эцэг дээрээ');
const solo = layoutTree({
  members: [
    { id: 1, name: 'Аав', sex: 'm', birth_year: '1970' },
    { id: 2, name: 'Хүүхэд', sex: 'm', birth_year: '1995' }
  ],
  children: [{ father_id: 1, mother_id: null, child_id: 2, rel_type: 'Төрсөн' }],
  unions: []
});
const soloB = solo.edges.filter(e => e.t === 'b');
eq('ганц эцэг =1 нэгдсэн блок', soloB.length, 1);
eq('муруй тусдаа шугам үгүй', solo.edges.filter(e => e.t === 'c').length, 0);
eq('гол шугмаа эцгийн төвөөс эхэлнэ', soloB[0].x, new Map(solo.nodes.map(n => [n.id, n])).get(1).x + CARD_W / 2);
ok('эцэг нь хүүхдээсээ дээд мөрөнд', new Map(solo.nodes.map(n => [n.id, n])).get(1).y < new Map(solo.nodes.map(n => [n.id, n])).get(2).y);
eq('нэг хүүхэд — нэг салаа', soloB[0].stubs.length, 1);

console.log('4д) Эцэг/эхийн холбоос ТУСДАА мөрөнд бичигдсэн ч НЭГДСЭН блок');
const split = layoutTree({
  members: [
    { id: 1, name: 'Аав', sex: 'm', birth_year: '1970' },
    { id: 2, name: 'Ээж', sex: 'f', birth_year: '1972' },
    { id: 3, name: 'Хүүхэд', sex: 'm', birth_year: '1999' },
    { id: 4, name: 'Охин', sex: 'f', birth_year: '2001' }
  ],
  children: [
    { father_id: 1, mother_id: null, child_id: 3, rel_type: 'Төрсөн' }, // эцэг ТУСДАА мөрөнд
    { father_id: null, mother_id: 2, child_id: 3, rel_type: 'Төрсөн' },  // ээж ТУСДАА мөрөнд
    { father_id: 1, mother_id: null, child_id: 4, rel_type: 'Төрсөн' },
    { father_id: null, mother_id: 2, child_id: 4, rel_type: 'Төрсөн' }
  ],
  unions: [{ a_id: 1, b_id: 2 }]
});
const spEdges = split.edges.filter(e => e.t === 'b');
spEdges.forEach(e => e.kids.sort((a, b) => a - b));
eq('тусдаа мөртэй холбоос ч 1 нэгдсэн салбар', spEdges.length, 1);
eq('муруй тусдаа шугам үлдээгүй', split.edges.filter(e => e.t === 'c').length, 0);
eq('хоёр хүүхэд нэг салбарт', spEdges[0].kids, [3, 4]);
const spN = new Map(split.nodes.map(n => [n.id, n]));
eq('гол шугмаа хосын төвөөс эхэлнэ', spEdges[0].x, Math.round((spN.get(1).x + spN.get(2).x) / 2 + CARD_W / 2));
eq('хосын нэгдмэл платформ байна', split.edges.filter(e => e.t === 'p').length, 1);

console.log('5) Циклээс хамгаалах (буруу өгөгдөл)');
const cyclic = layoutTree({
  members: [{ id: 1, name: 'А' }, { id: 2, name: 'Б' }],
  children: [{ father_id: 1, mother_id: null, child_id: 2 }, { father_id: 2, mother_id: null, child_id: 1 }],
  unions: []
});
ok('цикльтэй өгөгдөл дуусна, 2 карт байрлана', cyclic.nodes.length === 2);

console.log('6) Хосын давхардсан гэрлэлт (нэг хүний 2 хань)');
const poly = layoutTree({
  members: [{ id: 1, name: 'А' }, { id: 2, name: 'Б' }, { id: 3, name: 'В' }],
  children: [],
  unions: [{ a_id: 1, b_id: 2 }, { a_id: 1, b_id: 3 }]
});
eq('3 карт нэг слотод', poly.nodes.length, 3);
ok('нэг мөрөнд байна', new Set(poly.nodes.map(n => n.y)).size === 1);

console.log('7) Хүрээ (closeCircle) — гэрлэлтээр холбогдсон хүн хаагдана');
// Хань(9)-ийн эцэг/ээж = «Би»-ийн хадам өвөг/ээж — цусны хүрээд багтахгүй
const m2 = [...members, { id: 11, name: 'Хадам өвөг' }, { id: 13, name: 'Хадам ээж' }];
const c2 = [...children,
  { father_id: 11, mother_id: 13, child_id: 9, rel_type: 'Төрсөн' }
];
const u2 = [...unions, { a_id: 11, b_id: 13 }];
const rel2 = buildRelations(c2, u2);
const vMe = visibleSet(rel2, 7); // «Би»
ok('өөрөө хүрээндээ байна', vMe.has(7));
ok('эцэг/ээж хүрээндээ байна', vMe.has(3) && vMe.has(5));
ok('өвөг/эмээ хүрээндээ байна (бүх үеийн өвөг)', vMe.has(1) && vMe.has(2));
ok('ах/дүү хүрээндээ байна', vMe.has(6) && vMe.has(8));
ok('авга (3-ын ах = 4) хүрээндээ байна', vMe.has(4));
ok('хүүхэд, хань хүрээндээ байна', vMe.has(10) && vMe.has(9));
ok('❌ хадам өвөг (гэрлэлтээр л холбогдсон) хаагдана', !vMe.has(11));
const vUncle = visibleSet(rel2, 4); // Аавын ахын хүрээ
ok('авга өөрийн хүрээгээс харна', vUncle.has(4) && vUncle.has(1) && vUncle.has(3));
ok('авгын хүрээд дүүгийн хүүхэд хүрнэ (нагац)', vUncle.has(7));
ok('❌ авгын хүрээд хадам өвөг байхгүй', !vUncle.has(11));
ok('❌ хадам ээж хүрээнд байхгүй', !vUncle.has(13));

console.log('8) Намтарын нууцлал (ойр хамаарал)');
const bio7 = bioSet(rel2, 7);
ok('эцэг/ээж, ах/дүү, хань, хүүхэд нээгдэнэ',
  [3, 5, 6, 8, 9, 10].every(id => bio7.has(id)));
ok('авга (4) нээгдэнэ', bio7.has(4));
ok('өвөг/эмээ нээгдэнэ (dist ≤ 3)', bio7.has(1) && bio7.has(2));
ok('❌ хадам өвөг намтар хаагдана', !bio7.has(11));
ok('❌ хадам ээж намтар хаагдана', !bio7.has(13));

console.log('9) Фокус-горим');
const f7 = focusSet(rel2, 7);
ok('фокус: эцэг/ээж, өвөг, ах/дүү', [3, 5, 1, 2, 6, 8].every(id => f7.has(id)));
ok('фокус: хань, хүүхэд, ач', [9, 10].every(id => f7.has(id)));
ok('фокус: авга (4) ба үеэл', f7.has(4));
const f4 = focusSet(rel2, 4);
ok('авгын фокуст түүний ах/дүү, өвөг байна', f4.has(3) && f4.has(1) && f4.has(2));
ok('авгын фокуст хадам өвөг байхгүй', !f4.has(11));

console.log('10) Цикл илрүүлэлт (isAncestor)');
ok('эцэг хүүхдийнхээ удамд байна', isAncestor(rel2, 1, 7));
ok('хүүхэд эцгийнхээ удамд БИШ', !isAncestor(rel2, 7, 1));
ok('өөрөө өөрийнхөө удам', isAncestor(rel2, 7, 7));

console.log('11) Эрэмбэ (жагсаалт/сонголт) — төрсөн он, сар');
const list = sortMembers([
  { id: 1, name: 'Тодорхойгүй', birth_year: '' },
  { id: 2, name: 'Болд', birth_year: '1990-ы он' },
  { id: 3, name: 'Аяа', birth_year: '1985' },
  { id: 4, name: 'Бэлэг', birth_year: '1990', birth_date: '1990-03-01' },
  { id: 5, name: 'Цэцэг', birth_year: '1990', birth_date: '1990-01-05' }
]);
eq('ахмадаас залуу, сарын дараалал, төгсгөлд нь тодорхойгүй',
  list.map(x => x.id), [3, 5, 4, 2, 1]);

console.log('12) Хоосон мод');
const empty = layoutTree({ members: [], children: [], unions: [] });
eq('хоосон nodes', empty.nodes.length, 0);

console.log('13) «Бүтэн мод» — үеийн ХАТУУ мөр + аккордеон');
// 1+2 Дашням/Төрбат · 3 Намжил · 4 Цагаан · 5 Хулгана · 6 Сувдэрдэнэ · 7 Эрдэнэчимэг
// 8 Мажиг (Намжилын ах) · 9 Ганхүү · 10 Энгүүн · 11 Тэлмүүн · 12 Баярсайхан
// 13 Мягмардож · 14 Маралмаа · 15 Болд · 16 Мэндбилэг (Баярсайханы эцэг/эх — холын худ)
const fMembers = [
  { id: 1, name: 'Дашням', sex: 'm', birth_year: '1910' },
  { id: 2, name: 'Төрбат', sex: 'f', birth_year: '1912' },
  { id: 3, name: 'Намжил', sex: 'm', birth_year: '1935' },
  { id: 4, name: 'Цагаан', sex: 'm', birth_year: '1913' },
  { id: 5, name: 'Хулгана', sex: 'f', birth_year: '1937' },
  { id: 6, name: 'Сувдэрдэнэ', sex: 'f', birth_year: '1960' },
  { id: 7, name: 'Эрдэнэчимэг', sex: 'f', birth_year: '1967' },
  { id: 8, name: 'Мажиг', sex: 'm', birth_year: '1941' },
  { id: 9, name: 'Ганхүү', sex: 'm', birth_year: '1958' },
  { id: 10, name: 'Энгүүн', sex: 'm', birth_year: '1990' },
  { id: 11, name: 'Тэлмүүн', sex: 'm', birth_year: '1993' },
  { id: 12, name: 'Баярсайхан', sex: 'm', birth_year: '1967' },
  { id: 13, name: 'Мягмардож', sex: 'm', birth_year: '1989' },
  { id: 14, name: 'Маралмаа', sex: 'f', birth_year: '1997' },
  { id: 15, name: 'Болд', sex: 'm', birth_year: '1940' },
  { id: 16, name: 'Мэндбилэг', sex: 'f', birth_year: '1942' },
  { id: 17, name: 'Долгор', sex: 'f', birth_year: '1943' },
  { id: 18, name: 'Мажгийн хүү', sex: 'm', birth_year: '1966' }
];
const fChildren = [
  { father_id: 1, mother_id: 2, child_id: 3 },
  { father_id: 1, mother_id: 2, child_id: 8 },
  { father_id: 4, mother_id: null, child_id: 5 },
  { father_id: 3, mother_id: 5, child_id: 6 },
  { father_id: 3, mother_id: 5, child_id: 7 },
  { father_id: 6, mother_id: 9, child_id: 10 },
  { father_id: 6, mother_id: 9, child_id: 11 },
  { father_id: 12, mother_id: 7, child_id: 13 },
  { father_id: 12, mother_id: 7, child_id: 14 },
  { father_id: 15, mother_id: 16, child_id: 12 },
  { father_id: 8, mother_id: 17, child_id: 18 }
];
const fUnions = [
  { a_id: 1, b_id: 2 }, { a_id: 3, b_id: 5 }, { a_id: 6, b_id: 9 },
  { a_id: 7, b_id: 12 }, { a_id: 15, b_id: 16 }, { a_id: 8, b_id: 17 }
];
const fRel = buildRelations(fChildren, fUnions);
const F = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10 });
const FN = new Map(F.nodes.map(n => [n.id, n]));
const rowOf = (id) => (FN.has(id) ? FN.get(id).y / ROW_H : null);
const has = (id) => FN.has(id);

ok('анхдагч нээлттэй салбар = өөрийн эцэг/эх (#6)', F.open === 6);
ok('анх ороход цусан холбоотой бүх үе (өвөө/эмээ) ХАРАГДАНА',
  [1, 2, 3, 4, 5, 8].every(id => has(id)));
ok('2-р мөр: эцэг/эх (Сувдэрдэнэ, Ганхүү) + авга (Эрдэнэчимэг), өвөө/эмээний доор',
  rowOf(6) === rowOf(9) && rowOf(9) === rowOf(7) &&
  rowOf(6) === rowOf(5) + 1 && rowOf(6) === rowOf(10) - 1);
ok('2-р мөр: өөрөө + ах/дүү', rowOf(10) === rowOf(11) && rowOf(10) > rowOf(6));
eq('нээлттэй хосын доторх зай', FN.get(6).x - (FN.get(9).x + CARD_W), COUPLE_GAP);
eq('ах/дүү нарын зай = SIB_GAP (.generation-row)', FN.get(11).x - (FN.get(10).x + CARD_W), SIB_GAP);
ok('Эрдэнэчимэг нөхөр (Баярсайхан) ба хүүхдүүдтэйгээ анхдагчаар харагдана',
  has(7) && has(12) && has(13) && has(14));
ok('холын худ (Болд, Мэндбилэг) ХЭЗЭЭ Ч гарахгүй', !has(15) && !has(16));
ok('эцэг/эх хүүхдээсээ нэг мөр дээшээ',
  [[6, 10], [9, 10], [6, 11]].every(([p, c]) =>
    has(p) && has(c) && FN.get(p).y < FN.get(c).y));
const rowGroups = new Map();
for (const n of F.nodes) {
  if (!rowGroups.has(n.y)) rowGroups.set(n.y, []);
  rowGroups.get(n.y).push(n);
}
ok('мөр бүрт давхцсан картгүй', [...rowGroups.values()].every(list => {
  const s = list.slice().sort((a, b) => a.x - b.x);
  return s.every((n, i) => i === 0 || n.x >= s[i - 1].x + CARD_W);
}));
ok('бүх карт мөрөндөө (y нь ROW_H-ын үржвэр)',
  F.nodes.every(n => n.y % ROW_H === 0));
ok('анхдагч харагдац 4 мөр (өвөө/эмээ → эцэг/эх → ах/дүү → хүүхэд)',
  F.height === 4 * ROW_H);
ok('нээлттэй гэр бүл (Сувдэрдэнэ+Ганхүү) НЭГ мөрөнд, зэрэгцээ (аав зүүн, ээж баруун)',
  rowOf(6) === rowOf(9) && FN.get(6).x - (FN.get(9).x + CARD_W) === COUPLE_GAP);
const centerOf = (ids) => {
  const xs = ids.map(i => FN.get(i));
  return (Math.min(...xs.map(n => n.x)) + Math.max(...xs.map(n => n.x + CARD_W))) / 2;
};
ok('эцэг/эх хос өөрийн хүүхдүүдийнхээ голд', Math.abs(centerOf([6, 9]) - centerOf([10, 11])) <= 2);

const F2 = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10, openId: 7 });
const FN2 = new Map(F2.nodes.map(n => [n.id, n]));
const has2 = (id) => FN2.has(id);
const rowOf2 = (id) => (FN2.has(id) ? FN2.get(id).y / ROW_H : null);
ok('Эрдэнэчимэг дээр дарахад нээгдэнэ', F2.open === 7);
ok('нөхөр Баярсайхан хажууд нь гарна', has2(12) && FN2.get(12).y === FN2.get(7).y);
ok('хүүхдүүд (Мягмардож, Маралмаа) доор нь гарна',
  has2(13) && has2(14) && FN2.get(13).y > FN2.get(7).y && FN2.get(14).y === FN2.get(13).y);
ok('үеэл (Энгүүн #10, Тэлмүүн #11) эцэг/эх дотроо хураагдана',
  !has2(10) && !has2(11) && has2(6));
// ХҮРГЭН/БЭР дээшээ холбогдохгүй — зөвхөн төрсөн хүүхэд эцэг/эхтэйгээ
{
  const kidRefs = F2.edges.filter(e => e.t === 'b').flatMap(e => e.kids || []);
  const upFromInLaw = F2.edges.some(e => e.t === 'c' && e.c === 9 && [3, 5].includes(e.p));
  ok('хүргэн (#9) эхнэрийнхээ эцэг/эхтэй дээшээ холбогдохгүй',
    !kidRefs.includes(9) && !upFromInLaw && kidRefs.includes(6));
}
ok('нээсэн хүн мөрийн баруун ЗАХАД, ах/дүү нар зүүн талд',
  FN2.get(7).x > FN2.get(6).x);
ok('ах/дүүгийн хань (Ганхүү #9) хамаагүй тул харагдахгүй',
  !has2(9) && has2(6) && has2(12));
ok('нээхэд ээж модноос алга болохгүй', has2(6));
const FP1 = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10, openId: 6 });
const FN3 = new Map(FP1.nodes.map(n => [n.id, n]));
ok('ээж дээр дарахад ээж зүүн, аав (хань) баруун талд зэрэгцэнэ',
  FN3.has(9) && FN3.has(6) && FN3.get(9).y === FN3.get(6).y &&
  FN3.get(9).x - (FN3.get(6).x + CARD_W) === COUPLE_GAP);
ok('аавын тал үргэлж зүүн, эхийн тал баруун (аав 3 < ээж 5)',
  FN3.get(3).x < FN3.get(5).x);
{
  // ХҮҮХДИЙН хань нуугдана — зөвхөн өөрийн хань хажууд нь
  const mini = buildFullLayout({
    members: [
      { id: 1, name: 'Аав', sex: 'm', birth_year: '1950' },
      { id: 2, name: 'Ээж', sex: 'f', birth_year: '1952' },
      { id: 3, name: 'Хүү', sex: 'm', birth_year: '1975' },
      { id: 4, name: 'Бэр', sex: 'f', birth_year: '1977' },
      { id: 5, name: 'Ах', sex: 'm', birth_year: '1948' }
    ],
    rel: buildRelations([
      { father_id: 1, mother_id: 2, child_id: 3 },
      { father_id: 1, mother_id: 2, child_id: 5 }
    ], [{ a_id: 3, b_id: 4 }, { a_id: 1, b_id: 2 }]),
    viewerId: 3, openId: 1
  });
  const MN = new Set(mini.nodes.map(n => n.id));
  ok('хүүхдийн хань (бэр #4) нуугдана, өөрийн хань (ээж #2) хажууд хэвээр',
    MN.has(3) && !MN.has(4) && MN.has(2) && MN.has(5));
}
ok('ээж дээр дарахад ах/дүү зүүн, ээж өөрөө баруун',
  FN3.get(6).y === FN3.get(7).y && FN3.get(6).x > FN3.get(7).x);
ok('ээж дээр дарахад: өвөг (1,2,4), ах/дүү (7), авга (8), хань (9), хүүхэд (10,11)',
  [1, 2, 4, 7, 8, 9, 10, 11].every(id => FN3.has(id)) &&
  ![13, 14, 18, 15, 16].some(id => FN3.has(id)));
const FP2 = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10, openId: 9 });
const FN4 = new Map(FP2.nodes.map(n => [n.id, n]));
ok('аав дээр дарахад ээж (хань) хажууд нь хэвээр үлдэнэ',
  FN4.has(6) && FN4.has(9) && FN4.get(6).y === FN4.get(9).y);
ok('аав дээр дарахад эхийн тал (өвөө #4, эмээ #5, авга #7) ч харагдана',
  FN4.has(4) && FN4.has(5) && FN4.has(7) && FN4.get(4).y < FN4.get(6).y);
ok('анхдагч харагдацад «Би» карт харагдана', has(10));
ok('салбар нээхэд үеэл «Би» (#10) эцэг/эх дотроо хураагдана', !has2(10));
ok('дээд үе (өвөө/эмээ #1, эцэг/эх #3) ба авга #8 (эцгийн ах) байрандаа',
  has2(1) && has2(3) && has2(8));
ok('холын худ (Болд #15, Мэндбилэг #16) дээшээ хязгааргүй сунагдана',
  has2(15) && has2(16) && FN2.get(15).y < FN2.get(12).y);
ok('openable: авга (7) ба үеэл (13) хоёул нээгдэнэ',
  F2.openable.includes(7) && F2.openable.includes(13));

console.log('14) initiallyOpen / NeverRender — хүснэгтийн дүрэм');
// Анхдагч харагдац = ЗӨВХӨН нээлттэй гэр бүлийн гишүүд (in_law_* хань нуугдмал)
ok('✅ бэр/хүргэн хань (Долгор #17) D1-ийн гишүүн тул анхдагчаар харагдана', has(17));
ok('✅ үеэл (#18) ч анхдагчаар харагдана — бүх цусан гишүүн модонд орно', has(18));
ok('✅ нээлттэй гэр бүлийн in-law эцэг (Ганхүү #9) харагдана', has(9));
// Дахин дарахад хураах (toggle) — ижил хүний шууд хүүхдүүд нуугдана
const FC = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10, openId: 6, closedKids: true });
const hasC = (id) => FC.nodes.some(n => n.id === id);
ok('toggle: дахин дарахад хүүхдүүд (10,11) хураагдана', !hasC(10) && !hasC(11));
ok('toggle: эцэг/эх, ах/дүү, өөрийн хань, бусад гэр бүл хэвээр үлдэнэ',
  hasC(1) && hasC(3) && hasC(5) && hasC(7) && hasC(9) && !hasC(12) && !hasC(13));

const F3 = buildFullLayout({ members: fMembers, rel: fRel, viewerId: 10, openId: 8 });
const has3 = (id) => F3.nodes.some(n => n.id === id);
const row3 = (id) => F3.nodes.find(n => n.id === id).y / ROW_H;
ok('Мажиг дээр дарахад хань (Долгор) зэрэгцэнэ', has3(17) && row3(17) === row3(8));
ok('түүний хүүхэд дараагийн мөрөнд гарна', has3(18) && row3(18) > row3(8));
ok('холын худ (Болд #15, Мэндбилэг #16) өвгийн шугамд орохгүй',
  !has3(15) && !has3(16));
// Дүрэм ③: зөвхөн сонгосон хүний ШУУД хүүхдүүд дэлэгдэнэ (ач/зээ, үеэл гарахгүй)
ok('ээж #6 нээхэд ач (13,14) хураагдана', !FN3.has(13) && !FN3.has(14));
ok('үеэл (#18) хураагдана', !FN3.has(18));
ok('ах/дүү (#7) харагдана, түүний хань (#12) харагдахгүй',
  FN3.has(7) && !FN3.has(12));
ok('хань талын эцэг/эх: хань нь өвгийн шугамд байвал л дээшээ гарна',
  !F.nodes.some(n => n.id === 15 || n.id === 16) &&
  has2(15) && has2(16) && FN2.get(15).y < FN2.get(12).y &&
  !F3.nodes.some(n => n.id === 15 || n.id === 16));

console.log('');
console.log(`▶ ${pass} амжилттай, ${fail} амжилтгүй`);
process.exit(fail ? 1 : 0);
