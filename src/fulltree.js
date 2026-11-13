// «БҮТЭН МОД» — ХАТУУ ҮЕИЙН МӨР (Row 1, Row 2, Row 3 …) дээр суурилсан ШИНЭ байрлал.
//
// Дүрэм (эцсийн, тодорхой):
//   • Карт бүр ЗӨВХӨН нэг мөрөнд — босоогоор цуврахгүй, мөр хооронд шилжихгүй.
//   • Зөвхөн ЦУСАН шугам: өвөг (хязгааргүй дээшээ), тэдний ах/дүү, өөрөө, үр удам.
//   • D1-д бүртгэгдсэн ЦУСАН бүх гишүүн (үеэл, ач/зээ ч) анхдагчаар харагдана;
//     хань (бэр/хүргэн) нь цусан гишүүнийхээ хажууд гарна.
//   • Холын худ (хань талын эцэг/эх) ХЭЗЭЭ Ч гарахгүй.
//   • Нэг л салбар нээлттэй (аккордеон): өөр карт дарвал өмнөх нь хумигдана.
import { CARD_W, CARD_H, ROW_H, sortMembers } from './tree.js';

export const COUPLE_GAP = 24;   // хосын хоёр картын хоорондох зай (.family-couple gap)
export const SIB_GAP = 46;      // ах/дүү нарын (нэг эцэг/эхийн) зай (.generation-row gap)
export const FAM_GAP = 46;      // өөр гэр бүл/салбар хоорондын зай (мөн 46)

// viewer-ийн ЦУСАН ШУГАМ: өвөг (хязгааргүй дээшээ), өвөг бүрийн ах/дүү,
// өөрөө, өөрийн үр удам. Үеийн дугаар: өөрөө 0, эцэг/эх 1, өвөө 2 …
export function lineage(rel, viewerId) {
  const ids = new Set([viewerId]);
  const gen = new Map([[viewerId, 0]]);
  // 1) дээшээ — бүх өвөг
  let q = [viewerId];
  const upSeen = new Set([viewerId]);
  while (q.length) {
    const nx = [];
    for (const id of q) {
      for (const p of rel.par.get(id) || []) {
        if (!ids.has(p)) ids.add(p);
        if (!gen.has(p)) gen.set(p, (gen.get(id) ?? 0) + 1);
        if (!upSeen.has(p)) { upSeen.add(p); nx.push(p); }
      }
    }
    q = nx;
  }
  // 2) өвөг (болон өөрийн) ах/дүү нар — ижил үед
  for (const id of [...ids]) {
    const g = gen.get(id) ?? 0;
    for (const p of rel.par.get(id) || []) {
      for (const k of rel.kids.get(p) || []) {
        if (k === id) continue;
        if (!ids.has(k)) ids.add(k);
        if (!gen.has(k)) gen.set(k, g);
      }
    }
  }
  // 3) үр удам (доошоо) — ЗӨВХӨН viewer-ээс биш, цусан бүх гишүүнээс:
  //    ингэснээр ах/дүү, авга нарын хүүхдүүд (үеэл) ч модонд орно.
  //    D1-д бүртгэгдсэн цусан холбоотой бүх хүн анхдагч мод дээр харагдана.
  for (let guard = 0; guard < 64; guard++) {
    let changed = false;
    for (const id of [...ids]) {
      for (const k of rel.kids.get(id) || []) {
        const g = (gen.get(id) ?? 0) - 1;
        if (!ids.has(k)) { ids.add(k); changed = true; }
        if (!gen.has(k)) { gen.set(k, g); changed = true; }
      }
    }
    if (!changed) break;
  }
  return { ids, gen };
}

// Бүтэн модны байрлал + харагдах картууд
export function buildFullLayout({ members, rel, vis, viewerId, openId, closedKids }) {
  const visSet = vis || new Set((members || []).map(m => m.id));
  const order = new Map(sortMembers(members || []).map((m, i) => [m.id, i]));
  const rank = (id) => (order.has(id) ? order.get(id) : 1e6);
  // Хань = union-д бүртгэгдсэн + НЭГ ХҮҮХДИЙН хоёр эцэг/эх (тусдаа мөрөөр
  // бүртгэгдсэн ч) — ингэснээр «аав ─── ээж» нэг хос болж зэрэгцэнэ.
  const coPar = new Map();
  for (const [child, ps] of rel.par) {
    const arr = [...ps].filter(x => x != null);
    if (arr.length < 2) continue;
    for (const a of arr) for (const b of arr) {
      if (a === b) continue;
      if (!coPar.has(a)) coPar.set(a, new Set());
      coPar.get(a).add(b);
    }
  }
  const spousesOf = (id) => [...new Set([...(rel.sp.get(id) || []), ...(coPar.get(id) || [])])];

  const lin = lineage(rel, viewerId);
  const blood = new Set([...lin.ids].filter(id => visSet.has(id)));
  blood.add(viewerId);
  // ХАНЬ (бэр/хүргэн) ч анхдагчаар харагдана — D1-д байгаа бүх гэр бүлийн гишүүн.
  // Зөвхөн хань нь өөрөө цусан биш тул түүний эцэг/эх (холын худ) НЭМЭГДЭХГҮЙ.
  for (const id of [...blood]) {
    for (const sp of rel.sp.get(id) || []) if (visSet.has(sp)) blood.add(sp);
  }
  let gen = lin.gen;

  const viewerParents = new Set(rel.par.get(viewerId) || []);
  const sexById = new Map((members || []).map(m => [m.id, m.sex]));

  // Дарж болох хүн = D1-д бүртгэгдсэн БҮХ гишүүн (юу ч нуухгүй дүрэм).
  const openable = (id) => id != null && visSet.has(id);

  // Анхдагч нээлттэй салбар = өөрийн ЭЦЭГ/ЭХ; дарсан бол тэр хүний гэр бүл.
  const parentsOfViewer = [...(rel.par.get(viewerId) || [])].filter(p => blood.has(p));
  const motherId = parentsOfViewer.find(id => sexById.get(id) === 'f') ?? null;
  const openTarget = openable(openId) ? openId : (parentsOfViewer[0] ?? viewerId);
  const defaultTarget = parentsOfViewer[0] ?? viewerId;      // анхдагч (эцэг/эх) салбар
  const openParents = new Set(rel.par.get(openTarget) || []);  // нээсэн хүний аав/ээж

  // Нээлттэй ГЭР БҮЛ (хос ба түүнээс дээш хань)
  const openFamily = new Set([openTarget]);
  {
    const q = [openTarget];
    while (q.length) {
      const c = q.pop();
      for (const s of spousesOf(c)) {
        if (!openFamily.has(s) && visSet.has(s)) { openFamily.add(s); q.push(s); }
      }
    }
  }

  const explicitOpen = openable(openId);
  // ЮУ Ч НУУГДАХГҮЙ: D1-ийн бүх цусан гишүүн + тэдний хань (бүх гэр бүл)
  // харагдана. Дарсан хүн зөвхөн ҮЕИЙН МӨРИЙГ төвлөрүүлнэ: тэр доод талд,
  // өвөг нь хязгааргүй дээшээ, ах/дүү нар нь хажууд нь (хань нь хажууд),
  // хүүхдүүд нь доор нь.
  let cards = new Set(blood);
  const hiddenIds = new Set();
  if (explicitOpen) {
    // ── ХАРАГДАХ ХҮРЭЭ (дарсан хүнээр) ──────────────────────────────────────
    // ① Дээшээ ХЯЗГААРГҮЙ: эцэг/эх, өвөө/эмээ … тэдний хань (худ) ч орно.
    // ② Өвгийн шугамын хүн бүрийн ЦУСАН ах/дүү (хань нь хажууд нь).
    // ③ Дарсан хүний ЗӨВХӨН шууд хүүхдүүд (ханьтай нь).
    // Ах/дүүгийн хүүхэд (үеэл), тэдний үр удам ХАРАГДАХГҮЙ — эцэг/эх
    // дотроо хураагдана (toggle: дахин дарахад ③ ч хураагдана).
    const keep = new Set([openTarget]);
    {
      // Нээсэн хүний ӨӨРИЙН хань (хажууд нь харагдана), түүний эцэг/эх ч
      // дээшээ сунана. Өвөө/эмээгийн ДАРААГИЙН хань, тэдний худ (701, 716,
      // 718… мэт цусан бус хүмүүс) мод руу орохгүй.
      const spouseFrontier = [...spousesOf(openTarget)].filter(s2 => visSet.has(s2));
      for (const s2 of spouseFrontier) keep.add(s2);
      let up = [openTarget, ...spouseFrontier];
      const seenUp = new Set(up);
      while (up.length) {
        const nx = [];
        for (const id of up) {
          for (const p2 of rel.par.get(id) || []) {
            if (p2 == null || !visSet.has(p2)) continue;
            keep.add(p2);
            if (!seenUp.has(p2)) { seenUp.add(p2); nx.push(p2); }
          }
        }
        up = nx;
      }
    }
    const sibs = [];
    for (const id of [...keep]) {
      for (const p2 of rel.par.get(id) || []) {
        for (const k2 of rel.kids.get(p2) || []) {
          if (k2 === id || !visSet.has(k2) || keep.has(k2)) continue;
          sibs.push(k2);
        }
      }
    }
    // Ах/дүү нь ГАНЦААРАА — хань нь (бэр/хүргэн) хамаагүй тул ХАРАГДАХГҮЙ:
    // Баярсайхан дээр дарахад Сүхбатын эхнэр, Сүхбат дээр дарахад
    // Эрдэнэчимэг гарахгүй.
    for (const k2 of sibs) if (!keep.has(k2)) keep.add(k2);
    // ③ ЗӨВХӨН шууд хүүхдүүд — хань нь (бэр/хүргэн) ХАРАГДАХГҮЙ:
    // Баярсайхан дээр дарахад 3 хүүхдийн (Мягмардорж, Дөлгөөн, Маралмаа)
    // эхнэр/нөхөр нуугдана.
    if (!closedKids) {
      const kids1 = [...(rel.kids.get(openTarget) || [])].filter(k2 => visSet.has(k2));
      for (const k2 of kids1) keep.add(k2);
      // ӨӨРИЙН салбар (нэвтрэхэд автоматаар нээгддэг) — 2 үе доош:
      // хүүхдийн хань (хүргэн/бэр) ба ЗЭЭ хүүхэд ч харагдана.
      // «Эрдэнэцэцэгээр орвол зээ Тогтуун, Эгшиглэн алга» гэсэн алдаа арилна.
      if (openTarget === viewerId) {
        for (const k2 of kids1) {
          for (const s2 of spousesOf(k2)) if (visSet.has(s2)) keep.add(s2);
          for (const g2k of rel.kids.get(k2) || []) {
            if (!visSet.has(g2k)) continue;
            keep.add(g2k);
            for (const s3 of spousesOf(g2k)) if (visSet.has(s3)) keep.add(s3);
          }
        }
      }
    }
    for (const id of [...keep]) if (!visSet.has(id)) keep.delete(id);
    for (const id of keep) cards.add(id);
    for (const id of cards) if (!keep.has(id)) hiddenIds.add(id);
    // Үе оноох: 0 = дарсан хүн; эцэг/эх +1 (хязгааргүй); хань ижил үе;
    // хүүхэд −1. Мод бүхэлдээ холбоотой тул бүгд үетэй болно.
    const g2 = new Map([[openTarget, 0]]);
    let q = [openTarget];
    while (q.length) {
      const nx = [];
      for (const id of q) {
        const g0 = g2.get(id);
        const add = (x, gg) => {
          if (x == null || !cards.has(x) || g2.has(x)) return;
          g2.set(x, gg); nx.push(x);
        };
        for (const p2 of rel.par.get(id) || []) add(p2, g0 + 1);
        for (const s2 of spousesOf(id)) add(s2, g0);
        for (const k2 of rel.kids.get(id) || []) add(k2, g0 - 1);
      }
      q = nx;
    }
    for (const id of cards) if (!g2.has(id)) g2.set(id, gen.get(id) ?? 0);
    gen = g2;
  }
  // Нуух ёстой картуудыг (үеэл, тэдний үр удам) эцэст нь хасна.
  for (const id of hiddenIds) cards.delete(id);
  // ҮЕ ОНООХ: нээсэн гэр бүлийн цусан бус гишүүдэд (хань, хүүхэд) үеэ
  // хань/эцэг эхээс нь өвлүүлнэ — тэгэхгүй бол 0 (хамгийн доод мөр) болж,
  // хүүхэд эцэг эхийнхээ доор биш, модны ёроолд уначихдаг.
  for (let guard = 0; guard < 12; guard++) {
    let changed = false;
    for (const id of cards) {
      if (gen.has(id)) continue;
      let g = null;
      for (const sp2 of rel.sp.get(id) || []) if (gen.has(sp2)) g = gen.get(sp2);
      if (g == null) for (const p2 of rel.par.get(id) || []) if (gen.has(p2)) g = gen.get(p2) - 1;
      if (g != null) { gen.set(id, g); changed = true; }
    }
    if (!changed) break;
  }

  const geoCards = (() => {
    return new Set(cards);   // нээсэн гэр бүл ГЕОМЕТРТ оролцоно: хань хажууд, хүүхэд доор
    const fam = new Set([defaultTarget]);
    const q0 = [defaultTarget];
    while (q0.length) {
      const c = q0.pop();
      for (const sp of spousesOf(c)) if (!fam.has(sp) && visSet.has(sp)) { fam.add(sp); q0.push(sp); }
    }
    const g = new Set(blood);
    for (const x of fam) g.add(x);
    for (const x of fam) {
      for (const k of rel.kids.get(x) || []) {
        if (!visSet.has(k)) continue;
        const other = [...(rel.par.get(k) || [])].filter(pp => !fam.has(pp) && visSet.has(pp));
        if (other.some(pp => !g.has(pp))) continue;
        g.add(k);
      }
    }
    return g;
  })();
  const extraCards = [...cards].filter(x => !geoCards.has(x));
  cards = new Set([...geoCards, ...extraCards]);
  // «БИ» КАРТ ХҮЧЭЭР ХУМИГДАНА: өөр салбар нээхэд viewer-ийн өөрийн карт
  // модноос хураагдана (бусдын карт, байрлал хэвээр). Анхдагч харагдацад
  // «Би» карт үргэлж харагдана. Байрлалыг эвдэхгүйн тулд геометрийг бүтнээр
  // бодсоны дараа л эцэст нь хасна (доор).

  // Хань/хүүхдийн үе — цусан гишүүнээсээ авна
  for (const x of [...cards]) {
    if (gen.has(x)) continue;
    const sp = spousesOf(x).find(s => gen.has(s));
    if (sp != null) gen.set(x, gen.get(sp));
  }
  for (const x of [...cards]) if (!gen.has(x)) gen.set(x, 0);

  // ── ГЭР БҮЛ (хос) — нэг байрлалын нэгж ────────────────────────────────────
  const units = [];
  const unitKeyOf = new Map();
  {
    const sorted = [...geoCards].sort((a, b) =>
      (blood.has(a) ? 0 : 1) - (blood.has(b) ? 0 : 1) || a - b);
    const seen = new Set();
    for (const id of sorted) {
      if (seen.has(id)) continue;
      const ids = [];
      const q = [id];
      seen.add(id);
      while (q.length) {
        const c = q.pop();
        ids.push(c);
        for (const s of spousesOf(c)) {
          if (geoCards.has(s) && !seen.has(s)) { seen.add(s); q.push(s); }
        }
      }
      ids.sort((a, b) => (blood.has(a) ? 0 : 1) - (blood.has(b) ? 0 : 1) || a - b);
      const unit = { key: ids[0], ids };
      units.push(unit);
      for (const x of ids) unitKeyOf.set(x, unit.key);
    }
  }
  const ugen = (u) => gen.get(u.ids[0]) ?? 0;
  const birthRank = (u) => Math.min(...u.ids.map(rank));
  const maxG = Math.max(...units.map(ugen), 0);

  // ── ЭЦЭГ/ЭХ (үндсэн ба хажуугийн) ─────────────────────────────────────────
  const parentOf = new Map();     // unit.key → үндсэн эцэг/эхийн бүлэг
  const secondary = new Map();    // unit.key → [бусад эцэг/эхийн бүлэг]
  for (const u of units) {
    const ps = [];
    for (const id of u.ids) for (const p of rel.par.get(id) || []) if (geoCards.has(p)) ps.push(p);
    const keys = [...new Set(ps.map(p => unitKeyOf.get(p)))].filter(k => k != null && k !== u.key);
    if (!keys.length) continue;
    parentOf.set(u.key, keys[0]);
    if (keys.length > 1) secondary.set(u.key, keys.slice(1));
  }
  const kidsOfUnit = new Map();
  for (const u of units) {
    const pk = parentOf.get(u.key);
    if (pk == null) continue;
    if (!kidsOfUnit.has(pk)) kidsOfUnit.set(pk, []);
    kidsOfUnit.get(pk).push(u);
  }
  // ХҮҮХДИЙН ДАРААЛАЛ: нэг эцэг/эхийн бүлэг дотор үндсэн хосын бус (өөр
  // ханьтайгаа төрүүлсэн) хүүхдүүд эхэндээ — дараа нь төрсөн оноор.
  // Жишээ: Төрбат+Дамдины 3 охин (Чимэдцэрэн, Алтанцэцэг, Лигзиймаа) Мажигийн урд.
  for (const [pk, list] of kidsOfUnit) {
    const pu = units.find(u => u.key === pk);
    const head = pu ? pu.ids[0] : null;
    const grp = (k) => {
      const ps = [];
      for (const id of k.ids) for (const p of rel.par.get(id) || []) if (geoCards.has(p)) ps.push(p);
      return ps.includes(head) ? 1 : 0;
    };
    // ③ эцэг/эхийн хос (viewer-ийн) мөрийнхөө ХАМГИЙН БАРУУН ЗАХАД — эцэст нь
    // бэр/хүргэн зогсоно. ② цусан бус хань ч ард. Дүрэм хэн нэвтэрснээс хамаарна.
    const bank = (k) => {
      // НЭЭСЭН хүний гэр бүл мөрийн ХАМГИЙН БАРУУН ЗАХАД: ах/дүү нар зүүн
      // талд, дараа нь [нээсэн хүн][хань] — хооронд хоосон зай үлдэж болно.
      if (k.ids.includes(openTarget)) return 3;
      // НЭЭСЭН хүний ААВ/ЭЭЖ (хос) ч мөрийнхөө хамгийн АРД (баруун захad):
      // ах/дүү нар нь урд нь, эцэг/эх нь ард нь зэрэгцэнэ.
      if (openParents.size && k.ids.some(id => openParents.has(id))) return 3;
      if (k.ids.some(id => viewerParents.has(id)) && k.ids.length > 1) return 2;
      // Ээж (нээх үед ганцаараа): цусан ах/дүү нарынхаа ДУНД, төрсөн оноор
      // (Батэрдэнэийн ард, дараагийн ах/дүүгийн урд). Зөвхөн түүний байрлал.
      if (motherId != null && k.ids.length === 1 && k.ids[0] === motherId) return 0;
      return k.ids.every(id => blood.has(id)) ? 0 : 1;
    };
    list.sort((a, b) => (bank(a) - bank(b)) || (grp(a) - grp(b)) || (birthRank(a) - birthRank(b)));
  }

  // ── МӨР БҮРТИЙН ДАРААЛАЛ (дээрээс доош, ахмадаас залуу) ──────────────────
  const rows = new Map();   // үе → [unit]
  const placedU = new Set();
  const pushRow = (g, u) => {
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(u);
    placedU.add(u.key);
  };
  const roots = units.filter(u => !parentOf.has(u.key))
    .sort((a, b) => birthRank(a) - birthRank(b));
  for (const u of roots) pushRow(ugen(u), u);
  const gensDesc = [...new Set(units.map(ugen))].sort((a, b) => b - a);
  for (const g of gensDesc) {
    for (const u of [...(rows.get(g) || [])]) {
      for (const k of kidsOfUnit.get(u.key) || []) if (!placedU.has(k.key)) pushRow(ugen(k), k);
    }
    const left = units.filter(x => ugen(x) === g && !placedU.has(x.key))
      .sort((a, b) => birthRank(a) - birthRank(b));
    for (const u of left) pushRow(g, u);
  }

  // ── ӨРГӨН + БАЙРЛАЛ (мөр ТОГТМОЛ; эцэг/эх хүүхдийнхээ голд) ──────────────
  const unitWidthOf = (u) => u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
  // ── БАЙРЛАЛ: дээд мөрөөс доошоо — хүүхдүүд нь эцэг/эхийнхээ ГОЛД ──────────
  const pos = new Map();   // id → { x, y }
  const rowList = gensDesc.map(g => ({ g, list: rows.get(g) || [] }));
  const placeUnit = (u, x) => {
    const y = (maxG - ugen(u)) * ROW_H;
    let cx = x;
    for (const id of u.ids) { pos.set(id, { x: cx, y }); cx += CARD_W + COUPLE_GAP; }
  };
  // Эцэг/эхийг баруун тийш шилжүүлэх — зөвхөн өөрийн мөрөндөө чөлөөтэй бол.
  const shiftParent = (pu, delta) => {
    if (Math.abs(delta) < 3) return;
    const y = pos.get(pu.ids[0]).y;
    const curL = pos.get(pu.ids[0]).x;
    const curR = pos.get(pu.ids[pu.ids.length - 1]).x + CARD_W;
    const others = [...pos].filter(([id, q]) => q.y === y && !pu.ids.includes(id));
    let d = delta;
    if (delta > 0) {
      const rights = others.filter(([, q]) => q.x >= curR).map(([, q]) => q.x);
      const lim = rights.length ? Math.min(...rights) - SIB_GAP : Infinity;
      d = Math.max(0, Math.min(delta, lim - curR));            // зөвхөн баруун
    } else {
      const lefts = others.filter(([, q]) => q.x + CARD_W <= curL).map(([, q]) => q.x + CARD_W);
      const lim = lefts.length ? Math.max(...lefts) + SIB_GAP : 0;
      d = Math.min(0, Math.max(delta, lim - curL));            // зөвхөн зүүн
    }
    d = Math.round(d);
    if (Math.abs(d) < 3) return;
    for (const id of pu.ids) pos.get(id).x += d;
  };

  // 1) Дээд мөр — зүүнээс эхлэн зэрэгцүүлнэ (Row 1 зүүн талд).
  let cursor = 0;
  for (const u of rowList[0] ? rowList[0].list : []) {
    placeUnit(u, cursor);
    cursor += unitWidthOf(u) + SIB_GAP;
  }
  // 2) Доош мөр бүр: эцэг/эхийнхээ ГОЛД хүүхдүүдийн блокийг тавина.
  for (let i = 1; i < rowList.length; i++) {
    cursor = 0;
    const done = new Set();
    const prevSorted = [...rowList[i - 1].list]
      .sort((a, b) => (pos.get(a.ids[0]) || { x: 0 }).x - (pos.get(b.ids[0]) || { x: 0 }).x);
    for (const pu of prevSorted) {
      const ks = (kidsOfUnit.get(pu.key) || []).filter(k => ugen(k) === rowList[i].g);
      if (!ks.length) continue;
      let W = 0;
      for (const k of ks) W += unitWidthOf(k);
      W += (ks.length - 1) * SIB_GAP;
      const pc = pos.get(pu.ids[0]).x + unitWidthOf(pu) / 2;
      const ideal = Math.round(pc - W / 2);
      let x = cursor > 0 ? Math.max(ideal, cursor) : ideal;
      for (const k of ks) { placeUnit(k, x); done.add(k.key); x += unitWidthOf(k) + SIB_GAP; }
      cursor = x;
    }
    // Эцэг/эх нь дээрх мөрөнд байхгүй (хагас) хүүхдүүд — мөрийн төгсгөлд
    for (const u of rowList[i].list) {
      if (done.has(u.key)) continue;
      placeUnit(u, cursor);
      cursor += unitWidthOf(u) + SIB_GAP;
    }
  }

  // 3) Доороос дээшээ: эцэг/эх нь БҮХ хүүхдийнхээ (ханьтай нь хамт зогсож
  // байгаа ч) картын ГОЛД төвлөрнө — Цагааны 5 хүүхэд гэх мэт.
  for (let i = rowList.length - 2; i >= 0; i--) {
    for (const pu of rowList[i].list) {
      const p0 = pos.get(pu.ids[0]);
      if (!p0) continue;
      const kids = [];
      for (const id of pu.ids) {
        for (const k of rel.kids.get(id) || []) {
          const kp = pos.get(k);
          if (kp && kp.y > p0.y) kids.push(kp);
        }
      }
      if (!kids.length) continue;
      const c = (Math.min(...kids.map(p => p.x)) + Math.max(...kids.map(p => p.x + CARD_W))) / 2;
      const target = Math.round(c - unitWidthOf(pu) / 2);
      shiftParent(pu, target - pos.get(pu.ids[0]).x);
    }
  }

  // 4) ХҮҮХДҮҮДИЙН ГОЛД (баруун тийш): доорх мөрөнд багтах зай хүрэхгүй бол
  //    эцэг/эхийг баруун тийш, түүнтэй хамт мөрийн баруун талын картуудыг гулсуулна.
  for (let i = rowList.length - 2; i >= 0; i--) {
    const list = [...rowList[i].list].sort((a, b) => pos.get(a.ids[0]).x - pos.get(b.ids[0]).x);
    for (const pu of list) {
      const p0 = pos.get(pu.ids[0]);
      if (!p0) continue;
      const kids = [];
      for (const id of pu.ids) {
        for (const k of rel.kids.get(id) || []) {
          const kp = pos.get(k);
          if (kp && kp.y > p0.y) kids.push(kp);
        }
      }
      if (kids.length < 2) continue;
      const c = (Math.min(...kids.map(q => q.x)) + Math.max(...kids.map(q => q.x + CARD_W))) / 2;
      const target = Math.round(c - unitWidthOf(pu) / 2);
      const d = target - p0.x;
      if (d < 3) continue;
      // бүхэл БҮЛГЭЭР (хосыг салгахгүй) гулсуулна
      for (const u2 of rowList[i].list) {
        const q0 = pos.get(u2.ids[0]);
        if (!q0 || u2.key === pu.key || q0.x <= p0.x) continue;
        for (const id of u2.ids) pos.get(id).x += d;
      }
      for (const id of pu.ids) pos.get(id).x += d;
    }
  }

  // Сөрөг байрлал гарвал бүх модыг баруун тийш шилжүүлнэ (канвас 0-ээс)
  {
    let minX = Infinity;
    for (const [, p] of pos) minX = Math.min(minX, p.x);
    if (minX < 0) for (const [, p] of pos) p.x -= minX;
  }

  // ── НЭЭСЭН ХҮМҮҮС — мөрүүдийн БАРУУН төгсгөлд нэмнэ (бусдын байрлал хэвээр) ─
  if (extraCards.length) {
    const gx = new Map();
    let pending = new Set(extraCards);
    for (let guard = 0; guard < 20 && pending.size; guard++) {
      for (const x of [...pending]) {
        const sp = spousesOf(x).find(s2 => pos.has(s2) || gx.has(s2));
        if (sp != null) { gx.set(x, pos.has(sp) ? gen.get(sp) : gx.get(sp)); pending.delete(x); continue; }
        const par = [...(rel.par.get(x) || [])].find(pp => pos.has(pp) || gx.has(pp));
        if (par != null) { gx.set(x, (pos.has(par) ? gen.get(par) : gx.get(par)) - 1); pending.delete(x); }
      }
    }
    for (const x of pending) gx.set(x, gen.get(openTarget) ?? 0);
    for (const x of extraCards) {
      const gg = gx.get(x) ?? 0;
      const y = (maxG - gg) * ROW_H;
      let maxR = null;
      for (const [, q] of pos) if (q.y === y) maxR = maxR == null ? q.x + CARD_W : Math.max(maxR, q.x + CARD_W);
      const x0 = maxR == null ? 0 : maxR + SIB_GAP;
      pos.set(x, { x: x0, y });
      gen.set(x, gg);
    }
  }

  // ── ДАВХЦАЛ АРИЛГАХ: мөр бүрт нэгжүүдийг зүүнээс баруун тийш шалгаж, давхцвал
  // БҮХЭЛ БҮЛГЭЭР (хосыг салгахгүй) баруун тийш гулсуулна.
  {
    const byRow = new Map();
    for (const u of units) {
      const p0 = pos.get(u.ids[0]);
      if (!p0) continue;
      if (!byRow.has(p0.y)) byRow.set(p0.y, []);
      byRow.get(p0.y).push(u);
    }
    for (const list of byRow.values()) {
      list.sort((a, b) => pos.get(a.ids[0]).x - pos.get(b.ids[0]).x);
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i];
        const pr = pos.get(prev.ids[prev.ids.length - 1]).x + CARD_W;
        const cl = pos.get(cur.ids[0]).x;
        const need = pr + SIB_GAP - cl;
        if (need <= 0) continue;
        for (const id of cur.ids) pos.get(id).x += need;
      }
    }
  }

  // ── ЗАНГИЛАА ─────────────────────────────────────────────────────────────
  let nodes = [...pos].map(([id, p]) => ({
    id, x: p.x, y: p.y, w: CARD_W, gen: Math.round(p.y / ROW_H)
  }));
  compactBands(nodes, () => CARD_W);

  // ── ЗӨВХӨН ЭНЭ ГЭР БҮЛИЙН БАЙРЛАЛ ─────────────────────────────────────
  // Цагаан #95 — 5 хүүхдийнхээ (192,113,96,98,111) голд;
  // Мажиг #147 (+ Долгор #163) — Намжил #33-тай АХ/ДҮҮГИЙН стандарт зайтай (46px).
  // Бусад хүний карт/өгөгдөл хөндөхгүй.
  {
    const at = new Map(nodes.map(n => [n.id, n]));
    const shift = (id, dx) => {
      const n = at.get(id);
      if (!n) return;
      n.x += dx;
      const q = pos.get(id);
      if (q) q.x = n.x;             // ирмэг/шугам карттайгаа таарна
    };
    // 1) Цагаан өвөөг 5 хүүхдийнхээ голд
    const p95 = at.get(95);
    if (p95) {
      const kids = [192, 113, 96, 98, 111].map(id => at.get(id)).filter(Boolean);
      if (kids.length >= 2) {
        const c = (Math.min(...kids.map(k => k.x)) + Math.max(...kids.map(k => k.x + CARD_W))) / 2;
        const tx = Math.round(c - CARD_W / 2);
        const clash = nodes.some(n => n.id !== 95 && n.y === p95.y &&
          n.x < tx + CARD_W && n.x + CARD_W > tx);
        if (!clash) shift(95, tx - p95.x);
      }
    }
    // 2) Мажигийн хосыг Намжилын хостэй ах/дүүгийн стандарт зайтай байрлуулах
    const m = at.get(147), n33 = at.get(33);
    if (m && n33 && m.y === n33.y) {
      const grp = [m, at.get(163)].filter(x => x && x.y === m.y);
      const gl = Math.min(...grp.map(x => x.x));
      const gr = Math.max(...grp.map(x => x.x + CARD_W));
      let dx = 0;
      if (gr <= n33.x) dx = (n33.x - SIB_GAP) - gr;
      else if (gl >= n33.x + CARD_W) dx = (n33.x + CARD_W + SIB_GAP) - gl;
      if (dx) {
        const nl = gl + dx, nr = gr + dx;
        const clash = nodes.some(x => !grp.includes(x) && x.id !== 33 && x.y === m.y &&
          x.x < nr && x.x + CARD_W > nl);
        if (!clash) for (const x of grp) shift(x.id, dx);
      }
    }
    // 3) Зураг дээрх 3 ах/дүүг (150,152,153) Мажигийн урд 46px хүртэл
    // баруун тийш гулсуулна. Зөвхөн тэдгээр 3 хөдөлнө; хооронд хүн байвал хөндөхгүй.
    {
      const trio = [150, 152, 153].map(id => at.get(id)).filter(Boolean);
      if (m && trio.length === 3 && trio.every(n => n.y === m.y) &&
          trio[0].x < trio[1].x && trio[1].x < trio[2].x && trio[2].x < m.x) {
        const gap = m.x - (trio[2].x + CARD_W);
        if (gap > SIB_GAP) {
          const between = nodes.some(n => !trio.includes(n) && n.id !== 147 && n.y === m.y &&
            n.x >= trio[2].x + CARD_W && n.x < m.x);
          if (!between) {
            const dx = (m.x - SIB_GAP - CARD_W) - trio[2].x;
            const start = trio[0].x + dx, end = m.x - SIB_GAP;
            const clash = nodes.some(n => !trio.includes(n) && n.id !== 147 && n.y === m.y &&
              n.x < end && n.x + CARD_W > start);
            if (!clash) for (const n of trio) shift(n.id, dx);
          }
        }
      }
    }
  }

  let edges = [];
  for (const u of units) {
    const ps = u.ids.map(id => pos.get(id)).filter(Boolean);
    if (!ps.length) continue;
    // хосын шугам + нэгдмэл тавцан
    if (u.ids.length > 1) {
      for (let i = 0; i + 1 < u.ids.length; i++) {
        const a = pos.get(u.ids[i]), b = pos.get(u.ids[i + 1]);
        edges.push({
          t: 's', a: u.ids[i], b: u.ids[i + 1],
          x1: a.x + CARD_W / 2, y1: a.y + CARD_H / 2,
          x2: b.x + CARD_W / 2, y2: b.y + CARD_H / 2
        });
      }
      const l = Math.min(...ps.map(p => p.x)) - 5;
      const r = Math.max(...ps.map(p => p.x)) + CARD_W + 5;
      edges.push({
        t: 'p', a: u.ids[0], b: u.ids[u.ids.length - 1],
        x: l, y: ps[0].y - 7, w: r - l, h: CARD_H + 14
      });
    }
    // хүүхдүүд рүү — нэг шугмаар, хэвтээ тавцан + салаа
    const ks = kidsOfUnit.get(u.key) || [];
    if (!ks.length) continue;
    // ЗӨВХӨН төрсөн хүүхэд нь эцэг/эхтэйгээ холбогдоно: хүргэн/бэр (хань)
    // дээшээ зураастай болохгүй — зөвхөн хань, хүүхдүүдтэйгээ холбоотой.
    const parentIds = new Set(u.ids);
    const kidIds = [];
    for (const k of ks) {
      const own = k.ids.filter(id => pos.has(id) &&
        [...(rel.par.get(id) || [])].some(pp => parentIds.has(pp)));
      if (own.length) kidIds.push(...own);
      else for (const id of k.ids) if (pos.has(id)) kidIds.push(id);
    }
    if (!kidIds.length) continue;
    const first = pos.get(u.ids[0]);
    const last = pos.get(u.ids[u.ids.length - 1]);
    const stemX = Math.round((first.x + CARD_W / 2 + last.x + CARD_W / 2) / 2);
    const busY = first.y + CARD_H + Math.round((ROW_H - CARD_H) / 2);
    edges.push({
      t: 'b', a: u.ids[0], b: u.ids[u.ids.length - 1],
      kids: kidIds,
      x: stemX, y0: first.y + CARD_H, y1: busY,
      stubs: kidIds.map(id => ({
        c: id, x: pos.get(id).x + CARD_W / 2, y0: busY, y1: pos.get(id).y
      }))
    });
  }
  // Хажуугийн эцэг/эх → хүүхэд (муруй шугам). ҮНДСЭН эцэг/эхийн холбоос нь
  // дээрх салбарын (`b`) шугмаар аль хэдийн зурагдсан — давхар зурахгүй.
  for (const u of units) {
    const primary = parentOf.get(u.key);
    for (const id of u.ids) {
      for (const p of rel.par.get(id) || []) {
        if (!pos.has(p) || !pos.has(id)) continue;
        const pk = unitKeyOf.get(p);
        if (pk === primary || pk === u.key) continue;      // үндсэн салбарт орсон
        edges.push({
          t: 'c', p, c: id,
          x1: pos.get(p).x + CARD_W / 2, y1: pos.get(p).y + CARD_H,
          x2: pos.get(id).x + CARD_W / 2, y2: pos.get(id).y
        });
      }
    }
  }

  // Нэмэгдсэн хүмүүсийн холбоос: хань → хосын шугам, хүүхэд → эцэг/эхээс муруй
  for (const x of extraCards) {
    const p2 = pos.get(x);
    if (!p2) continue;
    const sp = spousesOf(x).find(s2 => pos.has(s2));
    if (sp != null) {
      const a = Math.min(x, sp), b = Math.max(x, sp);
      const pa = pos.get(a), pb = pos.get(b);
      if (pa.y === pb.y) edges.push({
        t: 's', a, b,
        x1: pa.x + CARD_W / 2, y1: pa.y + CARD_H / 2,
        x2: pb.x + CARD_W / 2, y2: pb.y + CARD_H / 2
      });
    } else {
      const par = [...(rel.par.get(x) || [])].find(pp => pos.has(pp));
      if (par != null) {
        const pp2 = pos.get(par);
        edges.push({
          t: 'c', p: par, c: x,
          x1: pp2.x + CARD_W / 2, y1: pp2.y + CARD_H,
          x2: p2.x + CARD_W / 2, y2: p2.y
        });
      }
    }
  }

  // Хумигдсан хүмүүс геометрт ороогүй — зөвхөн холбоос цэвэрлэнэ.
  if (hiddenIds.size) {
    const refs = (e) => (e.t === 's' || e.t === 'p') ? [e.a, e.b]
      : e.t === 'b' ? [e.a, e.b, ...(e.kids || [])] : [e.p, e.c];
    edges = edges.filter(e => !refs(e).some(id => hiddenIds.has(id)));
    for (const e of edges) if (e.kids) e.kids = e.kids.filter(k => !hiddenIds.has(k));
  }

  let width = 0, height = 0;
  for (const n of nodes) {
    width = Math.max(width, n.x + CARD_W);
    height = Math.max(height, n.y + ROW_H);
  }
  return {
    viewer: viewerId,
    open: openTarget,
    openFamily: [...openFamily],
    openable: [...cards].filter(openable),
    cards: [...cards],
    nodes, edges, width, height
  };
}

// ── ХЭТ АЛС ХООСОН ЗАЙГ ХААХ ────────────────────────────────────────────
// Бүх мөрөнд хамтдаа хоосон хэвтээ «зурвас» (ямар ч карт байхгүй бүс) гарвал
// баруун талын картуудыг зүүн тийш гулсуулна. Бүх мөр хамт зөөгддөг тул
// эцэг/эх–хүүхдийн босоо шугам хэвээрээ; зөвхөн алслагдсан бүлгүүд ойртоно.
function compactBands(nodes, widthOf, maxGap = 220) {
  if (!nodes || nodes.length < 2) return;
  const iv = nodes.map(n => [n.x, n.x + widthOf(n.id)]).sort((a, b) => a[0] - b[0]);
  const shifts = [];
  let end = iv[0][1];
  for (let i = 1; i < iv.length; i++) {
    const s = iv[i][0];
    if (s - end > maxGap) shifts.push({ t: s, d: s - end - maxGap });
    if (iv[i][1] > end) end = iv[i][1];
  }
  if (!shifts.length) return;
  for (const n of nodes) {
    let d = 0;
    for (const sh of shifts) if (n.x >= sh.t) d += sh.d;
    if (d) n.x -= d;
  }
}
