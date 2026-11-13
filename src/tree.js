// Модын слот-дээр суурилсан байрлалын алгоритм + харилцааны (цусны хүрээ) тооцоо
export const CARD_W = 156;   // карт өргөн
export const CARD_H = 96;    // картны хайрцаг өндөр
export const H_GAP = 24;     // ах/дүүгийн салбар хоорондын зай
export const UNIT_GAP = 14;  // карт хоорондын суурь зай
export const COUPLE_GAP = 32; // аав+ээж (хос) — хажууд зэрэгцэн, нэг блок мэт
export const ROW_H = 140;    // үеийн өндөр

export function yearNum(v) {
  if (v == null) return null;
  const m = String(v).match(/\d{4}/);
  return m ? parseInt(m[0], 10) : null;
}

export function monthNum(m) {
  if (!m || !m.birth_date) return 99;
  const mm = parseInt(String(m.birth_date).slice(5, 7), 10);
  return Number.isFinite(mm) ? mm : 99;
}

// Төрсөн он, сарын дарааллаар (ахмадаас залуу); он/сар мэдээгүй хүн сүүлдээ, нэрээрээ
export function sortMembers(list) {
  return [...list].sort((a, b) => {
    const ay = yearNum(a.birth_year) ?? 9999;
    const by = yearNum(b.birth_year) ?? 9999;
    if (ay !== by) return ay - by;
    const am = monthNum(a), bm = monthNum(b);
    if (am !== bm) return am - bm;
    const n = String(a.name || '').localeCompare(String(b.name || ''), 'mn');
    if (n !== 0) return n;
    return (a.id || 0) - (b.id || 0);
  });
}

function cmpMember(a, b) {
  const ay = yearNum(a && a.birth_year) ?? 9999;
  const by = yearNum(b && b.birth_year) ?? 9999;
  if (ay !== by) return ay - by;
  const am = monthNum(a), bm = monthNum(b);
  if (am !== bm) return am - bm;
  return String((a && a.name) || '').localeCompare(String((b && b.name) || ''), 'mn');
}

const addTo = (map, k, v) => {
  if (k == null || v == null) return;
  if (!map.has(k)) map.set(k, new Set());
  map.get(k).add(v);
};

// Харилцааны граф: цусны хамаарал (эцэг/эх→хүүхэд, урвуу) + хань (эхнэр/нөхөр)
export function buildRelations(children, unions) {
  const blood = new Map(); // цусны хамаарал (ундуу граф)
  const kids = new Map();  // эцэг/эх → хүүхэд
  const par = new Map();   // хүүхэд → эцэг/эх
  for (const c of children || []) {
    if (c.child_id == null) continue;
    for (const p of [c.father_id, c.mother_id]) {
      if (p == null) continue;
      addTo(blood, p, c.child_id);
      addTo(blood, c.child_id, p);
      addTo(kids, p, c.child_id);
      addTo(par, c.child_id, p);
    }
  }
  const sp = new Map(); // хань
  for (const u of unions || []) {
    if (u.a_id == null || u.b_id == null || u.a_id === u.b_id) continue;
    addTo(sp, u.a_id, u.b_id);
    addTo(sp, u.b_id, u.a_id);
  }
  return { blood, kids, par, sp };
}

// U*D* хязгаартэй BFS: эхлээд дээшээ (өвөг/эмээ зэргээр), дараа нь зөвхөн доошоо
// ураглах замаар цусны хамаарал тооцоно. Ингэжгүйгээр (доош→дээш) явбал гэрлэлтээр
// дамжсан хүмүүс (хадам өвөг/ээж, ханийн өвөг гэх мэт) хүрээнд ороод байсан юм.
function bfsUD(rel, root, maxDist) {
  const seen = new Set([root + '|0']);
  const out = new Set([root]);
  let q = [[root, 0, 0]];
  while (q.length) {
    const nx = [];
    for (const [id, phase, d] of q) {
      if (d >= maxDist) continue;
      if (phase === 0) {
        // дээшээ зөвхөн эхлэх үедээ
        for (const p of rel.par.get(id) || []) {
          const k = p + '|0';
          if (!seen.has(k)) { seen.add(k); out.add(p); nx.push([p, 0, d + 1]); }
        }
      }
      // доошоо үргэлж боломжтой
      for (const c of rel.kids.get(id) || []) {
        const k = c + '|1';
        if (!seen.has(k)) { seen.add(k); out.add(c); nx.push([c, 1, d + 1]); }
      }
    }
    q = nx;
  }
  return out;
}

// Хүрээ (closeCircle): өөрөө + цусны хамаарал (дээд тал нь maxDist үе) + тэдний эхнэр/нөхөр
export function visibleSet(rel, rootId, maxDist = 4) {
  const blood = bfsUD(rel, rootId, maxDist);
  const base = new Set(blood);
  for (const id of blood) for (const s of rel.sp.get(id) || []) base.add(s);
  const out = new Set(base);
  // ХОС харагдаж байвал ХҮҮХЭД нь ч харагдана — хос ганцаараа, хүүхэд нь
  // нуугдсан байдал гарахгүй (зөвхөн нэг үе нэмнэ, цааш үргэлжлэхгүй).
  for (const id of base) {
    for (const sp of rel.sp.get(id) || []) {
      if (!base.has(sp)) continue;
      for (const k of rel.kids.get(sp) || []) out.add(k);
    }
  }
  return out;
}

// Намтарын нууцлал: ойр хамаарал (3 үе + тэдний хань + тэдний хүүхэд = авга/нагац, үеэл)
export function bioSet(rel, rootId) {
  const b3 = bfsUD(rel, rootId, 3);
  const out = new Set(b3);
  for (const id of b3) {
    for (const s of rel.sp.get(id) || []) out.add(s);
    for (const k of rel.kids.get(id) || []) out.add(k);
  }
  return out;
}

// Фокус-горим: зөвхөн түүний хамаарал — эцэг/эх ба өвөг, ах дүү, авга/нагац,
// үеэл ба тэдний үр хүүхэд, хань, үр хүүхэд, ач зээ
export function focusSet(rel, rootId) {
  const kidsOfMany = (ids) => {
    const out = new Set();
    for (const id of ids) for (const k of rel.kids.get(id) || []) out.add(k);
    return out;
  };
  const a1 = new Set(rel.par.get(rootId) || []);                    // эцэг/эх
  const a2 = new Set();                                             // өвөг/эмээ
  for (const id of a1) for (const p of rel.par.get(id) || []) a2.add(p);
  const up = new Set([rootId, ...a1, ...a2]);
  const sibs = kidsOfMany(a1); sibs.delete(rootId);                 // ах/дүү
  const avun = kidsOfMany(a2);                                      // авга/нагац
  for (const x of a1) avun.delete(x);
  avun.delete(rootId);
  const cous = kidsOfMany(avun);                                    // үеэл
  const cousKids = kidsOfMany(cous);                                // тэдний үр хүүхэд
  const desc = new Set();                                           // үр хүүхэд, ач зээ
  for (const k of rel.kids.get(rootId) || []) {
    desc.add(k);
    for (const k2 of rel.kids.get(k) || []) desc.add(k2);
  }
  const base = new Set([...up, ...sibs, ...avun, ...cous, ...cousKids, ...desc]);
  const out = new Set(base);
  for (const id of base) for (const s of rel.sp.get(id) || []) out.add(s);
  return out;
}

// ЦУСАН фокус: хань (бэр/хүргэн)-гүй — тэд анхдагчаар НУУГДМАЛ байж,
// карт дээр дарж шатлалаар нээгдэнэ.
export function focusBlood(rel, rootId) {
  const a1 = new Set(rel.par.get(rootId) || []);
  const a2 = new Set();
  for (const p of a1) for (const g of rel.par.get(p) || []) a2.add(g);
  const out = new Set([rootId, ...a1, ...a2, ...(rel.kids.get(rootId) || [])]);
  for (const p of a1) for (const k of rel.kids.get(p) || []) out.add(k);
  // ӨВӨӨ/ЭМЭЭГИЙН БУСАД ХҮҮХЭД (авга/нагац, ах/дүү нар) ҮНДСЭН ХУУДСАНД
  // НУУГДМАЛ — тухайн хүн дээр дарахад л гарна (`👥 +N` эсвэл drill-down).
  // БҮХ ДЭЭД ҮЕ: өвөө/эмээгээс дээш (өвөөгийн аав/ээж, тэдний эцэг/эх …) —
  // цусан хамаарал хязгааргүй харагдана. Тэдний ах/дүү НЭМЭГДЭХГҮЙ.
  {
    let q = [...a2];
    while (q.length) {
      const nx = [];
      for (const x of q) for (const p of rel.par.get(x) || []) {
        if (!out.has(p)) { out.add(p); nx.push(p); }
      }
      q = nx;
    }
  }
  return out;
}

// ХАДАМ ТАЛ: өгөгдсөн хүмүүсийн ХАНЬ (бэр/хүргэн)-ийн эцэг/эх.
// Хань талын бусад хамаатан (ах/дүү, үеэл) ХАРАГДАХГҮЙ — зөвхөн хадам аав/ээж
// ба тэдний хань.
export function inlawSet(rel, ids) {
  const out = new Set();
  const add = (x) => { if (x != null && !out.has(x)) { out.add(x); return true; } return false; };
  const q = [];
  for (const id of ids) {
    for (const sp of rel.sp.get(id) || []) {
      for (const p of rel.par.get(sp) || []) if (add(p)) q.push(p);
    }
  }
  // хадам аав/ээжийн хань (жишээ нь зөвхөн нэг нь бүртгэгдсэн бол нөгөөг нь)
  for (const p of q) for (const sp of rel.sp.get(p) || []) add(sp);
  return out;
}

// Фокус-горимын КАРТУУД (клиенттэй ижил дүрэм): тухайн хүн + эцэг/эх + өвөө/эмээ +
// эцэг/эхийн хүүхэд (ах/дүү) + өвөө/эмээгийн хүүхэд (авга/нагац) + үр хүүхэд.
// Үеэл, бэр/хүргэн (хань) ХАРАГДАХГҮЙ.
export function focusCards(rel, rootId) {
  const a1 = new Set(rel.par.get(rootId) || []);
  const a2 = new Set();
  for (const p of a1) for (const g of rel.par.get(p) || []) a2.add(g);
  // Цусан хамаарал: өөрөө, эцэг/эх, өвөө/эмээ, ах/дүү, авга/нагац, үр хүүхэд.
  const out = new Set([rootId, ...a1, ...a2, ...(rel.kids.get(rootId) || [])]);
  for (const p of a1) for (const k of rel.kids.get(p) || []) out.add(k);
  // ӨВӨӨ/ЭМЭЭГИЙН БУСАД ХҮҮХЭД (авга/нагац, ах/дүү нар) ҮНДСЭН ХУУДСАНД
  // НУУГДМАЛ — тухайн хүн дээр дарахад л гарна (`👥 +N` эсвэл drill-down).
  // БҮХ ДЭЭД ҮЕ (өвөө/эмээгээс дээш) — цусан хамаарал хязгааргүй.
  {
    let q = [...a2];
    while (q.length) {
      const nx = [];
      for (const x of q) for (const p of rel.par.get(x) || []) {
        if (!out.has(p)) { out.add(p); nx.push(p); }
      }
      q = nx;
    }
  }
  // Хань (бэр/хүргэн): эдгээр хүмүүсийн эхнэр/нөхөр ХАРАГДАНА — гэхдээ
  // зөвхөн хань өөрөө; хань талын эцэг/эх, ах/дүү (өөр ургийнхан) ХАРАГДАХГҮЙ.
  for (const id of [...out]) for (const sp of rel.sp.get(id) || []) out.add(sp);
  return out;
}

// Хүүхэд үү? (эцэг/эхийн салбараар) — циклээс хамгаалах
export function isAncestor(rel, maybeAncestor, id) {
  if (maybeAncestor === id) return true;
  const seen = new Set([id]);
  let q = [id];
  while (q.length) {
    const next = [];
    for (const c of q) {
      for (const p of rel.par.get(c) || []) {
        if (p === maybeAncestor) return true;
        if (!seen.has(p)) { seen.add(p); next.push(p); }
      }
    }
    q = next;
  }
  return false;
}

// Дээшээс доошоо салбарласан слот-дээр суурилсан байрлал
//  order: Map(id → эрэмбийн дугаар) — фокус-горимд «ээжийн тал зүүн, аавын тал баруун»
//  gaps:  { h, unit, ghost, narrow } — фокус-горимд зайг шахах; narrow (Set) дахь
//         нуугдсан хүмүүс зөвхөн жижиг икон тул бага өргөн (ghost) эзэлнэ
export function layoutTree({ members, children, unions, order, gaps }) {
  const HG = (gaps && gaps.h != null) ? gaps.h : H_GAP;
  const UG = (gaps && gaps.unit != null) ? gaps.unit : UNIT_GAP;
  // Хосын (аав + ээж) хоорондын зай — бусад карттай ижил
  const PG = (gaps && gaps.couple != null) ? gaps.couple : COUPLE_GAP;
  const GW = (gaps && gaps.ghost != null) ? gaps.ghost : CARD_W;
  const narrow = (gaps && gaps.narrow) || null;
  const W = (id) => (narrow && narrow.has(id)) ? GW : CARD_W;
  // Сүнс хань (нуугдмал) бага зайтай зэрэгцэнэ; блок өргөнийг НЭГТГЭЖ,
  // бүх ах/дүү ижил зайтай харагдана (хүүхэд/хань байгаа эсэхээс үл хамаарна).
  const GG = (gaps && gaps.ghostGap != null) ? gaps.ghostGap : PG;
  const UMIN = (gaps && gaps.unitMin != null) ? gaps.unitMin : 0;
  const isN = (id) => !!(narrow && narrow.has(id));
  // Жижиг икон хүүхдүүдийн кластер илүү нягт — блок өргөн 184-өөс хэтрэхгүй.
  const CG = (gaps && gaps.childGap != null) ? gaps.childGap : HG;
  // alignLeft: эдгээр хүний блок зүүн ирмэгээс эхэлнэ (төвлөрүүлэхгүй)
  const ALIGN_LEFT = (gaps && gaps.alignLeft) || null;
  // compactIds: блокийн өргөн зөвхөн өөрийн карт/хосоор (хүүхэд тэлэхгүй)
  const COMPACT_IDS = (gaps && gaps.compactIds) || null;
  const gapPair = (a, b) => (isN(a) || isN(b)) ? GG : PG;
  const mid = (n) => n.x + W(n.id) / 2;
  const list = members || [];
  const vis = new Set(list.map(m => m.id));
  const meta = new Map(list.map(m => [m.id, m]));
  const rankOf = (id) => (order && order.has(id)) ? order.get(id) : null;
  const byOrder = (a, b) => {
    const oa = rankOf(a), ob = rankOf(b);
    if (oa != null && ob != null && oa !== ob) return oa - ob;
    return 0;
  };

  // Хосын бүлэг (spouse component) — нэг слот
  const adjSp = new Map();
  for (const u of unions || []) {
    if (!vis.has(u.a_id) || !vis.has(u.b_id) || u.a_id === u.b_id) continue;
    addTo(adjSp, u.a_id, u.b_id);
    addTo(adjSp, u.b_id, u.a_id);
  }
  const unitCache = new Map();
  const unitOf = (id) => {
    if (unitCache.has(id)) return unitCache.get(id);
    const seen = new Set([id]);
    const q = [id];
    while (q.length) {
      const c = q.pop();
      for (const n of adjSp.get(c) || []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    const unit = [...seen].sort((a, b) => byOrder(a, b) || (a - b));
    for (const u of unit) unitCache.set(u, unit);
    return unit;
  };

  // Эцэг/эх → хүүхэд холбоо
  const parentsOf = new Map(); // child -> [{ps:[], rel}]
  for (const c of children || []) {
    if (!vis.has(c.child_id)) continue;
    const ps = [];
    if (c.father_id && vis.has(c.father_id)) ps.push(c.father_id);
    if (c.mother_id && vis.has(c.mother_id)) ps.push(c.mother_id);
    if (!ps.length) continue;
    if (!parentsOf.has(c.child_id)) parentsOf.set(c.child_id, []);
    parentsOf.get(c.child_id).push({ ps, rel: c.rel_type || 'Төрсөн' });
  }

  // Нэг хүүхэд нэг л слотод байрлана: эхлээд эцэг (эцэг-эхийн дараалал)
  const kids = new Map();
  parentsOf.forEach((entries, child) => {
    const flat = [...new Set(entries.flatMap(e => e.ps))];
    const own = flat[0];
    if (!kids.has(own)) kids.set(own, []);
    kids.get(own).push(child);
  });
  kids.forEach(arr => arr.sort((a, b) =>
    byOrder(a, b) || cmpMember(meta.get(a), meta.get(b))));

  const unitChildren = (unit) => {
    const seen = new Set();
    const out = [];
    for (const u of unit) {
      for (const c of kids.get(u) || []) {
        if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    }
    return out.sort((a, b) => byOrder(a, b) || cmpMember(meta.get(a), meta.get(b)));
  };

  const widthOf = new Map();
  const stack = new Set();
  const unitWidth = (unit) => {
    let w = 0;
    for (let i = 0; i < unit.length; i++) {
      w += W(unit[i]);
      if (i > 0) w += gapPair(unit[i - 1], unit[i]);
    }
    // Нэгтгэсэн өргөн нь ЗӨВХӨН бүтэн карттай блокт — сүнс (жижиг икон)
    // хүүхдүүд хуучинӣ жижиг өргөнөөрөө байрлана.
    return Math.max(w, unit.some(u => !isN(u)) ? UMIN : 0);
  };

  const measure = (id) => {
    if (widthOf.has(id)) return widthOf.get(id);
    if (stack.has(id)) return 0; // цикл
    stack.add(id);
    const unit = unitOf(id);
    const uw = unitWidth(unit);
    const ch = unitChildren(unit);
    let cw = 0;
    for (const c of ch) cw += measure(c);
    if (ch.length > 1) cw += (ch.length - 1) * (ch.every(c => isN(c)) ? CG : HG);
    const w = (COMPACT_IDS && COMPACT_IDS.has(id)) ? uw : Math.max(uw, cw);
    stack.delete(id);
    widthOf.set(id, w);
    return w;
  };

  const nodes = [];
  const nodeAt = new Map();
  const visited = new Set();

  const place = (id, left, depth) => {
    if (visited.has(id)) return;
    const unit = unitOf(id);
    const w = widthOf.get(id) ?? measure(id);
    const uw = unitWidth(unit);
    const center = left + w / 2;
    // Ганц карттай блок: КАРТ нь блокийн яг төвд (сүнс хань баруун талд нь
    // байрласан ч картын тэнхлэг хөдлөхгүй) — ах/дүү нарын зай жигд гарна.
    const single = unit.length === 1;
    const alignL = !!(ALIGN_LEFT && ALIGN_LEFT.has(unit[0]));
    let ux = alignL ? left
      : single ? center - (isN(unit[0]) ? W(unit[0]) : CARD_W) / 2
      : center - uw / 2;
    for (const u of unit) {
      if (!visited.has(u)) {
        visited.add(u);
        const n = { id: u, x: Math.round(ux), y: depth * ROW_H, gen: depth, w: W(u) };
        nodes.push(n);
        nodeAt.set(u, n);
      }
      ux += W(u) + (unit[unit.indexOf(u) + 1] ? gapPair(u, unit[unit.indexOf(u) + 1]) : 0);
    }
    const ch = unitChildren(unit).filter(c => !visited.has(c));
    let cw = 0;
    for (const c of ch) cw += widthOf.get(c) ?? 0;
    if (ch.length > 1) cw += (ch.length - 1) * (ch.every(x => isN(x)) ? CG : HG);
    let cx = left + (w - cw) / 2;
    for (const c of ch) {
      place(c, cx, depth + 1);
      cx += (widthOf.get(c) ?? 0) + (ch.every(x => isN(x)) ? CG : HG);
    }
  };

  // ҮНДЭС = эцэг/эх нь харагдахгүй хүн. ХОС дотор нэг нь эцэг/эхтэй бол (жишээ нь
  // Намжил + Хулгана) хос бүхэлдээ үндэс БОЛОХГҮЙ — эс бөгөөс хос модны
  // оройд (0-р мөр) гарч, эцэг/эх нь хажууд нь унадаг байв.
  const roots = list.filter(m => !unitOf(m.id).some(u => parentsOf.has(u)))
    .sort((a, b) => byOrder(a.id, b.id) || cmpMember(a, b));
  let cursor = 0;
  for (const r of roots) {
    if (visited.has(r.id)) continue;
    measure(r.id);
    place(r.id, cursor, 0);
    cursor += (widthOf.get(r.id) || 0) + HG * 2;
  }
  // Буруу өгөгдөлд дахин орохгүй хүмүүс (цикл) — үлдсэнийг сул слотод байрлуулна
  for (const m of list) {
    if (visited.has(m.id)) continue;
    measure(m.id);
    place(m.id, cursor, 0);
    cursor += (widthOf.get(m.id) || 0) + HG * 2;
  }

  // Аав/ээжийг хүүхдийн ШУУД ДЭЭР нь тавих (зурагийн дагуу, нэг блок):
  //  • хэт алслагдсан/ижил мөрөнд суусан эцэг эхийг авч, хүүхдийн мөрөн дээр
  //    тавина (зөвхөн аюулгүй тохиолдолд: ганц карт, өөр хүүхэдгүй, өөр эцэггүй)
  //  • тавигдаагүй эцэг эх байвал дээр нь оруулна
  const rowOf = (n) => Math.round(n.y / ROW_H);
  const hitsRow = (x, y, w) => nodes.some(n =>
    Math.abs(n.y - y) < 4 && x < n.x + W(n.id) + 16 && n.x < x + w + 16);
  const putAbove = (p, cn) => {
    let row = rowOf(cn) - 1;
    if (row < 0) {
      for (const n of nodes) { n.y += ROW_H; n.gen = (n.gen || 0) + 1; }
      row = 0;
    }
    const unit = unitOf(p);
    const uw = unitWidth(unit);
    // Эцэг/эхийг НЭГ хүүхэд дээр биш, хүүхдүүдийн БҮХЭЛ РҮҮ төвлөрүүлнэ —
    // ингэснээр ах/дүүгийн эрэмбэ (1 2 3 4 5) хэвээр үлдэж, дарсан хүүхэд гол руу шилжихгүй.
    const sib = (kids.get(p) || []).map(id => nodeAt.get(id)).filter(n => n && Math.abs(n.y - cn.y) < 4);
    const spanL = sib.length ? Math.min(...sib.map(n => n.x)) : cn.x;
    const spanR = sib.length ? Math.max(...sib.map(n => n.x + W(n.id))) : cn.x + W(cn.id);
    const target = Math.round((spanL + spanR) / 2 - uw / 2);
    let px = target;
    if (hitsRow(px, row * ROW_H, uw)) {
      // хоёр тийшээ эхлэн хамгийн ойр чөлөөт слотыг олно
      let best = null;
      for (const dir of [-1, 1]) {
        let x = target;
        for (let i = 0; i < 40; i++) {
          x += dir * (CARD_W + HG + 8);
          if (!hitsRow(x, row * ROW_H, uw)) {
            if (best === null || Math.abs(x - target) < Math.abs(best - target)) best = x;
            break;
          }
        }
      }
      if (best !== null) px = best;
    }
    let ux = px;
    for (const u of unit) {
      if (!nodeAt.has(u)) {
        const n = { id: u, x: Math.round(ux), y: row * ROW_H, gen: row, w: W(u) };
        nodes.push(n); nodeAt.set(u, n);
      }
      ux += W(u) + (unit[unit.indexOf(u) + 1] ? gapPair(u, unit[unit.indexOf(u) + 1]) : 0);
    }
    let kx = px;
    for (const c of (kids.get(p) || []).filter(id => !nodeAt.has(id))) {
      measure(c);
      place(c, kx, row + 1);
      kx += (widthOf.get(c) || 0) + HG;
    }
  };
  for (const [child, entries] of parentsOf) {
    const cn = nodeAt.get(child);
    if (!cn) continue;
    for (const e of entries) {
      for (const p of e.ps) {
        if (p === child) continue;
        let pn = nodeAt.get(p);
        if (pn) {
          const far = Math.abs(pn.x - cn.x) > CARD_W || rowOf(pn) !== rowOf(cn) - 1;
          if (!far) continue;
          const unit = unitOf(p);
          const others = (kids.get(p) || []).filter(id => id !== child && nodeAt.has(id));
          if (parentsOf.has(p) || unit.length !== 1 || others.length) continue;
          const ix = nodes.indexOf(pn);
          if (ix >= 0) nodes.splice(ix, 1);
          nodeAt.delete(p);
          pn = null;
        }
        if (!pn) putAbove(p, cn);
      }
    }
  }

  // Холбоосууд
  // ── ЭЦЭГ/ЭХ ХОС хүүхдүүдийнхээ ЯГ ГОЛД (өвөө/эмээ, аав/ээж …) ───────────
  // (холбоос зураас тооцоологдохоос өмнө хийгдэнэ)
  {
    const byId = new Map(nodes.map(n => [n.id, n]));
    const done = new Set();
    // Тухайн блок мөрөндөө АХ/ДҮҮ НАРТАЙ (ижил эцэг/эх) хүн байна уу?
    // Тийм бол хүүхдийнхээ гол руу ЗӨӨХГҮЙ — эс бөгөөс ах/дүү нарын
    // хоорондын зай (46/32px) тэгш бус болно.
    // Блокийн эцэг/эх нарын ХАМГИЙН ДООД мөр — түүнээс дээшээ гарч болохгүй
    const parentLowY = (unit) => {
      let v = -Infinity;
      for (const u of unit) {
        for (const e of (parentsOf.get(u) || [])) {
          for (const p of e.ps) {
            const pn = byId.get(p);
            if (pn) v = Math.max(v, pn.y);
          }
        }
      }
      return v;
    };
    // Энэ мөрөнд тухайн блокийн ЭЦЭГ/ЭХ байна уу? (дээшээ шилжихээс сэргийлнэ)
    const parentRowTaken = (unit, y) => {
      for (const u of unit) {
        for (const e of (parentsOf.get(u) || [])) {
          for (const p of e.ps) {
            const pn = byId.get(p);
            if (pn && Math.abs(pn.y - y) < 4) return true;
          }
        }
      }
      return false;
    };
    const sibInRow = (unit, y) => {
      for (const u of unit) {
        for (const e of (parentsOf.get(u) || [])) {
          for (const p of e.ps) {
            for (const k of kids.get(p) || []) {
              if (unit.includes(k)) continue;
              const kn = byId.get(k);
              if (kn && Math.abs(kn.y - y) < 4) return true;
            }
          }
        }
      }
      return false;
    };
    // Тухайн мөрөнд өөр блоктой давхцаж байна уу?
    const clashRow = (unit, y, x, w) => nodes.some(nd => !unit.includes(nd.id) &&
      Math.abs(nd.y - y) < 4 && x < nd.x + CARD_W + 8 && nd.x < x + w + 8);
    // ДООРООС ДЭЭШ: эхлээд хамгийн доод үе төвлөрч, дараа нь эцэг/эх нь
    // ТОГТСОН хүүхдийнхээ голд орно (дээрээс доош хийвэл байрлал хуучирна).
    for (const n of [...nodes].sort((a, b) => b.y - a.y)) {
      const unit = unitOf(n.id);
      if (!unit.length || done.has(unit[0])) continue;
      if (ALIGN_LEFT && unit.some(u => ALIGN_LEFT.has(u))) continue;  // аав/ээж хөндөхгүй
      done.add(unit[0]);
      const chN = [];
      for (const u of unit) for (const k of kids.get(u) || []) {
        const kn = byId.get(k);
        if (kn && Math.abs(kn.y - n.y - ROW_H) < 4 && !chN.includes(kn)) chN.push(kn);
      }
      if (!chN.length) continue;   // ГАНЦ хүүхэдтэй ч хүүхдийнхээ голд зогсоно
      // Ах/дүү нартай мөрөнд байгаа эцэг/эхийг ХӨДӨЛГӨХГҮЙ — хүүхдүүд нь
      // доор нь (place() дээр) төвлөрсөн хэвээр үлдэнэ, зай нь тэгш байна.
      if (sibInRow(unit, n.y)) continue;
      const l = Math.min(...chN.map(c => c.x));
      const r = Math.max(...chN.map(c => c.x + CARD_W));
      const uw2 = unitWidth(unit);
      let target = Math.round((l + r) / 2 - uw2 / 2);
      if (target < 0) target = 0;
      // Хүүхдийнхээ ГОЛД — гэхдээ зэргэлдээ блоктой давхцуулахгүй (эсрэг
      // тохиолдолд хамгийн ойрын чөлөөт байрлал руу шилжинэ).
      // Хүүхдийнхээ ЯГ ГОЛД байрлана. Хэрэв зэргэлдээ блоктой давхцаж байвал
      // ХАЖУУ БАРУУГААР шилжихгүй — нэг мөр ДЭЭШЭЭ гарч, хүүхдийнхээ голд
      // тогтно (эс бөгөөс «эцэг/эх хүүхдийнхээ дээр биш» зөрчил үүснэ).
      let ty = n.y;
      const minY = parentLowY(unit);
      for (let k2 = 0; k2 < 4 && clashRow(unit, ty, target, uw2); k2++) {
        const up = ty - ROW_H;
        // Эцэг/эхээсээ ДЭЭШ, эсвэл эцэг/эхийнхээ мөрөнд орохгүй — тэгвэл
        // хөдөлгөхгүй (өөрийн мөрөндөө үлдэнэ).
        if (up < minY || parentRowTaken(unit, up)) break;
        ty = up;
      }
      if (ty !== n.y) {
        for (const u of unit) { const nd = byId.get(u); if (nd) { nd.y = ty; nd.gen = Math.round(ty / ROW_H); } }
      }
      const cur = Math.min(...unit.map(u => (byId.get(u) || n).x));
      const dx = target - cur;
      if (!dx) continue;
      for (const u of unit) { const nd = byId.get(u); if (nd) nd.x += dx; }
    }
  }
  // ── ХАДАМ ТАЛ: хосын ХОЁР талын эцэг/эх нь НЭГ мөрөнд, ЗҮҮН/БАРУУН талд,
  // тус тусдаа хүүхдийнхээ (хосын гишүүний) дээр байрлана. ──
  {
    const byId3 = new Map(nodes.map(n => [n.id, n]));
    const grpOf = (id) => {
      const g = new Set();
      for (const e of (parentsOf.get(id) || [])) {
        for (const p of e.ps) {
          if (p === id) continue;
          for (const q of unitOf(p)) if (byId3.has(q)) g.add(q);
        }
      }
      return [...g];
    };
    const span = (g) => {
      const xs = g.map(i => byId3.get(i));
      return { l: Math.min(...xs.map(n => n.x)), r: Math.max(...xs.map(n => n.x + W(n.id))) };
    };
    const shift = (g, dx) => { for (const i of g) { const n = byId3.get(i); if (n) n.x += Math.round(dx); } };
    const setRow = (g, y) => { for (const i of g) { const n = byId3.get(i); if (n) { n.y = y; n.gen = Math.round(y / ROW_H); } } };
    const centerOver = (grp, child) => {
      const s = span(grp);
      shift(grp, (child.x + W(child.id) / 2) - (s.l + s.r) / 2);
    };
    for (const u of unions || []) {
      if (!vis.has(u.a_id) || !vis.has(u.b_id)) continue;
      const an = byId3.get(u.a_id), bn = byId3.get(u.b_id);
      if (!an || !bn || Math.abs(an.y - bn.y) > 4) continue;
      const ga = grpOf(u.a_id), gb = grpOf(u.b_id);
      if (!ga.length || !gb.length) continue;
      if (ga.some(i => gb.includes(i))) continue;      // нэг л гэр бүл — хадам биш
      const ya = Math.min(...ga.map(i => byId3.get(i).y));
      const yb = Math.min(...gb.map(i => byId3.get(i).y));
      if (ya === yb) continue;                          // аль хэдийн нэг мөрөнд
      const y = Math.max(ya, yb);                       // хосод ойр мөрөнд нэгтгэнэ
      setRow(ga, y); setRow(gb, y);
      const L = (an.x <= bn.x) ? { g: ga, c: an } : { g: gb, c: bn };
      const R = (L.g === ga) ? { g: gb, c: bn } : { g: ga, c: an };
      centerOver(L.g, L.c); centerOver(R.g, R.c);
      const sl = span(L.g), sr = span(R.g);
      if (sl.r + 24 > sr.l) {
        const d = Math.round((sl.r + 24 - sr.l) / 2) + 12;
        shift(L.g, -d); shift(R.g, d);
      }
    }
  }
  // Сөрөг мөр гарвал бүх модыг доошлуулна (канвас 0-ээс эхэлдэг)
  {
    let my0 = 0;
    for (const n of nodes) my0 = Math.min(my0, n.y);
    if (my0 < 0) for (const n of nodes) { n.y -= my0; n.gen = Math.round(n.y / ROW_H); }
  }
  compactBands(nodes, W);
  // ── ДАВХЦАЛ АРИЛГАХ: нэг мөрөнд картууд бие биенээ ХАЛХЛАХГҮЙ байх ─────
  // Мөр бүрт блок (хос) бүрийг зүүнээс баруун эрэмбэлж, өмнөх блокоос 12px-ээс
  // ойрхон бол БҮХЭЛ БЛОКЫГ баруун тийш шилжүүлнэ — хосын дотоод зай хэвээр.
  {
    const rows = new Map();
    for (const n of nodes) {
      const y = Math.round(n.y);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(n);
    }
    for (const row of rows.values()) {
      const units = new Map();
      for (const n of row) {
        const unit = unitOf(n.id).filter(u =>
          nodeAt.has(u) && Math.round(nodeAt.get(u).y) === Math.round(n.y));
        if (!unit.length) continue;
        const key = unit.slice().sort((a, b) => a - b).join(',');
        if (!units.has(key)) units.set(key, unit);
      }
      const items = [...units.values()].map(unit => {
        const xs = unit.map(u => nodeAt.get(u).x);
        return { unit, l: Math.min(...xs), r: Math.max(...unit.map(u => nodeAt.get(u).x + W(u))) };
      }).sort((a, b) => a.l - b.l);
      for (let i = 1; i < items.length; i++) {
        const need = Math.ceil(items[i - 1].r + 12 - items[i].l);
        if (need <= 0) continue;
        for (const u of items[i].unit) nodeAt.get(u).x += need;
        items[i].l += need; items[i].r += need;
      }
    }
  }
  const edges = [];
  for (const u of unions || []) {
    if (!vis.has(u.a_id) || !vis.has(u.b_id)) continue;
    const a = nodeAt.get(u.a_id), b = nodeAt.get(u.b_id);
    if (!a || !b) continue;
    edges.push({
      t: 's', a: u.a_id, b: u.b_id,
      x1: mid(a), y1: a.y + CARD_H / 2,
      x2: mid(b), y2: b.y + CARD_H / 2
    });
    // хосын нэгдмэл «платформ» — хоёр картыг нэг гэр бүлийн блок болгон
    // илэрхийлнэ (дээгүүрээ зурагдахын тулд тусгай төрөл 'p' холбоос)
    if (a.y === b.y) {
      const px1 = Math.min(a.x, b.x) - 5;
      const px2 = Math.max(a.x + W(a.id), b.x + W(b.id)) + 5;
      edges.push({ t: 'p', a: u.a_id, b: u.b_id, x: px1, y: a.y - 7, w: px2 - px1, h: CARD_H + 14 });
    }
  }
  // Хүүхдийн холболт — БҮГД НЭГДСЭН БЛОК (зурагийн дагуу):
  //  • хоёр эцэг/эх + нэг эгнээ → хосын төвөөс нэг гол шугмаар (тавцан + салаа)
  //  • ганц эцэг/эх → тухайн эцгийн доороос нэг гол шугмаар; эцгийг хүүхдийн
  //    шууд дээр нь байрлуулсан тул босоо «1 блок» шугам гарна
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const branchKids = new Map(); // хосын түлхүүр → { a, b, kids }
  const soloKids = new Map();   // эцэг|мөрийн_y → { p, kids }
  for (const [child, entries] of parentsOf) {
    const cn = nodeAt.get(child);
    if (!cn) continue;
    const psAll = [...new Set(entries.flatMap(e => e.ps))].filter(p => p !== child);
    let couple = null;
    for (let i = 0; i < psAll.length && !couple; i++) {
      for (let j = i + 1; j < psAll.length; j++) {
        const an = nodeAt.get(psAll[i]), bn = nodeAt.get(psAll[j]);
        if (an && bn && an.y === bn.y) { couple = [psAll[i], psAll[j]]; break; }
      }
    }
    if (couple) {
      const k = pairKey(couple[0], couple[1]);
      if (!branchKids.has(k)) branchKids.set(k, { a: couple[0], b: couple[1], kids: new Set() });
      branchKids.get(k).kids.add(child);
    }
    // ганц эцэг/эх, эсвэл хосын гадуурх нэмэлт эцэг/эх (ховор) — нэг блокоор
    for (const p of psAll.filter(p => !couple || !couple.includes(p))) {
      const pn = nodeAt.get(p);
      if (!pn) continue;
      const k = p + '|' + cn.y;
      if (!soloKids.has(k)) soloKids.set(k, { p, kids: new Set() });
      soloKids.get(k).kids.add(child);
    }
  }
  for (const { a, b, kids: g } of branchKids.values()) {
    const an = nodeAt.get(a), bn = nodeAt.get(b);
    if (!an || !bn) continue;
    const kidNodes = [...g].map(id => nodeAt.get(id)).filter(Boolean);
    if (!kidNodes.length) continue;
    const stemX = Math.round((mid(an) + mid(bn)) / 2);
    const kidTopP = Math.min(...kidNodes.map(n => n.y));
    const blockBotP = an.y + CARD_H + 7;        // хосын тавцангийн доод ирмэг
    // Хүүхдүүд эцэг/эхээс ДЭЭР байвал шугмыг картын ДЭЭД ирмэгээс эхлүүлнэ
    // (доош гүйлгэвэл картыг огтолно).
    const kidsAboveP = kidTopP + CARD_H <= an.y + 4;
    let stemY0P = kidsAboveP ? an.y : an.y + CARD_H / 2;
    let busY = kidTopP - 24;
    // Автобус нь тавцангийн доод ирмэг ба хүүхдийн мөрний ХООРОНД,
    // хоёулаасаа ижил зайтай байрлана — ирмэгтэй давхацахгүй.
    if (kidsAboveP) {
      const kidBot = Math.max(...kidNodes.map(n => n.y + CARD_H));
      busY = Math.round((kidBot + an.y) / 2);
    } else if (kidTopP > blockBotP + 4) {
      const gap = kidTopP - blockBotP;
      // Зай их бол хүүхдийн мөрний дээгүүр (бусад тавцанг огтлохгүй),
      // зай бага бол хоёр ирмэгийн ЯГ ДУНД байрлуулна.
      busY = gap >= 60 ? kidTopP - 24 : blockBotP + Math.round(gap / 2);
    } else if (kidTopP > an.y + CARD_H) {
      busY = Math.min(Math.max(busY, an.y + CARD_H + 10), kidTopP - 8);
    }
    edges.push({
      t: 'b', a, b,
      kids: kidNodes.map(n => n.id),
      x: stemX, y0: stemY0P, y1: busY,
      stubs: kidNodes.map(n => ({ c: n.id, x: mid(n), y0: busY, y1: n.y }))
    });
  }
  for (const { p, kids: g } of soloKids.values()) {
    const pn = nodeAt.get(p);
    if (!pn) continue;
    const kidNodes = [...g].map(id => nodeAt.get(id)).filter(Boolean);
    if (!kidNodes.length) continue;
    const stemX = Math.round(mid(pn));
    // урт хэвтээ элэгдэлтэй бол бусдын автобустай холилдохоос сэргийлж
    // мөр хоорондын ТУСДАА коридороор (дээд талаасаа 56px) гүйлгэнэ
    const maxDx = Math.max(...kidNodes.map(n => Math.abs(stemX - mid(n))));
    const kidTopS = Math.min(...kidNodes.map(n => n.y));
    const blockBotS = pn.y + CARD_H;             // картын доод ирмэг
    const kidsAboveS = kidTopS + CARD_H <= pn.y + 4;
    let busY = kidTopS - (maxDx > 400 ? 56 : 24);
    if (kidsAboveS) {
      const kidBot = Math.max(...kidNodes.map(n => n.y + CARD_H));
      busY = Math.round((kidBot + pn.y) / 2);
    } else if (kidTopS > blockBotS + 4) {
      const gap = kidTopS - blockBotS;
      busY = gap >= 60 ? kidTopS - 24 : blockBotS + Math.round(gap / 2);
    }
    edges.push({
      t: 'b', a: p, b: p,
      kids: kidNodes.map(n => n.id),
      x: stemX, y0: kidsAboveS ? pn.y : pn.y + CARD_H, y1: busY,
      stubs: kidNodes.map(n => ({ c: n.id, x: mid(n), y0: busY, y1: n.y }))
    });
  }

  let maxX = 0, maxY = 0;
  for (const n of nodes) { maxX = Math.max(maxX, n.x + W(n.id)); maxY = Math.max(maxY, n.y + ROW_H); }
  return { nodes, edges, width: maxX, height: maxY };
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
