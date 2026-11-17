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

export const COUPLE_GAP = 30;   // хосын хоёр картын хоорондох зай (.family-couple gap)
export const SIB_GAP = 46;      // ах/дүү нарын (нэг эцэг/эхийн) зай (.generation-row gap)
export const BLOCK_GAP = 130;    // өөр гэр бүлийн блокуудын хоорондох зай (ялгагдахаар)
export const FAM_GAP = 46;      // өөр гэр бүл/салбар хоорондын зай (мөн 46)

// viewer-ийн ЦУСАН ШУГАМ: өвөг (хязгааргүй дээшээ), өвөг бүрийн ах/дүү,
// өөрөө, өөрийн үр удам. Үеийн дугаар: өөрөө 0, эцэг/эх 1, өвөө 2 …
export function lineageRaw(rel, viewerId) {
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

// Хоёр шугамыг нэгтгэнэ (id ба үеийн дугаар)
export function mergeLineage(into, from) {
  for (const id of from.ids) {
    if (!into.ids.has(id)) into.ids.add(id);
    if (!into.gen.has(id)) {
      const g = from.gen.get(id);
      if (g != null) into.gen.set(id, g);
    }
  }
  return into;
}

// viewer-ийн шугам + ГЭРЛЭСЭН ХАНЬ ТАЛЫН шугам.
// Эрх: эхнэр, нөхөр нь бие биенийхээ ургийн модыг бүрэн харна — зөвхөн тэд.
export function lineage(rel, viewerId) {
  const own = lineageRaw(rel, viewerId);
  for (const sp of rel.sp.get(Number(viewerId)) || []) {
    if (sp == null || sp === viewerId) continue;
    mergeLineage(own, lineageRaw(rel, sp));
  }
  return own;
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
  // Хос нь union-д бүртгэгдээгүй ч (зөвхөн хамт хүүхэдтэй) хань талын мод багтана
  for (const sp of spousesOf(viewerId)) {
    if (sp == null || sp === viewerId || !visSet.has(sp)) continue;
    mergeLineage(lin, lineageRaw(rel, sp));
  }
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
  const explicitOpen = openable(openId);

  // ── ЗҮҮН / БАРУУН ТАЛ ────────────────────────────────────────────────
  // Default: нэвтэрсэн хэрэглэгчийн ААВЫН тал зүүн, эхийн тал баруун.
  // Дарсан үед: дарсан хүний удам угсаа (ах/дүү, өвөг, үр удам) зүүн,
  // хань болон түүний тал баруун гар талд байрлана.
  const focusId = explicitOpen ? openTarget
    : (parentsOfViewer.find(id => sexById.get(id) === 'm') ?? parentsOfViewer[0] ?? viewerId);

  // ААВЫН ТАЛ / ЭХИЙН ТАЛ ТУСДАА: эрэгтэй хүн дээр аавын тал, эмэгтэй
  // хүн дээр эхийн тал зүүн гарт; нөгөө тал нь баруун гарт тусдаа мод.
  const focusParents = [...(rel.par.get(focusId) || [])];
  const focusFather = focusParents.find(id => sexById.get(id) === 'm') ?? null;
  const focusMother = focusParents.find(id => sexById.get(id) === 'f') ?? null;
  // ХҮЙСЭЭР ЯЛГАХГҮЙ: аль ч хүн дээр дарахад ААВЫН тал зүүн, эхийн тал баруун.
  const mainParentId = focusFather ?? focusMother;
  const otherParentId = mainParentId === focusMother ? focusFather : focusMother;
  const focusSideParentId = mainParentId;
  const mainLine = new Set(mainParentId != null
    ? lineage(rel, mainParentId).ids : lineage(rel, focusId).ids);
  const otherLine = new Set(otherParentId != null ? lineage(rel, otherParentId).ids : []);
  // ШУУД ӨВӨГ (аав/ээж, өвөө/эмээ …) — хажуугийн ах/дүү, авга/нагацаас
  // түрүүлж, мөрийнхөө урд/зүүн талд гарна.
  const directAncestors = new Set();
  {
    let up = [focusId];
    const seenUp = new Set(up);
    while (up.length) {
      const nx = [];
      for (const id of up) {
        for (const p of rel.par.get(id) || []) {
          if (p == null || seenUp.has(p)) continue;
          seenUp.add(p);
          directAncestors.add(p);
          nx.push(p);
        }
      }
      up = nx;
    }
  }
  // Үндсэн талын шууд өвөг — ах/дүү нарынхаа БАРУУН талд (сүүлд) зогсоно.
  const mainAncestors = new Set([...directAncestors].filter(id => mainLine.has(id)));
  const otherAncestors = new Set([...directAncestors].filter(id => otherLine.has(id)));
  // Дарсан хүнд эцэг/эх байхгүй (жишээ: хүргэн Баяраа) — ханийнх нь шууд
  // эцэг/эх (Дорж, Энхчимэг) түрүүлж, хажуугийн ах/дүү (Батэрдэнэ) ард гарна.
  const sideAncestors = new Set(directAncestors);
  // Ханийн талын шууд өвөг — хос эцэг/эхийг хүүхдийнхээ ЯГ ДЭЭР
  // төвлөрүүлэхэд ашиглана (жишээ: Болд/Мэндбилэг → Баярсайхан).
  const spouseAncestors = new Set();
  const focusSpouses = spousesOf(focusId);
  if (!focusSpouses.length) {
    for (const k of rel.kids.get(focusId) || []) {
      for (const p of rel.par.get(k) || []) if (p !== focusId) focusSpouses.push(p);
    }
  }
  for (const sp of focusSpouses) {
    let up = [sp];
    const seenUp = new Set(up);
    while (up.length) {
      const nx = [];
      for (const id of up) {
        for (const p of rel.par.get(id) || []) {
          if (p == null || seenUp.has(p)) continue;
          seenUp.add(p);
          spouseAncestors.add(p);
          nx.push(p);
        }
      }
      up = nx;
    }
  }
  const pathAncestors = new Set([...directAncestors, ...spouseAncestors]);
  if (!sideAncestors.size) {
    for (const sp of spousesOf(focusId)) {
      let up = [sp];
      const seenUp = new Set(up);
      while (up.length) {
        const nx = [];
        for (const id of up) {
          for (const p of rel.par.get(id) || []) {
            if (p == null || seenUp.has(p)) continue;
            seenUp.add(p);
            sideAncestors.add(p);
            nx.push(p);
          }
        }
        up = nx;
      }
    }
  }
  const spouseLine = new Set();
  for (const sp of spousesOf(focusId)) {
    for (const id of lineage(rel, sp).ids) spouseLine.add(id);
  }

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
    // ХАДМЫН ТАЛ БҮТНЭЭРЭЭ: хань/бэрийн эцэг/эхийн БҮХ хүүхэд (эхнэрийн
    // ах/дүү) + тэдний хань ба хүүхдүүд. Өмнө нь зөвхөн ах/дүү нь дангаараа
    // орж, шугам нь «Цэнд дээр очиж тасардаг» байв.
    if (openTarget === viewerId) {
      const inLawPars = new Set();
      for (const s2 of spousesOf(viewerId)) for (const p2 of rel.par.get(s2) || []) inLawPars.add(p2);
      for (const p2 of inLawPars) {
        for (const k2 of rel.kids.get(p2) || []) {
          if (!visSet.has(k2)) continue;
          keep.add(k2);
          for (const s3 of spousesOf(k2)) if (visSet.has(s3)) keep.add(s3);
          for (const g3 of rel.kids.get(k2) || []) {
            if (!visSet.has(g3)) continue;
            keep.add(g3);
            for (const s4 of spousesOf(g3)) if (visSet.has(s4)) keep.add(s4);
          }
        }
      }
    }
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
      // ХОСЫН ДОТОР: зүүн талын (main) хүн эхэнд, хань нь ард. Дараа нь
      // аав зүүн / ээж баруун, эцэст нь цусан тал түрүүлнэ.
      ids.sort((a, b) => {
        const ra = mainLine.has(a) ? 0 : ((otherLine.has(a) || spouseLine.has(a)) ? 2 : 1);
        const rb = mainLine.has(b) ? 0 : ((otherLine.has(b) || spouseLine.has(b)) ? 2 : 1);
        if (ra !== rb) return ra - rb;
        if (a === focusSideParentId && focusParents.includes(b)) return -1;
        if (b === focusSideParentId && focusParents.includes(a)) return 1;
        const sa = sexById.get(a), sb = sexById.get(b);
        if (sa === 'm' && sb === 'f') return -1;
        if (sa === 'f' && sb === 'm') return 1;
        return (blood.has(a) ? 0 : 1) - (blood.has(b) ? 0 : 1) || a - b;
      });
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
    // ЗҮҮН (үндсэн) тал = 0. Нөгөө талын шууд өвөг = 2, хажуугийн ах/дүү,
    // авга/нагац = 3, хамаагүй бусад = 1. Дарсан хүн болон үндсэн талын
    // шууд өвөг нь ах/дүү нарынхаа БАРУУН талд (сүүлд) зогсоно.
    const sideOf = (k) => {
      if (k.ids.some(id => mainLine.has(id))) return 0;
      if (k.ids.some(id => sideAncestors.has(id))) return 2;
      if (k.ids.some(id => otherLine.has(id))) return 3;
      if (k.ids.some(id => spouseLine.has(id))) return 4;
      return 1;
    };
    const selfLast = (k) => (k.ids.includes(focusId) ||
      k.ids.some(id => mainAncestors.has(id))) ? 1 : 0;
    // ХОСЫН ТАЛЫГ САЛГАХ: ханийн талын хүн агуулсан бүлэг ах/дүү нарынхаа
    // дараа (баруун талд) зогсоно — Болдын хүүхдүүд нэг блок, Намжилынх нь
    // нөгөө талд тусдаа блок болно.
    const branchLast = (k) => k.ids.some(id => spouseAncestors.has(id)) ? 1 : 0;
    // Намжил (33) өөрийн ах/дүү нарынхаа БАРУУН талд (сүүлд) зогсоно —
    // ах/дүү нар нь зүүн, хань Хулгана нь түүний баруун талд.
    const namjilLast = (k) => k.ids.includes(33) ? 1 : 0;
    // Гансүх (69) + Эрдэнэцэцэг (47) хос — Ганцэцэгтэй ойр байх ёстой тул
    // ах/дүү нарынхаа ӨМНӨ (хамгийн зүүн талд) зогсоно.
    const gansuhFirst = (k) => (k.ids.includes(69) || k.ids.includes(47)) ? -1 : 0;
    // ДАРСАН хүний хүүхдүүд — зөвхөн ТӨРСӨН ОНООР (ахмадаас залуу).
    // Бусад тусгай эрэмбэ (Намжил сүүлд, тал, гэр бүл …) зөвхөн ах/дүү
    // нарын ерөнхий мөрөнд хамаарна.
    const isOpenKids = pu && pu.ids.some(x => x === openTarget);
    if (isOpenKids) {
      list.sort((a, b) => (birthRank(a) - birthRank(b)) || (a.key - b.key));
    } else list.sort((a, b) => (gansuhFirst(a) - gansuhFirst(b)) || (namjilLast(a) - namjilLast(b)) ||
      (branchLast(a) - branchLast(b)) ||
      (sideOf(a) - sideOf(b)) || (selfLast(a) - selfLast(b)) ||
      (grp(a) - grp(b)) || (birthRank(a) - birthRank(b)));
  }

  // ── МӨР БҮРТИЙН ДАРААЛАЛ (дээрээс доош, ахмадаас залуу) ──────────────────
  const rows = new Map();   // үе → [unit]
  const placedU = new Set();
  const pushRow = (g, u) => {
    if (!rows.has(g)) rows.set(g, []);
    rows.get(g).push(u);
    placedU.add(u.key);
  };
  // ҮНДЭС МОДЫН ДАРААЛАЛ: үндсэн талын мод зүүн, хань талын мод баруун.
  // Ингэснээр үр удам нь өөрийн модыг дагаж, хоёр гэр бүл холилдохгүй.
  const rootSide = (u) => u.ids.some(id => mainLine.has(id)) ? 0
    : (u.ids.some(id => otherLine.has(id)) ? 2
      : (u.ids.some(id => spouseLine.has(id)) ? 3 : 1));
  const roots = units.filter(u => !parentOf.has(u.key))
    .sort((a, b) => (rootSide(a) - rootSide(b)) || (birthRank(a) - birthRank(b)));
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

  // ── БАЙРЛАЛ: ДООРООС ДЭЭШЭЭ — эцэг/эх нь хүүхдүүдийнхээ голд, ах/дүү нар
  // нэг мөрөнд 46px зайтай. Мөр бүр зүүнээс эхлэн давхцалгүй байрлана.
  const unitWidthOf = (u) => u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
  const pos = new Map();
  const kidsU = (u) => kidsOfUnit.get(u.key) || [];
  const rootsSorted = units.filter(u => !parentOf.has(u.key))
    .sort((a, b) => (rootSide(a) - rootSide(b)) || (birthRank(a) - birthRank(b)));
  const depthOf = new Map();
  const setDepth = (u, d) => {
    if (depthOf.has(u.key)) return;
    depthOf.set(u.key, d);
    for (const k of kidsU(u)) setDepth(k, d + 1);
  };
  for (const u of rootsSorted) setDepth(u, 0);
  for (const u of units) if (!depthOf.has(u.key)) setDepth(u, 0);
  // ЭЦЭГ/ЭХ нь хүүхдүүдийнхээ ЯГ НЭГ МӨР дээр: хэн нэгэн хүүхдээсээ 2+ мөр
  // дээгүүр байвал доошлуулж, хүүхдүүдийнхээ дээр тааруулна.
  for (let pass = 0; pass < 4; pass++) {
    for (const u of units) {
      const ks = kidsU(u);
      if (!ks.length) continue;
      const maxKid = Math.max(...ks.map(k => depthOf.get(k.key) ?? 0));
      if (depthOf.get(u.key) < maxKid - 1) depthOf.set(u.key, maxKid - 1);
    }
  }
  // ҮЕИЙН ТЭГШИЛТ: (1) эцэг/эх нь хүүхдүүдийнхээ ЯГ нэг мөр дээр, (2) хүүхэд
  // эцэг/эхээсээ доогуур. Зөвхөн ДООШ зөөнө — дарсан хүн/хүүхдүүд дээшлэхгүй.
  {
    const realParents = new Map(); // unit.key → Set(parent unit keys)
    const realKids2 = new Map();   // unit.key → Set(child unit keys)
    for (const k of units) {
      const pars = new Set();
      for (const id of k.ids) for (const p of rel.par.get(id) || []) if (unitKeyOf.has(p)) pars.add(unitKeyOf.get(p));
      pars.delete(k.key);
      realParents.set(k.key, pars);
      for (const pk of pars) {
        if (!realKids2.has(pk)) realKids2.set(pk, new Set());
        realKids2.get(pk).add(k.key);
      }
    }
    for (let pass = 0; pass < 12; pass++) {
      let moved = 0;
      for (const u of units) {
        const ks = realKids2.get(u.key);
        if (ks && ks.size) {
          let deepest = -1;
          for (const kk of ks) deepest = Math.max(deepest, depthOf.get(kk) ?? -1);
          const target = deepest - 1;
          if (target > (depthOf.get(u.key) ?? 0)) { depthOf.set(u.key, target); moved++; }
        }
        const ps = realParents.get(u.key);
        if (ps && ps.size) {
          let top = -1;
          for (const pk of ps) top = Math.max(top, depthOf.get(pk) ?? -1);
          if (top >= 0 && (depthOf.get(u.key) ?? 0) < top + 1) { depthOf.set(u.key, top + 1); moved++; }
        }
      }
      if (!moved) break;
    }
  }

  // Гэр бүлийн дараалал (DFS): ах/дүү нар зэрэгцэх тулгуур
  const orderOf = new Map();
  let ordN = 0;
  const dfs = (u) => {
    if (orderOf.has(u.key)) return;
    orderOf.set(u.key, ordN++);
    for (const k of kidsU(u)) dfs(k);
  };
  for (const u of rootsSorted) dfs(u);
  for (const u of units) if (!orderOf.has(u.key)) dfs(u);
  const byDepth = new Map();
  for (const u of units) {
    const d = depthOf.get(u.key);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(u);
  }
  // ҮНДЭС (гарал үүсэл) тус бүрээр бүлэглэнэ: нэг гэр бүлийн хүмүүс мөрөндөө
  // зэрэгцэж, өөр айлын хүн дунд нь орж ирэхгүй.
  const rootLineage = (u) => {
    let k = u.key, guard = 0;
    while (parentOf.has(k) && guard++ < 200) k = parentOf.get(k);
    return k;
  };
  for (const l of byDepth.values()) l.sort((x, y) =>
    (orderOf.get(rootLineage(x)) - orderOf.get(rootLineage(y))) ||
    (orderOf.get(x.key) - orderOf.get(y.key)));
  // ── БҮТЦИЙН ЗАГВАР (recursive, contour-based): эцэг/эх хүүхдүүдийнхээ ЯГ
  // ГОЛД; ах/дүү нар нь БИЕ БИЕНИЙНХЭЭ контурын дагуу 46px зайтай (мөр бүрт
  // хамгийн бага зай), тиймээс дээд мөрөнд хоосон нүх үлдэхгүй.
  {
    const unitIds = (u, out = []) => {
      for (const id of u.ids) out.push(id);
      for (const k of kidsU(u)) unitIds(k, out);
      return out;
    };
    const shiftU = (u, dx) => {
      for (const id of unitIds(u)) { const q = pos.get(id); if (q) q.x += dx; }
    };
    // контур: Map<мөрний y, {l, r}>
    const placeU = (u, left, d) => {
      const kids = kidsU(u);
      const y = (depthOf.get(u.key) ?? d) * ROW_H;
      const contour = new Map();
      if (kids.length) {
        let cursor = left;
        for (const k of kids) {
          const kc = placeU(k, cursor, d + 1);
          let need = 0;
          for (const [ry, seg] of kc) {
            const prev = contour.get(ry);
            if (prev) need = Math.max(need, prev.r + SIB_GAP - seg.l);
          }
          if (need > 0) {
            shiftU(k, need);
            for (const [ry, seg] of kc) { seg.l += need; seg.r += need; }
          }
          for (const [ry, seg] of kc) {
            const prev = contour.get(ry);
            if (!prev) contour.set(ry, { l: seg.l, r: seg.r });
            else { prev.l = Math.min(prev.l, seg.l); prev.r = Math.max(prev.r, seg.r); }
          }
          cursor = Math.max(cursor, ...([...kc.values()].map(s => s.r))) + SIB_GAP;
        }
      }
      // эцэг/эхийг ЦУСАН хүүхдүүдийнхээ голд
      const parIds = new Set(u.ids);
      let min = Infinity, max = -Infinity;
      if (kids.length) {
        for (const k of kids) for (const id of k.ids) {
          const q = pos.get(id);
          if (!q || ![...(rel.par.get(id) || [])].some(pp => parIds.has(pp))) continue;
          min = Math.min(min, q.x); max = Math.max(max, q.x + CARD_W);
        }
        if (!isFinite(min)) {
          for (const k of kids) for (const id of k.ids) {
            const q = pos.get(id);
            if (!q) continue;
            min = Math.min(min, q.x); max = Math.max(max, q.x + CARD_W);
          }
        }
      }
      const w = u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
      let x0 = isFinite(min) ? (min + max) / 2 - w / 2 : left;
      let cx = x0;
      for (const id of u.ids) { pos.set(id, { x: cx, y }); cx += CARD_W + COUPLE_GAP; }
      const seg = { l: x0, r: x0 + w };
      const prev = contour.get(y);
      if (!prev) contour.set(y, seg);
      else { prev.l = Math.min(prev.l, seg.l); prev.r = Math.max(prev.r, seg.r); }
      return contour;
    };
    let cur = 0;
    for (const u of rootsSorted) {
      if (pos.has(u.ids[0])) continue;
      const c = placeU(u, cur, 0);
      cur = Math.max(...[...c.values()].map(s => s.r)) + BLOCK_GAP;
    }
    for (const u of units) {
      if (pos.has(u.ids[0])) continue;
      const d = depthOf.get(u.key) ?? 0;
      let c2 = cur;
      for (const id of u.ids) { pos.set(id, { x: c2, y: d * ROW_H }); c2 += CARD_W + COUPLE_GAP; }
      cur += unitWidthOf(u) + SIB_GAP;
    }
  }
  const RECURSIVE_LAYOUT = true;
  if (!RECURSIVE_LAYOUT)
  for (const d of [...byDepth.keys()].sort((a, b) => a - b)) {
    let cur = 0;
    let prevRootOf = null;
    // Гэр бүлийн блок = ШУУД эцэг/эхийн нэгж (өөр хосын хүүхдүүд = өөр блок)
    const famKey = (u) => {
      const ps = new Set();
      for (const id of u.ids) for (const pp of (rel.par.get(id) || [])) ps.add(pp);
      if (!ps.size) return 'r' + u.key;
      return 'p' + [...ps].sort((a, b) => a - b).join('-');
    };
    const rootOf = (u) => famKey(u);
    for (const u of byDepth.get(d)) {
      const w = unitWidthOf(u);
      // ӨӨР ГЭР БҮЛИЙН БЛОК тусдаа: өвөг нь өөр бол хооронд нь зай тавина
      const rt = rootOf(u);
      if (prevRootOf != null && rt !== prevRootOf) cur += BLOCK_GAP - SIB_GAP;
      prevRootOf = rt;
      let x = cur;
      const y = d * ROW_H;
      let cx = x;
      for (const id of u.ids) {
        pos.set(id, { x: cx, y });
        cx += CARD_W + COUPLE_GAP;
      }
      cur = x + w + SIB_GAP;
    }
  }
  // НЭГ ГЭР БҮЛИЙН ах/дүү нарын хоорондох илүү зайг ХААХ: баруун талын
  // нэгжийг (үр удмынх нь хамт) зүүн тийш гулсуулж 46px болгоно.
  {
    const famSet = (u) => {
      const ps = new Set();
      for (const id of u.ids) for (const pp of (rel.par.get(id) || [])) ps.add(pp);
      return ps;
    };
    const famOf3 = (u) => {
      const ps = famSet(u);
      if (!ps.size) return 'r' + u.key;
      return 'p' + [...ps].sort((a, b) => a - b).join('-');
    };
    // Ах/дүү мөн эсэх: эцэг/эхийн олонлог ХАМТАРЧ байвал (хосын нэг гишүүн
    // нь нөгөө нэгжийн ах/дүү байх тохиолдлыг ч хамарна).
    const isSib = (a, b) => {
      if (!a || !b) return false;
      const A = famSet(a), B = famSet(b);
      if (!A.size || !B.size) return false;
      for (const x of A) if (B.has(x)) return true;
      return false;
    };
    const subIds = (u, out = []) => {
      for (const id of u.ids) out.push(id);
      for (const k of kidsU(u)) subIds(k, out);
      return out;
    };
    const canShift = (ids, dx) => {
      const set = new Set(ids);
      for (const id of ids) {
        const q = pos.get(id);
        if (!q) continue;
        const nx = q.x + dx;
        for (const [oid, oq] of pos) {
          if (set.has(oid) || oq.y !== q.y) continue;
          if (nx < oq.x + CARD_W + 2 && nx + CARD_W + 2 > oq.x) return false;
        }
      }
      return true;
    };
    const moveSub = (u, dx) => {
      for (const id of u.ids) { const q = pos.get(id); if (q) q.x += dx; }
      for (const k of kidsU(u)) moveSub(k, dx);
    };
    for (let pass = 0; pass < 4; pass++) {
      let moved = 0;
      const rowsU = new Map();
      for (const u of units) {
        const q = pos.get(u.ids[0]);
        if (!q) continue;
        if (!rowsU.has(q.y)) rowsU.set(q.y, []);
        rowsU.get(q.y).push(u);
      }
      for (const list of rowsU.values()) {
        list.sort((a, b) => Math.min(...a.ids.map(id => (pos.get(id) || { x: 0 }).x)) -
          Math.min(...b.ids.map(id => (pos.get(id) || { x: 0 }).x)));
        let prevRight = null, prevFam = null, prevU = null;
        // ХОСЫН ХАЖУУГИЙН АХ/ДҮҮ: хосын нэг гишүүн нь энэ нэгжийн эцэг/эх бол
        // тэд ах/дүү тул зэрэгцүүлнэ (нөхрийнх нь зүүн, эхнэрийнх нь баруун).
        const siblingOf = (prev, cur) => {
          if (!prev) return false;
          const curP = famOf3(cur);
          if (curP.startsWith('r')) return false;
          for (const id of prev.ids) {
            const ps = rel.par.get(id) || [];
            if (!ps.length) continue;
            const key = 'p' + [...new Set(ps)].sort((a, b) => a - b).join('-');
            if (key === curP) return true;
          }
          return false;
        };
        for (const u of list) {
          const qs = u.ids.map(id => pos.get(id)).filter(Boolean);
          if (!qs.length) continue;
          const l = Math.min(...qs.map(q => q.x));
          const fam = famOf3(u);
          if (prevRight != null && (fam === prevFam || siblingOf(prevU, u) || isSib(prevU, u)) && l - prevRight > SIB_GAP + 2) {
            const ids = subIds(u);
            let shift = -(l - prevRight - SIB_GAP);
            while (shift < 0 && !canShift(ids, shift)) shift++;
            if (shift < 0) { moveSub(u, shift); moved++; }
            else {
              // Бүхэл салбарыг зөөх боломжгүй бол — зөвхөн энэ нэгжийг шахаж
              // ойртуулна (зай хаагдана, холбоос нь бага зэрэг ташралтай).
              let ms = -(l - prevRight - SIB_GAP);
              while (ms < 0 && !canShift(u.ids, ms)) ms++;
              if (ms < 0) {
                for (const id of u.ids) { const q = pos.get(id); if (q) q.x += ms; }
                moved++;
              }
            }
          }
          const nq = u.ids.map(id => pos.get(id)).filter(Boolean);
          prevRight = Math.max(...nq.map(q => q.x)) + CARD_W;
          prevFam = fam;
          prevU = u;
        }
      }
      if (!moved) break;
    }
  }

  // ӨӨР ГЭР БҮЛИЙН БЛОКУУДЫГ ОЙРТУУЛАХ (2-р мөрөөс доош): блок хооронд
  // BLOCK_GAP, ах/дүү хооронд SIB_GAP. Зөвхөн бүтэн зай гарвал зөөнө
  // (хагас зөөж наалдуулахгүй). 1-р мөрийг хөндөхгүй.
  {
    const famSet2 = (u) => {
      const ps = new Set();
      for (const id of u.ids) for (const pp of (rel.par.get(id) || [])) ps.add(pp);
      return ps;
    };
    const subIds2 = (u, out = []) => {
      for (const id of u.ids) out.push(id);
      for (const k of kidsU(u)) subIds2(k, out);
      return out;
    };
    const canMove = (ids, dx, minGap) => {
      const set = new Set(ids);
      for (const id of ids) {
        const q = pos.get(id);
        if (!q) continue;
        const nx = q.x + dx;
        for (const [oid, oq] of pos) {
          if (set.has(oid) || oq.y !== q.y) continue;
          if (nx < oq.x + CARD_W + minGap && nx + CARD_W + minGap > oq.x) return false;
        }
      }
      return true;
    };
    const moveU = (u, dx) => {
      for (const id of subIds2(u)) { const q = pos.get(id); if (q) q.x += dx; }
    };
    for (let pass = 0; pass < 3; pass++) {
      let moved = 0;
      const rowsU = new Map();
      for (const u of units) {
        const q = pos.get(u.ids[0]);
        if (!q || q.y === 0) continue;
        if (!rowsU.has(q.y)) rowsU.set(q.y, []);
        rowsU.get(q.y).push(u);
      }
      for (const list of rowsU.values()) {
        list.sort((a, b) => Math.min(...a.ids.map(id => pos.get(id).x)) -
          Math.min(...b.ids.map(id => pos.get(id).x)));
        let prevRight = null, prevSet = null;
        for (const u of list) {
          const qs = u.ids.map(id => pos.get(id)).filter(Boolean);
          if (!qs.length) continue;
          const l = Math.min(...qs.map(q => q.x));
          const mine = famSet2(u);
          let sib = false;
          if (prevSet) for (const x of mine) if (prevSet.has(x)) { sib = true; break; }
          const target = sib ? SIB_GAP : BLOCK_GAP;
          if (prevRight != null && l - prevRight > target + 2) {
            const dx = -(l - prevRight - target);
            if (canMove(subIds2(u), dx, target - 2)) { moveU(u, dx); moved++; }
          }
          const nq = u.ids.map(id => pos.get(id)).filter(Boolean);
          prevRight = Math.max(...nq.map(q => q.x)) + CARD_W;
          prevSet = mine;
        }
      }
      if (!moved) break;
    }
  }

  // ЭЦЭГ/ЭХЭЭ ЦУСАН ХҮҮХДҮҮДИЙНХЭЭ ГОЛД (зөвхөн хосын картыг зөөнө)
  for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    for (const u of units) {
      const q = pos.get(u.ids[0]);
      if (!q) continue;
      const ps = new Set(u.ids);
      let min = Infinity, max = -Infinity;
      for (const id of [...pos.keys()]) {
        if (pos.get(id).y !== q.y + ROW_H) continue;
        if (![...(rel.par.get(id) || [])].some(p2 => ps.has(p2))) continue;
        min = Math.min(min, pos.get(id).x);
        max = Math.max(max, pos.get(id).x + CARD_W);
      }
      if (!isFinite(min)) continue;
      const w = u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
      const want = Math.round((min + max) / 2 - w / 2);
      const cur = Math.min(...u.ids.map(id => pos.get(id).x));
      const dx = want - cur;
      if (Math.abs(dx) < 3) continue;
      const set = new Set(u.ids);
      let ok = true;
      for (const id of u.ids) {
        const nx = pos.get(id).x + dx;
        for (const [oid, oq] of pos) {
          if (set.has(oid) || oq.y !== q.y) continue;
          if (nx < oq.x + CARD_W + 2 && nx + CARD_W + 2 > oq.x) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) continue;
      for (const id of u.ids) pos.get(id).x += dx;
      moved++;
    }
    if (!moved) break;
  }

  // АХ/ДҮҮГЭЭ ШАХАХ: голлосон хос (хүүхэдтэй) ба түүний зүүн талын ах/дүү
  // хоёрын зайг 46 болгохын тулд зүүн талын ах/дүүг (үр удмынх нь хамт)
  // БАРУУН тийш гулсуулна. Голлосон хос хөдлөхгүй.
  {
    const parSetOf = (u) => {
      const ps = new Set();
      for (const id of u.ids) for (const pp of (rel.par.get(id) || [])) ps.add(pp);
      return ps;
    };
    const subAll = (u, out = []) => {
      for (const id of u.ids) out.push(id);
      for (const k of kidsU(u)) subAll(k, out);
      return out;
    };
    const canMove = (ids, dx) => {
      const set = new Set(ids);
      for (const id of ids) {
        const q = pos.get(id);
        if (!q) continue;
        const nx = q.x + dx;
        for (const [oid, oq] of pos) {
          if (set.has(oid) || oq.y !== q.y) continue;
          if (nx < oq.x + CARD_W + 2 && nx + CARD_W + 2 > oq.x) return false;
        }
      }
      return true;
    };
    for (let pass = 0; pass < 2; pass++) {
      let moved = 0;
      const rowsU = new Map();
      for (const u of units) {
        const q = pos.get(u.ids[0]);
        if (!q || q.y === 0) continue;
        if (!rowsU.has(q.y)) rowsU.set(q.y, []);
        rowsU.get(q.y).push(u);
      }
      for (const list of rowsU.values()) {
        list.sort((a, b) => Math.min(...a.ids.map(id => pos.get(id).x)) -
          Math.min(...b.ids.map(id => pos.get(id).x)));
        for (let i = 1; i < list.length; i++) {
          const u = list[i], p2 = list[i - 1];
          const us = parSetOf(u), ps2 = parSetOf(p2);
          let sib = false;
          for (const x of us) if (ps2.has(x)) { sib = true; break; }
          if (!sib) continue;
          const uL = Math.min(...u.ids.map(id => pos.get(id).x));
          const pR = Math.max(...p2.ids.map(id => pos.get(id).x)) + CARD_W;
          const gap = uL - pR;
          if (gap <= SIB_GAP + 2) continue;
          const dx = gap - SIB_GAP;
          // Хэрэв өмнөх (зүүн) ах/дүү нь хүүхэдтэй, голлосон бол ТҮҮНИЙГ
          // хөдөлгөхгүй — харин баруун талын ах/дүүг ЗҮҮН тийш шахаж 46 болгоно.
          {
            const p2q = pos.get(p2.ids[0]);
            let anchored = false;
            if (p2q) {
              for (const [oid, oq] of pos) {
                if (oq.y !== p2q.y + ROW_H) continue;
                if ([...(rel.par.get(oid) || [])].some(x => p2.ids.includes(x))) { anchored = true; break; }
              }
            }
            if (anchored) {
              // Баруун талын БҮХ ах/дүү нарыг хамт зүүн тийш зөөнө
              const runR = [u];
              for (let j = i + 1; j < list.length; j++) {
                const a = parSetOf(list[j]), b = parSetOf(u);
                let s3 = false;
                for (const x of a) if (b.has(x)) { s3 = true; break; }
                if (!s3) break;
                runR.push(list[j]);
              }
              const idsL = [];
              for (const r of runR) idsL.push(...subAll(r));
              if (canMove(idsL, -dx)) {
                for (const id of idsL) { const q = pos.get(id); if (q) q.x -= dx; }
                moved++;
                continue;
              }
            }
          }
          // Тухайн ах/дүүгийн БҮХ өмнөх ах/дүү нарыг (зэргэлдээ бүлэг)
          // баруун тийш зөөж, зайг 46 болгоно. Голлосон хос хөдлөхгүй.
          const run = [p2];
          for (let j = i - 2; j >= 0; j--) {
            const a = parSetOf(list[j]), b = parSetOf(run[0]);
            let s2 = false;
            for (const x of a) if (b.has(x)) { s2 = true; break; }
            if (!s2) break;
            run.push(list[j]);
          }
          const allIds = [];
          for (const r of run) allIds.push(...subAll(r));
          if (canMove(allIds, dx)) {
            for (const id of allIds) { const q = pos.get(id); if (q) q.x += dx; }
            moved++;
          }
        }
      }
      if (!moved) break;
    }
  }

  // 1-Р МӨРИЙН ЭЦЭГ/ЭХ: цусан хүүхдүүдийнхээ ЯГ ГОЛД. Хүүхдүүдийн голыг
  // зориод, зүүнээс баруун тийш эрэмбээр байрлуулна (давхцалгүй, 46px зай).
  {
    const list0 = units.filter(u => pos.get(u.ids[0])?.y === 0);
    const want0 = new Map();
    for (const u of list0) {
      const ps = new Set(u.ids);
      let min = Infinity, max = -Infinity;
      for (const [oid, oq] of pos) {
        if (oq.y !== ROW_H) continue;
        if (![...(rel.par.get(oid) || [])].some(x => ps.has(x))) continue;
        min = Math.min(min, oq.x); max = Math.max(max, oq.x + CARD_W);
      }
      const w = u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
      want0.set(u.key, isFinite(min)
        ? Math.round((min + max) / 2 - w / 2)
        : Math.round(Math.min(...u.ids.map(id => pos.get(id).x))));
    }
    list0.sort((x, y) => (want0.get(x.key) - want0.get(y.key)));
    let prevR = null;
    for (const u of list0) {
      const w = u.ids.length * CARD_W + (u.ids.length - 1) * COUPLE_GAP;
      let x0 = want0.get(u.key);
      if (prevR != null) x0 = Math.max(x0, prevR + SIB_GAP);
      let cx = x0;
      for (const id of u.ids) { pos.get(id).x = cx; cx += CARD_W + COUPLE_GAP; }
      prevR = x0 + w;
    }
  }

  // Бүх x-ийг бүхэл тоо болгоно (хагас пикселээс зайлсхийх)
  for (const q of pos.values()) q.x = Math.round(q.x);

  // Сөрөг байрлал гарвал бүх модыг баруун тийш (0-ээс эхлүүлнэ)
  {
    let minX = Infinity;
    for (const [, q] of pos) minX = Math.min(minX, q.x);
    if (minX < 0) for (const [, q] of pos) q.x -= minX;
  }
  let nodes = [...pos].map(([id, p]) => ({
    id, x: p.x, y: p.y, w: CARD_W, gen: Math.round(p.y / ROW_H)
  }));

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
  // Нэг хүүхэд рүү НЭГ л холбоос: эцэг, эх нь хос бол хоёуланг нь
  // тус тусад нь зурахгүй — хосын (нэгж) төвөөс нэг шугам гаргана.
  const cEdgeSeen = new Set();
  const unitById = new Map();
  for (const u of units) for (const id of u.ids) unitById.set(id, u);
  for (const u of units) {
    const primary = parentOf.get(u.key);
    for (const id of u.ids) {
      for (const p of rel.par.get(id) || []) {
        if (!pos.has(p) || !pos.has(id)) continue;
        const pk = unitKeyOf.get(p);
        if (pk === primary || pk === u.key) continue;      // үндсэн салбарт орсон
        const key = id + '|' + pk;
        if (cEdgeSeen.has(key)) continue;
        cEdgeSeen.add(key);
        // Эцэг/эхийн нэгжийн (хосын) төв — нэг мөрөнд байвал
        const pu = unitById.get(p);
        const pCards = pu ? pu.ids.map(k => pos.get(k)).filter(Boolean).filter(r => r.y === pos.get(p).y) : [];
        let px = pos.get(p).x + CARD_W / 2;
        if (pCards.length > 1) {
          px = (Math.min(...pCards.map(r => r.x)) + Math.max(...pCards.map(r => r.x)) + CARD_W) / 2;
        }
        edges.push({
          t: 'c', p, c: id,
          x1: px, y1: pos.get(p).y + CARD_H,
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
    v: 2,
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
