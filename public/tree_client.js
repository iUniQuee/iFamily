// Модтой харилцах клиент: пан/зум/пинч, сонголт, холбох цэс, фокус-горим, дэлгэрэнгүй самбар
(() => {
  let S = window.__STATE__;
  let byId = new Map();
  let kidsOf = new Map(), parOf = new Map(), spOf = new Map(), bloodAdj = new Map(), parRole = new Map();
  let nodes = new Map(), edges = [];
  let focus = null, selected = null;
  let collapsed = new Set();
  let revealed = new Set(); // нээгдсэн ГЭР БҮЛИЙН хүүхдүүд (id)
  let closedFams = new Set(); // хаагдсан гэр бүл (эцэг/эхийн id) — нэг л гэр бүл нээлттэй
  let openMid = 0;            // дарсан хүн — мөрийнхөө голд (аав/ээжийнхээ доор) шилжинэ
  let showHidden = false;
  let hiddenCount = 0;      // одоогоор нуугдсан хүмүүсийн тоо (дээд талын тэмдэгт)
  let focusL = null;        // фокусын НЯГТ байрлал (серверээс)
  let fullL = null;         // «Бүтэн мод»-ын үеийн хатуу мөр (серверээс)
  let fullOpen = null;      // аккордеоноор нээсэн хүн (нэг л салбар)
  let fullClosed = false;   // тэр хүний хүүхдүүд хураагдсан эсэх (дахин дарахад)
  let fullSeq = 0;
  const layoutCache = new Map(); // /api/focus-layout хариултын кэш — давтан дарахад шууд
  let focusSeq = 0;
  let curRel = null; // сонгогдсон хүний хамаарал (нийтлэг: id → нэрс)
  // Нээсэн гишүүний БҮРЭН HTML-ийг санах ойд хадгална — дахин дарахад серверийг
  // хүлээхгүй (0ms) шууд гарна. Арын дэвсгэрт шинэчилж, сүүлийн хувилбараар солино.
  const detailHtmlCache = new Map();
  // Дарахаас ӨМНӨ (pointerdown) эхэлсэн профайлын хүсэлт — дарахад бэлэн байна
  const detailFetch = new Map();
  // Модны layout-ын хариу нь дээрх layoutCache-д (19-р мөр) хадгалагдана —
  // өмнө нээсэн хүн рүү буцахад серверийг хүлээхгүй.
  // Бичих үйлдлийн дараа бүх кэшийг цэвэрлэнэ (хуучин мэдээлэл харуулахгүй)
  window.__clearTreeCaches = () => { detailHtmlCache.clear(); detailFetch.clear(); layoutCache.clear(); };
  let vRel = null; // нэвтэрсэн хэрэглэгч төвтэй динамик нэршлүүд (id → нэр)
  let curAsc = null, curDesc = null; // шууд дээшээ (АЛТ) / доошоо (ЦЭНХЭР) үеийн идэвхижлэлт
  let view = { x: 40, y: 30, z: 1 };
  let fitted = false;
  let startCentered = false;   // анх ороход өөрийн карт дээр төвлөрсөн эсэх
  const RO = !!S.publicView;

  // Зураггүй хүмүүст зориулсан анхдагч дүрс (админ тохируулна)
  let AVATARS = {};
  function avatarSlot(m) {
    // 1) Хүйс: өөрийнх нь мэдэгдэж байвал; эс бөгөөс хамаатан байдлаас:
    //    хүүхдийнхээ эцэг/эх, хань, эцэг/эх.
    let sex = (m.sex === 'm' || m.sex === 'f') ? m.sex : '';
    if (!sex) {
      for (const roles of parRole.values()) {
        const r = roles.get(m.id);
        if (r === 'F') { sex = 'm'; break; }
        if (r === 'M') { sex = 'f'; break; }
      }
    }
    if (!sex) {
      for (const sid of spOf.get(m.id) || []) {
        const s = byId.get(sid);
        if (!s) continue;
        if (s.sex === 'm') { sex = 'f'; break; }
        if (s.sex === 'f') { sex = 'm'; break; }
      }
    }
    // 2) Нас: өөрийн төрсөн он; байхгүй бол хүүхэд/эцэг эх/хань/үеийн гүнээс.
    let age = ageOf(m);
    if (age == null) {
      const ys = [];
      for (const kid of kidsOf.get(m.id) || []) {
        const y = yearOf(byId.get(kid) || {});
        if (/^\d{4}$/.test(y)) ys.push(Number(y) - 25);
      }
      for (const pr of parOf.get(m.id) || []) {
        const y = yearOf(byId.get(pr) || {});
        if (/^\d{4}$/.test(y)) ys.push(Number(y) + 25);
      }
      for (const sid of spOf.get(m.id) || []) {
        const y = yearOf(byId.get(sid) || {});
        if (/^\d{4}$/.test(y)) ys.push(Number(y));
      }
      if (ys.length) age = new Date().getFullYear() - Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
    }
    if (age == null) {
      const n = nodes.get(m.id);
      const maxG = Math.max(0, ...[...nodes.values()].map(x => x.gen || 0));
      if (n) age = (n.gen || 0) <= 0 ? 70 : (n.gen || 0) >= maxG ? 10 : (maxG - (n.gen || 0)) * 25;
    }
    const band = age == null ? 'mid' : age < 13 ? 'child' : age < 26 ? 'young' : age < 56 ? 'mid' : 'old';
    return sex ? sex + '_' + band : '';
  }
  function avatarUrl(m) {
    const s = avatarSlot(m);
    return (s && AVATARS[s]) ? AVATARS[s] : '';
  }
  async function loadAvatars() {
    try {
      const j = await getJson('/api/avatars');
      const a = (j && j.avatars) || {};
      if (JSON.stringify(a) !== JSON.stringify(AVATARS)) { AVATARS = a; render(); }
    } catch (e) { /* дүрс байхгүй бол үсэг/эмодзи хэвээр */ }
  }

  const $ = (id) => document.getElementById(id);
  const add = (mp, k, v) => { if (k == null || v == null) return; if (!mp.has(k)) mp.set(k, new Set()); mp.get(k).add(v); };

  // ---------- дизайн: холбоосын өнгүүд (--link1/2/3) ----------
  // Сервер state.design-ээр өнгүүдийг илгээдэг ч өмнө нь CSS хувьсагч
  // тавигдахгүй байсан тул дизайны өнгө солиход юу ч өөрчлөгддөггүй байв.
  function applyDesign() {
    const d = (S && S.design) || {};
    const root = document.documentElement;
    if (d.link1) root.style.setProperty('--link1', d.link1);
    if (d.link2) root.style.setProperty('--link2', d.link2);
    if (d.link3) root.style.setProperty('--link3', d.link3);
    if (d.card) root.setAttribute('data-card', d.card);
  }

  // ---------- compile ----------
  function compile() {
    byId = new Map(S.members.map(m => [m.id, m]));
    kidsOf = new Map(); parOf = new Map(); spOf = new Map(); bloodAdj = new Map(); parRole = new Map();
    for (const l of S.links) {
      if (l.t === 'c') {
        add(kidsOf, l.p, l.c); add(parOf, l.c, l.p); add(bloodAdj, l.p, l.c); add(bloodAdj, l.c, l.p);
        if (l.r) { // F = аав, M = ээж (эцэг/эхийн үүрэг — динамик нэршилд хэрэгтэй)
          if (!parRole.has(l.c)) parRole.set(l.c, new Map());
          parRole.get(l.c).set(l.p, l.r);
        }
      }
      else { add(spOf, l.a, l.b); add(spOf, l.b, l.a); }
    }
    nodes = new Map((S.layout.nodes || []).map(n => [n.id, n]));
    edges = S.layout.edges || [];
  }

  // ---------- хамаарлын нэрс (картын доорх ногоон тэмдэг) ----------
  const PARENT_B = ['аав', 'ээж', 'эцэг', 'эх'];
  const SIBLING_B = ['ах', 'дүү', 'эгч'];
  const SIBLING_C = ['а д', 'д а', 'ад'];
  const GRAN_B = ['аав аав', 'аавын аав', 'ээжийн аав', 'эцгийн аав', 'аав өвөг', 'аав баавгай', 'өвөг', 'өвөө аав', 'аав ээж аав'];
  const GRAN_C = ['ээж ээж', 'ээжийн ээж', 'эцгийн ээж', 'аавын ээж', 'ээж ээжээ', 'ээж эмээ'];
  const spTitle = (sp) => {
    if (!sp) return '';
    if (sp.sex === 'm') return sp.alive === 0 ? 'Нөхөр (Н.Б)' : 'Нөхөр';
    if (sp.sex === 'f') return sp.alive === 0 ? 'Эхнэр (Н.Б)' : 'Эхнэр';
    return 'Хань';
  };
  function relLabels(fid) {
    const out = new Map();
    const yrOf = (m) => { const s = yearOf(m); return /^\d{4}$/.test(s) ? Number(s) : 0; };
    const kids = [...(kidsOf.get(fid) || [])].map(id => byId.get(id)).filter(Boolean);
    const sibs = [...(parOf.get(fid) || [])].flatMap(p => [...(kidsOf.get(p) || [])])
      .filter(id => id !== fid);
    const gps = [...(parOf.get(fid) || [])].flatMap(p => [...(parOf.get(p) || [])]);
    for (const id of kids) {
      out.set(id.id, id.sex === 'f' ? 'Охин' : 'Хүү');
      for (const k of kidsOf.get(id.id) || []) {
        const g = byId.get(k);
        if (g) out.set(k, g.sex === 'f' ? 'Ач охин' : 'Ач хүү');
      }
    }
    const myYear = yrOf(byId.get(fid) || {});
    for (const id of sibs) {
      const m = byId.get(id);
      const sy = m ? yrOf(m) : 0;
      let rel;
      if (m && myYear && sy && sy !== myYear) {
        rel = sy > myYear ? 'Дүү' : (m.sex === 'f' ? 'Эгч' : 'Ах');
      } else {
        rel = m ? (m.sex === 'f' ? 'Эгч' : 'Ах/Дүү') : 'Ах/Дүү';
      }
      out.set(id, rel);
      // Ах/дүүгийн хүүхэд: ахын бол АЧ, эгчийн бол ЗЭЭ
      const sibM = byId.get(id);
      for (const k of kidsOf.get(id) || []) {
        const m2 = byId.get(k);
        if (!m2) continue;
        if (sibM && sibM.sex === 'm') out.set(k, m2.sex === 'f' ? 'Ач охин' : 'Ач хүү');
        else out.set(k, m2.sex === 'f' ? 'Зээ охин' : 'Зээ хүү');
      }
    }
    // Эцгийн тал = АВГА, эхийн тал = НАГАЦ; тэдний хүүхэд = ҮЕЭЛ / БӨЛ
    const avun = new Map(); // id → 'F' | 'M' (аль тал)
    for (const p of parOf.get(fid) || []) {
      const pr = (parRole.get(fid) || new Map()).get(p);
      const side = pr === 'M' || (!pr && (byId.get(p) || {}).sex === 'f') ? 'M' : 'F';
      for (const g of parOf.get(p) || [])
        for (const x of kidsOf.get(g) || [])
          if (x !== fid && !sibs.includes(x) && !avun.has(x)) avun.set(x, side);
    }
    for (const [id, side] of avun) {
      const m = byId.get(id);
      const isF = m && m.sex === 'f';
      out.set(id, side === 'M' ? (isF ? 'Нагац эгч' : 'Нагац ах')
                              : (isF ? 'Авга эгч' : 'Авга ах'));
      // тэдний хүүхэд — эхийн тал «Бөл», эцгийн тал «Үеэл»
      for (const k of kidsOf.get(id) || []) {
        const c = byId.get(k);
        if (!c) continue;
        const base = side === 'M' ? 'Бөл' : 'Үеэл';
        const cy = yrOf(c);
        if (myYear && cy && cy !== myYear) out.set(k, cy > myYear ? base + ' дүү' : base + (c.sex === 'f' ? ' эгч' : ' ах'));
        else out.set(k, c.sex === 'f' ? base + ' охин' : (c.sex === 'm' ? base + ' хүү' : base));
      }
    }
    for (const id of gps) {
      const m = byId.get(id);
      const isF = m && m.sex === 'f';
      const rel = isF ? (m.alive === 0 ? 'Эмээ (Н.Б)' : 'Эмээ')
        : (m && m.alive === 0 ? 'Өвөө (Н.Б)' : 'Өвөө');
      out.set(id, out.get(id) === rel ? rel : rel);
    }
    for (const id of spOf.get(fid) || []) {
      const sp = byId.get(id);
      out.set(id, spTitle(sp));
    }
    for (const id of parOf.get(fid) || []) {
      const p = byId.get(id);
      out.set(id, p ? (p.sex === 'f' ? 'Ээж' : 'Аав') : 'Эцэг/Эх');
      for (const s of spOf.get(id) || []) {
        if (s === fid || (kidsOf.get(s) || []).has(fid)) continue;
        const st = byId.get(s);
        if (!st) continue;
        const t = st.sex === 'f' ? 'Ээж' : 'Аав';
        out.set(s, t); // аавын ээж (хадам ээж) / ээжийн аав гэх мэт
      }
    }
    return out;
  }
  // (debug/шалгалт) тухайн гишүүнд харуулах хамаатны шошго
  // Зурхайн шалгалтын hook (жил → билгийн жилийн нэр)
  window.__zurkhai = (y) => zurkhaiOf({ birth_date: String(y) + '-06-01', sex: 'm' });
  window.__rel = (id, center) => { const m = labelsFrom(center); return m ? (m.get(Number(id)) || null) : null; };
  function kinOf(id) {
    if (id == null || !byId.has(id)) return null;
    const out = new Set([id]);
    for (const x of parOf.get(id) || []) out.add(x);
    for (const x of kidsOf.get(id) || []) out.add(x);
    for (const x of spOf.get(id) || []) out.add(x);
    const sibs = new Set();
    for (const p of parOf.get(id) || []) for (const s of kidsOf.get(p) || []) if (s !== id) sibs.add(s);
    for (const x of sibs) {
      out.add(x);
      for (const g of kidsOf.get(x) || []) out.add(g); // үеэлүүд
    }
    const gps = new Set();
    for (const p of parOf.get(id) || []) for (const g of parOf.get(p) || []) gps.add(g);
    for (const g of gps) {
      out.add(g);
      for (const x of spOf.get(g) || []) out.add(x); // өвөг/эмээгийн хань
      for (const x of kidsOf.get(g) || []) {
        if (parOf.get(id) && parOf.get(id).has(x)) continue;
        out.add(x); // авга/нагац
        for (const y of spOf.get(x) || []) out.add(y);
        for (const c of kidsOf.get(x) || []) out.add(c); // тэдний хүүхэд
      }
    }
    for (const k of kidsOf.get(id) || []) for (const g of kidsOf.get(k) || []) out.add(g); // ач зээ
    return out;
  }
  // ---------- нэвтэрсэн хэрэглэгч төвтэй динамик нэршил ----------
  // Суурь 4 холбоос: F=Аав, M=Ээж, S=Хань, C=Хүүхэд.
  // Нэвтэрсэн хэрэглэгчийн member_id-аас эхлэн BFS замаар рекурсив хайж,
  // Монгол ураг төрлийн дүрмийн жагсаалтаар түр label буцаана (DB-д хатуу бичдэггүй).
  // Төв хүнээс (сүүлийн байдлаар нэвтэрсэн хэрэглэгч) хамаатан бүрийн нэрийг тооцно.
  // centerId өгвөл тэр хүнээс эхлэн тооцно — мод дээр аль ч хүн дээр дарахад ашиглагдана.
  function labelsFrom(centerId, depth) {
    const vid = centerId != null ? Number(centerId) : (S.viewer && S.viewer.member_id);
    if (!vid || !byId.has(vid)) return null;
    const me = byId.get(vid);
    const yrOf = m => { const s = yearOf(m); return /^\d{4}$/.test(s) ? Number(s) : 0; };
    const myYear = yrOf(me);
    const isViewer = !!(S.viewer && S.viewer.member_id === vid);
    const out = new Map([[vid, isViewer ? 'Би' : 'Энэ хүн']]);
    const roleOf = (cid, pid) => {
      const mm = parRole.get(cid);
      const r = mm && mm.get(pid);
      if (r) return r;
      const pm = byId.get(pid);
      return pm && pm.sex === 'f' ? 'M' : 'F'; // үүрэг тодорхойгүй бол хүйсээр нөхнө
    };
    // ids — замын дагуух хүмүүс (ids[0]=би), path — холбооны тэмдэглээ
    const term = (ids, path) => {
      const n = path.length, p = path.join(',');
      const tgt = byId.get(ids[n]) || {};
      const mid = byId.get(ids[n - 1]) || {}; // сүүлийнээс нэг нь (дундын хүн)
      const isF = tgt.sex === 'f';
      const sib = () => {
        const ty = yrOf(tgt);
        if (myYear && ty && ty !== myYear) return ty > myYear ? (isF ? 'Дүү охин' : 'Дүү') : (isF ? 'Эгч' : 'Ах');
        return isF ? 'Эгч/Дүү' : 'Ах/Дүү';
      };
      // Авга/нагац, өвөө/эмээгийн ах дүүг «дүү/охин» гэж ялгахгүй:
      // насны ангилалаар эрэгтэй нь «ах», эмэгтэй нь «эгч» гэнэ.
      // Жишээ: авга ах, авга эгч, нагац ах, нагац эгч, өвөөгийн ах/эгч.
      const parSib = (base, female) => base + (female ? ' эгч' : ' ах');
      if (n === 1) {
        if (p === 'F') return 'Аав';
        if (p === 'M') return 'Ээж';
        if (p === 'C') return isF ? 'Охин' : 'Хүү';
        if (p === 'S') return me.sex === 'f' ? 'Нөхөр' : 'Эхнэр';
      } else if (n === 2) {
        if (p === 'F,F') return 'Авга өвөө'; // аавын аав
        if (p === 'F,M') return 'Авга эмээ'; // аавын ээж
        if (p === 'M,F') return 'Нагац өвөө';
        if (p === 'M,M') return 'Нагац эмээ';
        if (p === 'C,C') return (mid.sex === 'm' ? 'Ач ' : mid.sex === 'f' ? 'Зээ ' : 'Ач/Зээ ') + (isF ? 'охин' : 'хүү');
        if (p === 'F,C' || p === 'M,C') return sib(); // ах/эгч/дүү (төрсөн онгоор эрэмбэ)
        if (p === 'S,F') return 'Хадам аав';
        if (p === 'S,M') return 'Хадам ээж';
        if (p === 'S,C') return isF ? 'Охин' : 'Хүү'; // хамтрагчийн өмнөх хүүхэд
        if (p === 'C,S') return mid.sex === 'm' ? 'Бэр' : mid.sex === 'f' ? 'Хүргэн' : 'Бэр/Хүргэн'; // хүүгийн эхнэр / охины нөхөр
        if (p === 'F,S') return 'Ээж'; // аавын шинэ хань — ээжийн үүрэгтэй
        if (p === 'M,S') return 'Аав'; // ээжийн шинэ хань — аавын үүрэгтэй
      } else if (n === 3) {
        if (p === 'S,F,C') return isF ? 'Хадам эгч' : 'Хадам ах';
        if (p === 'S,M,C') return isF ? 'Хадам эгч' : 'Хадам ах';
        if (p === 'S,F,F' || p === 'S,M,F') return 'Хадам өвөө';
        if (p === 'S,F,M' || p === 'S,M,M') return 'Хадам эмээ';
        if (p === 'S,F,S') return 'Хадам ээж'; // хадам аавын шинэ хань
        if (p === 'S,M,S') return 'Хадам аав'; // хадам ээжийн шинэ хань
        // Авга/нагац ах, эгч, ДҮҮ — эцэг/эхтэйгээ нас харьцуулж ялгана
        if (p === 'F,F,C' || p === 'F,M,C' || p === 'M,F,C' || p === 'M,M,C') {
          // Ах/эгч/дүүг НАДТАЙ харьцуулж ялгана (эцэг/эхтэй биш):
          // надаас ахмад бол «Авга ах», «Нагац эгч», бага бол «Авга дүү», «Нагац дүү».
          const base = p[0] === 'F' ? 'Авга' : 'Нагац';
          return base + ' ' + sibWord(myYear, yrOf(tgt), isF);
        }
        if (p === 'F,C,S' || p === 'M,C,S') {
          // ах/дүүгийн хань — төрсөн онгоор АХ эсвэл ДҮҮГ ялгана
          // (жишээ: Мягмардорж-ийн эхнэр → «Ахын эхнэр»)
          const ty = yrOf(mid);
          const older = myYear && ty && ty !== myYear ? ty < myYear : null;
          // Ахын эхнэр → «Бэр эгч», эгчийн нөхөр → «Хүргэн ах» гэх мэт
          if (mid.sex === 'm') return older === null ? 'Бэр' : (older ? 'Бэр эгч' : 'Бэр дүү');
          if (mid.sex === 'f') return older === null ? 'Хүргэн' : (older ? 'Хүргэн ах' : 'Хүргэн дүү');
          return 'Бэр/Хүргэн';
        }
        if (p === 'C,C,C') {
          const gc = byId.get(ids[n - 1]) || {};
          const side = mid.sex === 'm' ? 'Ач' : mid.sex === 'f' ? 'Зээ' : 'Ач/Зээ';
          return side + ' ' + (gc.sex === 'f' ? 'охины' : 'хүүгийн') + ' хүүхэд';
        }
        // Дээд үе: элэнц өвөө/эмээ (эхийн тал бол «Нагац элэнц …»)
        if (/^[FM],[FM],[FM]$/.test(p)) {
          return cap1((path[0] === 'M' ? 'Нагац ' : '') + (path[2] === 'F' ? 'элэнц өвөө' : 'элэнц эмээ'));
        }
      }
      // 4+ шатлалтай зам (жишээ: ээж → эмээ → нагац → үеэл → хань) —
      // бүтцээр (үеийн тоо, хүйс, төрсөн он) нэрлэнэ.
      return longName(ids, path);
    };
    // «эгч» → эгчийн, «ах» → ахын, «дүү» → дүүгийн, «охин» → охины ...
    const genitiveOf = (w) => {
      // «i» чухал: «Эмээ», «Ах», «Дүү» гэх мэт том үсгээр эхэлсэн үг ч таарна
      if (/(өвөө|эмээ)$/i.test(w)) return w + 'гийн';
      if (/эгч$/i.test(w)) return w + 'ийн';
      if (/ах$/i.test(w)) return w + 'ын';
      if (/дүү$/i.test(w)) return w + 'гийн';
      if (/охин$/i.test(w)) return w + 'ы';
      if (/хүүхэд$/i.test(w)) return w.replace(/эд$/i, 'дийн'); // хүүхэд → хүүхдийн
      if (/хүү$/i.test(w)) return w + 'гийн';
      return w + 'ийн';
    };
    // Ах/дүү/эгчийн хань — монгол ёсны нэрээр (хүйсийг заавал баримтална)
    const sibSpouse = (base) => {
      if (base === 'Ах') return 'Бэр эгч';        // ахын эхнэр
      if (base === 'Дүү') return 'Бэр дүү';       // дүүгийн эхнэр
      if (base === 'Эгч') return 'Хүргэн ах';     // эгчийн нөхөр
      if (base === 'Дүү охин') return 'Хүргэн дүү';
      if (base === 'Ах/Дүү') return 'Бэр';
      if (base === 'Эгч/Дүү') return 'Хүргэн';
      return null;
    };
    // Төрсөн оноор: ахмад нь ах/эгч, бага нь дүү
    const sibWord = (cy, ty, female) => {
      if (cy && ty && ty !== cy) return ty > cy ? 'дүү' : (female ? 'эгч' : 'ах');
      return female ? 'эгч/дүү' : 'ах/дүү';
    };
    function nameOf(ids, path) {
      return path.length >= 4 ? longName(ids, path) : term(ids, path);
    }
    function longName(ids, path) {
      const n = path.length;
      const tgt = byId.get(ids[n]) || {};
      const isF = tgt.sex === 'f';
      // ① Ханийн тал (хадам) — зам «S»-ээр эхэлсэн
      if (path[0] === 'S') return 'Хадам тал';
      // ② Сүүлчийн алхам нь хань — гэрлэлтээр орж ирсэн хүн
      if (path[n - 1] === 'S') {
        const base = nameOf(ids.slice(0, n), path.slice(0, n - 1));
        const bm = byId.get(ids[n - 1]) || {};
        // Хүйсийг заавал шалгана: эмэгтэй үеэлийн нөхөр → хүргэн, эрэгтэй үеэлийн эхнэр → бэргэн
        if (/Үеэл/.test(base)) return 'Үеэл ' + (bm.sex === 'f' ? 'хүргэн' : 'бэргэн');
        const ss = sibSpouse(base);
        if (ss) return ss;
        return genitiveOf(base) + (bm.sex === 'f' ? ' нөхөр' : ' эхнэр');
      }
      const up = path.filter(x => x === 'F' || x === 'M').length;
      const down = n - up;
      const g = up - down;                    // + дээд үе, − доод үе
      // ③ Шууд дээшээ үе: аав → өвөө → элэнц → хуланц
      if (down === 0) {
        const mat = path[0] === 'M';
        const lastF = path[n - 1] === 'F';
        if (n === 1) return lastF ? 'Аав' : 'Ээж';
        if (n === 2) return mat ? (lastF ? 'Нагац өвөө' : 'Нагац эмээ') : (lastF ? 'Авга өвөө' : 'Авга эмээ');
        if (n === 3) return cap1((mat ? 'Нагац ' : '') + (lastF ? 'элэнц өвөө' : 'элэнц эмээ'));
        if (n === 4) return cap1((mat ? 'Нагац ' : '') + (lastF ? 'хуланц өвөө' : 'хуланц эмээ'));
        return 'Дээд үе';
      }
      // ④ Дээд үеийн хажуугийн хамаатан (авга/нагац ба тэдний үеийнхэн)
      if (g > 0) {
        if (g === 1) {
          const side = path[0] === 'F' ? 'Авга' : 'Нагац';
          return side + ' ' + sibWord(myYear, yrOf(tgt), isF); // настай харьцуулна
        }
        if (g === 2) {
          const gp = byId.get(ids[2]) || {};
          // Өвөө/эмээгийн ах дүүг ӨВӨӨ/ЭМЭЭТЭЙ харьцуулна («Авга өвөөгийн дүү»)
          const gpBase = cap1((path[0] === 'F' ? 'Авга ' : 'Нагац ') + (gp.sex === 'f' ? 'эмээ' : 'өвөө'));
          return genitiveOf(gpBase) + ' ' + sibWord(yrOf(gp), yrOf(tgt), isF);
        }
        const anc = g <= 3 ? 'Элэнц өвөөгийн' : 'Хуланц өвөөгийн';
        return anc + ' ' + (isF ? 'эгч/дүү' : 'ах/дүү');
      }
      // ⑤ Нэг үеийнхэн — үеэл (авга, нагац хоёр тал)
      if (g === 0) {
        const w = sibWord(myYear, yrOf(tgt), isF);
        return (up === 2 ? 'Үеэл ' : 'Холын үеэл ') + w;
      }
      // ⑥ Доод үе
      if (g === -1) {
        if (up === 0) return isF ? 'Охин' : 'Хүү';
        if (up === 1) {
          // ids[n-1] — ах/эгч өөрөө: ахын хүүхэд «ач», эгчийн хүүхэд «зээ»
          const sib = byId.get(ids[n - 1]) || {};
          return (sib.sex === 'm' ? 'Ач ' : 'Зээ ') + (isF ? 'охин' : 'хүү');
        }
        return 'Үеэлийн ' + (isF ? 'охин' : 'хүү');
      }
      if (g === -2) {
        if (up === 0) return isF ? 'Ачийн охин' : 'Ачийн хүү';
        return 'Үеэлийн ач';
      }
      // ⑦ Гурав ба түүнээс доош үе
      if (up === 0) {
        if (g === -3) return isF ? 'Гуч охин' : 'Гуч хүү';
        return isF ? 'Шүү охин' : 'Шүү хүү';
      }
      return 'Үеэлийн ач';
    }
    const q = [{ ids: [vid], path: [] }];
    while (q.length) {
      const { ids, path } = q.shift();
      if (path.length >= 5) continue;
      const id = ids[ids.length - 1];
      const push = (nid, step) => {
        if (out.has(nid)) return;
        const nids = ids.concat(nid), npath = path.concat(step);
        out.set(nid, term(nids, npath));
        q.push({ ids: nids, path: npath });
      };
      for (const pid of parOf.get(id) || []) push(pid, roleOf(id, pid)); // ① F/M — цусан
      for (const cid of kidsOf.get(id) || []) push(cid, 'C');            // ② доод үе
      for (const sid of spOf.get(id) || []) push(sid, 'S');              // ③ хань (хамгийн сүүлд)
    }
    // Ханийн тал: «Хадам тал» гэсэн ерөнхий шошгыг хань руугаа төвлөрүүлж
    // «Эхнэрийн нагац ах», «Нөхрийн үеэл эгч» гэх мэтээр тодотгоно.
    if (!depth) {
      const hadam = [...out.keys()].filter(k => out.get(k) === 'Хадам тал');
      for (const sid of (spOf.get(vid) || [])) {
        const sp = byId.get(sid) || {};
        const pre = sp.sex === 'f' ? 'Эхнэрийн ' : 'Нөхрийн ';
        const inner = labelsFrom(sid, 1);
        if (!inner) continue;
        for (const [id2, lb] of inner) {
          if (id2 === vid) continue;
          if (out.has(id2) && out.get(id2) !== 'Хадам тал') continue;
          if (!lb || lb === 'Энэ хүн' || lb === 'Би') continue;
          // Том үсгийг жижиг болгож, хэллэг дунд зөв бичинэ: «Эхнэрийн нагац дүү»
          const low = lb.charAt(0).toLowerCase() + lb.slice(1);
          out.set(id2, lb === 'Хадам тал' ? 'Хадам тал' : pre + low);
        }
      }
      for (const k of hadam) if (!out.has(k)) out.set(k, 'Хадам тал');
    }
    return out;
  }
  function viewerLabels() { return labelsFrom(S.viewer && S.viewer.member_id); }
  // Шууд дээшээ үе (рекурсив): аав, ээж, өвөө, эмээ, ... — хажуугийнхийг оруулахгүй
  function ascOf(id) {
    const out = new Set();
    let q = [...(parOf.get(id) || [])];
    while (q.length) {
      const nx = [];
      for (const p of q) {
        if (out.has(p)) continue;
        out.add(p);
        for (const g of parOf.get(p) || []) nx.push(g);
      }
      q = nx;
    }
    return out;
  }
  // Шууд доошоо үе (рекурсив): хүүхдүүд, ач, зээ — хажуугийнхийг оруулахгүй
  function descOf(id) {
    const out = new Set();
    let q = [...(kidsOf.get(id) || [])];
    while (q.length) {
      const nx = [];
      for (const c of q) {
        if (out.has(c)) continue;
        out.add(c);
        for (const g of kidsOf.get(c) || []) nx.push(g);
      }
      q = nx;
    }
    return out;
  }

  // ---------- тооцоо ----------
  function ageOf(m) {
    const now = new Date();
    if (m.birth_date && String(m.birth_date).length >= 10) {
      const y = +String(m.birth_date).slice(0, 4), mo = +String(m.birth_date).slice(5, 7), d = +String(m.birth_date).slice(8, 10);
      let a = now.getFullYear() - y;
      if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) a--;
      return (a >= 0 && a < 130) ? a : null;
    }
    const mm = String(m.birth_year || '').match(/\d{4}/);
    if (mm) {
      const y = +mm[0];
      const a = now.getFullYear() - y;
      if (y >= 1900 && y <= now.getFullYear() && a >= 0 && a < 130) return a;
    }
    return null;
  }
  function yearOf(m) {
    const s = m.birth_date && String(m.birth_date).length >= 4 ? String(m.birth_date).slice(0, 4) : String(m.birth_year || '');
    return s || '—';
  }
  function bfsBlood(root, maxD) {
    // (үлдээсэн туслах) — фокус доорхfocusSet() ашиглана
    const dist = new Map([[root, 0]]);
    let q = [root];
    while (q.length) {
      const nx = [];
      for (const id of q) {
        const d = dist.get(id);
        if (d >= maxD) continue;
        for (const n of bloodAdj.get(id) || []) if (!dist.has(n)) { dist.set(n, d + 1); nx.push(n); }
      }
      q = nx;
    }
    return dist;
  }
  // Фокус-горим: шар холбоос (хосын платформ) ДЭЭШЭЭ асана — эцэг/эх, дараа нь
  // өвөө/эмээ рүү. Харагдах хүмүүс:
  //   ① тухайн хүн, ② шар холбоосонд орсон хүмүүс (эцэг/эх, өвөө/эмээ),
  //   ③ тэдний хүүхдүүд — эцэг/эхийн хүүхэд (ах/дүү) ба өвөө/эмээгийн хүүхэд (авга/нагац).
  // Нуугдана: бэр/хүргэн (хань), тэдний хүүхдүүд (үеэл, ач/зээ), өөрийн доод салбар.
  function focusSet(fid) {
    const a1 = new Set(parOf.get(fid) || []);            // аав / ээж
    const a2 = new Set();                                 // өвөө / эмээ
    for (const p of a1) for (const g of parOf.get(p) || []) a2.add(g);
    const out = new Set([fid, ...a1, ...a2]);
    for (const p of a1) for (const k of kidsOf.get(p) || []) out.add(k); // ах / дүү
    for (const g of a2) for (const k of kidsOf.get(g) || []) out.add(k); // авга / нагац
    // БҮХ ДЭЭД ҮЕ — өвөө/эмээгээс дээш хязгааргүй (сервертэй ижил дүрэм)
    {
      let q = [...a2];
      while (q.length) {
        const nx = [];
        for (const x of q) for (const p of parOf.get(x) || []) {
          if (!out.has(p)) { out.add(p); nx.push(p); }
        }
        q = nx;
      }
    }
    for (const k of kidsOf.get(fid) || []) out.add(k);                   // үр хүүхэд
    // Хань (бэр/хүргэн) анхдагчаар ХАРАГДАХГҮЙ — карт дээр дарж шатлалаар нээгдэнэ.
    // ХАДАМ ААВ/ЭЭЖ: хань (бэр/хүргэн)-ийн эцэг/эх — тусад нь бүлэг болж харагдана
    // (сервер тал ижил дүрмээр байрлуулдаг тул хоёр тал таарах ёстой).
    for (const id of [...out]) for (const sp of spOf.get(id) || [])
      for (const p of parOf.get(sp) || []) {
        out.add(p);
        for (const q of spOf.get(p) || []) out.add(q);
      }
    // Хэрэглэгчийн өөрийн карт фокус-горимд ҮРГЭЛЖ харагдана (алга болохгүй).
    // Фокусын картдаа ороогүй бол ГЭР БҮЛЭЭР нь (эцэг/эх + ах/дүү) хамт нэмнэ —
    // серверийн байрлалтай яг таарахын тулд.
    const vid = S.viewer && S.viewer.member_id;
    if (vid != null && byId.has(vid)) {
      if (out.has(vid)) {
        out.add(vid);
      } else {
        out.add(vid);
        for (const p of parOf.get(vid) || []) if (byId.has(p)) out.add(p);
        for (const p of parOf.get(vid) || [])
          for (const k of kidsOf.get(p) || []) if (byId.has(k)) out.add(k);
      }
    }
    return out;
  }
  // «Би»-ийн гэр бүлийн толгой (эцэг/эх) — гэр бүл сэлгэхэд энэ гэр бүл хаагдана
  // Цусан ойр хамаарал (фокус хүнээс, хань холбоосгүйгээр) — гэр бүлийн
  // тэмдгийг «цусан бус» (бэр/хүргэн) карт дээр байрлуулахад хэрэглэнэ.
  function bloodNear(root) {
    const seen = new Set([root]);
    let q = [root];
    for (let d = 0; d < 6 && q.length; d++) {
      const nx = [];
      for (const id of q) {
        for (const p of parOf.get(id) || []) if (!seen.has(p)) { seen.add(p); nx.push(p); }
        for (const k of kidsOf.get(id) || []) if (!seen.has(k)) { seen.add(k); nx.push(k); }
      }
      q = nx;
    }
    return seen;
  }
  let curBlood = null;   // render() дотор тооцоологдоно
  function revealedHeadIds() {
    const out = new Set();
    for (const k of revealed) for (const p of parOf.get(k) || []) out.add(p);
    return [...out];
  }
  // Фокус-горимд нэмэлт хумигдалтгүй: focusSet өөрөө зөвхөн эцэг/эх + ах/дүүсийг
  // үлдээж, хань/бэр/хүргэн, үеэл зэргийг аль хэдийн хассан байдаг.
  function sideHeads(fid) {
    return new Set();
  }
  // Идэвхтэй байрлал: фокус-горимд нягт байрлал, эс бөгөөс бүтэн мод
  function activeLayout() {
    // Бүгдийг нээсэн бол (showHidden) бүтэн модны байрлал зөв — фокусын нягт
    // байрлалд нуугдсан хүмүүс зөвхөн жижиг икон тул бага зай эзэлдэг
    if (focus != null && showHidden) return S.layout;
    if (focus == null) {
      // «БҮТЭН МОД»: үеийн ХАТУУ мөр (серверээс) — Row 1, Row 2, Row 3 …
      const me = (S.viewer && S.viewer.member_id) || null;
      if (fullL && me != null && Number(fullL.viewer) === Number(me)) return fullL;
      return S.layout;
    }
    return (focus != null && focusL && focusL.focus === focus) ? focusL : S.layout;
  }
  function shownIds() {
    let ids = new Set(nodes.keys());
    if (focus != null && !showHidden) {
      const fs = focusSet(focus);
      ids = new Set([...ids].filter(id => fs.has(id) || revealed.has(id)));
      // СЕРВЕР ЭРХТЭЙ: фокус-байрлалд ВАЙЛД картууд л харагдана. Ингэснээр
      // клиентийн тооцоо серверээс зөрсөн ч (жишээ нь эмээгийн ах/дүү)
      // илүү хүн гарч ирэхгүй. Зөвхөн дарж нээсэн (revealed) хүн нэмэгдэнэ.
      const ok = (focusL && focusL.focus === focus) ? new Set(focusL.cards || []) : null;
      if (ok && ok.size) ids = new Set([...ids].filter(id => ok.has(id) || revealed.has(id)));
      if (!ids.has(focus)) { focus = (S.viewer && S.viewer.member_id) || null; }
    }
    if (collapsed.size) {
      const hidden = new Set();
      const st = [...collapsed];
      while (st.length) {
        const id = st.pop();
        for (const k of kidsOf.get(id) || []) if (!hidden.has(k)) { hidden.add(k); st.push(k); }
        // хумигдсан картын ХАНИЙГ ч нууна (ахын эхнэр, авгын нөхөр гэх мэт) —
        // тэдний доод салбар ч хамтдаа нуугдана, зураас давхардахгүй
        for (const s of spOf.get(id) || []) if (!hidden.has(s)) { hidden.add(s); st.push(s); }
      }
      for (const id of hidden) ids.delete(id);
      for (const id of collapsed) if (nodes.has(id)) ids.add(id);
    }
    if (selected != null && !ids.has(selected)) selected = null;
    return ids;
  }

  // ---------- render ----------
  // Нээсэн хүний хань хажууд нь (нэг хос) зогсож байвал л хамт тодорно.
  function coupleNeighbor(m, n) {
    if (!fullL || !n) return false;
    if (![...(spOf.get(fullL.open) || [])].includes(m.id)) return false;
    const on = (fullL.nodes || []).find(x => x.id === fullL.open);
    return !!on && on.y === n.y && Math.abs(on.x - n.x) === 166;
  }
  // Нүүр зургийн КАРТ доторх харагдац: zoom (1 = хүрээг яг дүүргэсэн) ба
  // X/Y байрлал (0..1). Зургийг ТАЙРАХГҮЙ — зөвхөн хэмжээ/байрлалыг тооцно.
  function photoBoxStyle(m, W, H) {
    const ar = Number(m && m.par) || 0;
    if (!ar) return 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:50% 20%;';
    const z = Math.max(1, Number(m.pz) || 1);
    const cx = m.pcx == null ? 0.5 : Math.min(1, Math.max(0, Number(m.pcx)));
    const cy = m.pcy == null ? 0.5 : Math.min(1, Math.max(0, Number(m.pcy)));
    // «cover»: зураг хүрээг ЯГ дүүргэх хэмжээ (цагаан зай гарахгүй)
    let cw, ch;
    if (W / H > ar) { cw = W; ch = W / ar; } else { ch = H; cw = H * ar; }
    const dw = cw * z, dh = ch * z;
    const left = -(cx * Math.max(0, dw - W));
    const top = -(cy * Math.max(0, dh - H));
    return 'position:absolute;left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) +
      'px;width:' + dw.toFixed(1) + 'px;height:' + dh.toFixed(1) + 'px;max-width:none;object-fit:fill;';
  }
  // Дугуй avatar (профайл/жагсаалт) — мөн ижил хэмжээ/байрлалаар
  function avaImgHtml(m, url, size) {
    const src = escapeHtml(url);
    const box = photoBoxStyle(m, size, size);
    if (box.indexOf('width:100%') >= 0) {
      return '<img class="ava" src="' + src + '" alt="" style="width:' + size + 'px;height:' + size +
        'px;border-radius:50%;object-fit:cover;object-position:50% 20%;vertical-align:middle">';
    }
    return '<span style="position:relative;display:inline-block;width:' + size + 'px;height:' + size +
      'px;border-radius:50%;overflow:hidden;vertical-align:middle;flex:0 0 auto">' +
      '<img src="' + src + '" alt="" style="' + box + '"></span>';
  }

  function cardHtml(m, n, shown) {
    const initial = String(m.name || '?').trim().charAt(0).toUpperCase();
    // Нүүр зураг байвал эхний үсэг/emoji-ний оронд ЗУРГАА харна
    const avUrl = m.photo || avatarUrl(m);
    const ava = avUrl
      ? '<img class="ava" src="' + escapeHtml(avUrl) + '" alt="" loading="lazy" decoding="async" style="' +
        photoBoxStyle(m, 140, 96) + '">'
      : '<div class="ava">' + (m.emoji ? escapeHtml(m.emoji) : escapeHtml(initial)) + '</div>';
    const cls = ['card', m.sex === 'f' ? 'f' : m.sex === 'm' ? 'm' : 'q'];
    const isDead = m.alive === 0 || !!(m.death_date && String(m.death_date).trim());
    if (isDead) cls.push('dead');
    if (selected === m.id) cls.push('sel');
    if (focus === m.id) cls.push('focus');
    // «Бүтэн мод»: нээлттэй гэр бүлийн картууд идэвхтэй (`.active`) харагдана
    // Нээсэн хүн тодроно. Хань нь ЗӨВХӨН хажууд нь (нэг хос болж 166px =
    // 156+10 зайтай) зогсож байвал хамт тодроно — мөрийн төгсгөлд ганцаараа
    // зогссон хань нь «санамсаргүй 2 карт» мэт харагддаг байсныг зассан.
    else if (focus == null && fullL && (m.id === fullL.open || coupleNeighbor(m, n))) cls.push('focus');
    const isAsc = curAsc && curAsc.has(m.id);
    const isDesc = curDesc && curDesc.has(m.id);
    if (isAsc) cls.push('asc');
    else if (isDesc) cls.push('desc');
    // ТОДРУУЛГА (focus): сонгосон хүний ХАНЬ ба шууд ХҮҮХДҮҮД зөөлөн алтан
    // хүрээтэй болно. Гар утсан дээр карт дарахад цонх нээхгүй — зөвхөн энэ.
    if (selected != null && selected !== m.id) {
      const kinSet = spOf.get(selected) || new Set();
      if (kinSet.has(m.id) || (kidsOf.get(selected) || new Set()).has(m.id)) cls.push('kin');
    }

    const age = ageOf(m);
    let meta = escapeHtml(yearOf(m));
    if (age != null) meta += ' | ' + age + 'н';
    const kids = [...(kidsOf.get(m.id) || [])].map(id => byId.get(id)).filter(Boolean);
    // Хүүхдийн хүйсийн товчлол («Хүү, Охин (3)») картан дээр гарахгүй.
    let acts = '';
    if (selected === m.id) {
      acts = '<div class="acts">' +
        '<button class="a-info" title="Дэлгэрэнгүй" onclick="event.stopPropagation();window.__detail(' + m.id + ')">i</button>' +
        (m.e ? (
          '<button class="a-add" title="Садан нэмэх" onclick="event.stopPropagation();window.__menu(event,' + m.id + ')">＋</button>' +
          '<button class="a-edit" title="Засах" onclick="event.stopPropagation();window.__edit(' + m.id + ')">✎</button>'
        ) : '') +
        '</div>';
    }
    // Картны доорх «＋/−» хураах товчийг бүрмөсөн хасcан.
    // Нуугдсан хамаатаны бүлгийн тэмдэг: энэ картын цусан үр хүүхэд нуугдсан бол
    // картын энгэр дээр `👥 +N` — дарвал тэдгээрийг шууд нээнэ
    // «👥 +N» тэмдэг (нуугдсан хүний тоо) хасагдсан — карт дээр хэрэггүй.
    const grp = '';

    const me = (S.viewer && S.viewer.member_id === m.id);
    const defLabel = me ? 'Энэ би' : (m.sex === 'f' ? 'Охин' : 'Хүү');
    const pill = (vRel && vRel.get(m.id)) || (vRel ? 'Хамаатан' : defLabel);
    // Нас барсан гишүүний карт дээр жижиг саарал «†» тэмдэг
    const deadMark = isDead
      ? '<span class="dead-mark" title="Нас барсан">†</span>' : '';
    return '<div class="' + cls.join(' ') + '" data-id="' + m.id + '" style="left:' + n.x + 'px;top:' + n.y + 'px">' +
      '<div class="box">' + ava +
        '<div class="nm">' + escapeHtml(m.name) + '</div>' +
        '<div class="meta">' + meta + '</div></div>' + acts + grp + deadMark +
      '<span class="rpill">' + escapeHtml(pill) + '</span></div>';
  }

  function render() {
    const L = activeLayout();
    const es = L.edges || [];
    const shown = shownIds();
    // АНХНЫ ХАРАГДАЦ: 160 хүнтэй модыг бүхэлд нь багтааж жижигрүүлээд дараа нь
    // өөрийн карт руу «гүйх» анимэйшн хийхгүй — эхний зурагдахдаа л нэвтэрсэн
    // хэрэглэгчийн өөрийн карт дээр төвлөрч, уншигдахуйц зумтай гарна.
    const meFirst = (S.viewer && S.viewer.member_id) || null;
    const firstOnMe = !fitted && meFirst != null && (L.nodes || []).some(n => n.id === meFirst);
    if (firstOnMe && selected == null) selected = meFirst;
    curRel = (selected != null && byId.has(selected)) ? relLabels(selected) : null;
    curAsc = (selected != null && byId.has(selected)) ? ascOf(selected) : null;
    curDesc = (selected != null && byId.has(selected)) ? descOf(selected) : null;
    // Карт дээрх хамаатны нэр нь ҮРГЭЛЖ нэвтэрсэн хэрэглэгчээс тооцогдоно —
    // аль ч карт дээр дарахад нэр нь өөрчлөгдөхгүй. Харин дэлгэрэнгүй цонхны
    // Эцэг/Эх, Ах/Дүү, Хань, Хүүхэд чипүүд нь тухайн нээсэн хүнээс тооцогдоно.
    const centerId = (S.viewer && S.viewer.member_id) || null;
    vRel = labelsFrom(centerId);
    curBlood = (focus != null) ? bloodNear(focus) : null;
    // Хамаарлын өнгө — сонгосон хүн (эсвэл нэвтэрсэн хэрэглэгч) төвтэй:
    //   дээшээ үе — АЛТ #FFD700, хүүхэд/ач — НОГООН #2fae6a,
    //   ах/дүү — БҮДЭГ ЦЭНХЭР #9ec5f2,
    //   эцгийн ах/дүү (авга) — БҮДЭГ УСАН ҮЗЭМ ЯГААН #d9a8c8,
    //   эхийн ах/дүү (нагац) — БОР #8b5e3c.
    const relSel = (selected != null && byId.has(selected)) ? selected
      : ((S.viewer && S.viewer.member_id && byId.has(S.viewer.member_id)) ? S.viewer.member_id : null);
    const ascSet = relSel != null ? ascOf(relSel) : null;
    const descSet = relSel != null ? descOf(relSel) : null;
    // «Дээшээ үе = АЛТ» нь ЗӨВХӨН цусан өвөг. Хадмын тал (эхнэр/нөхрийн
    // эцэг/эх, өвөө/эмээ, ах/дүү) хэзээ ч алт биш — нил ягаан (хань) өнгөтэй.
    // relIn/relSp доор бөглөгддөг тул энэ шалгалт дуудагдах үед бэлэн байна.
    const relUp = (x) => !!ascSet && (x === relSel || ascSet.has(x)) &&
      !relIn.has(x) && !relSp.has(x);
    const relSib = new Set(), relPat = new Set(), relMat = new Set();
    const relSp = new Set(), relIn = new Set();
    if (relSel != null) {
      const myPars = [...(parOf.get(relSel) || [])];
      for (const p of myPars) {
        for (const k of kidsOf.get(p) || []) if (k !== relSel) relSib.add(k);
      }
      for (const p of myPars) {
        const pr = (parRole.get(relSel) || new Map()).get(p);
        const side = pr === 'M' || (!pr && (byId.get(p) || {}).sex === 'f') ? 'M' : 'F';
        for (const g of parOf.get(p) || []) {
          for (const x of kidsOf.get(g) || []) {
            if (x === relSel || relSib.has(x)) continue;
            (side === 'M' ? relMat : relPat).add(x);
          }
        }
      }
      // Хань ба хадмын тал (эхнэр/нөхрийн эцэг эх, өвөг, ах дүү) — нил ягаан
      for (const sp of spOf.get(relSel) || []) {
        relSp.add(sp);
        // ЗӨВХӨН 2 түвшин: эцэг/эх + тэдний бусад хүүхэд (ах/дүү).
        // Өвөг, ах/дүүгийн хүүхэд нь ӨНГӨГҮЙ — нил ягаан болохгүй.
        for (const p of parOf.get(sp) || []) {
          relIn.add(p);
          for (const k of kidsOf.get(p) || []) if (k !== sp) relIn.add(k);
        }
      }
    }
    const relClass = (c) => (relSp.has(c) || relIn.has(c)) ? ' link-sp'
      : (descSet && descSet.has(c)) ? ' link-kid'
      : relSib.has(c) ? ' link-sib'
      : relPat.has(c) ? ' link-pat'
      : relMat.has(c) ? ' link-mat' : '';
    const hlS = (a, b) => (relUp(a) && relUp(b)) ? ' link-up' : '';
    const hlC = (p, c) => relUp(c) ? ' link-up' : relClass(c);
    const hlStub = (c) => relUp(c) ? ' link-up' : relClass(c);
    // холбоосууд
    let svg = '';
    let heartOverlay = '';  // ТУРШИЛТ: зүрхийг бүх шугамаас ХОЙШ зурна
    // Байрлалын зангилаа — БҮХ шугамыг картын гол/ирмэгтэй тааруулна
    const LN = new Map((L.nodes || []).map(n => [n.id, n]));
    const CW = 156, CH = 96;
    const midOf = (id, fb) => { const n = LN.get(id); return n ? n.x + (n.w || CW) / 2 : fb; };
    // хосын нэгдмэл «платформ» — аав+ээжийг нэг блок болгон илэрхийлнэ;
    // дээгүүрээ бусад шугам зурагдахын тулд ЭХЛЭЭД тавьна
    for (const e of es) {
      if (e.t !== 'p' || !shown.has(e.a) || !shown.has(e.b)) continue;
      const na = LN.get(e.a), nb = LN.get(e.b);
      if (na && nb && Math.abs(na.y - nb.y) < 4) {
        const l = Math.min(na.x, nb.x) - 5;
        const r = Math.max(na.x + (na.w || CW), nb.x + (nb.w || CW)) + 5;
        svg += '<rect class="link-plat" x="' + l + '" y="' + (na.y - 7) + '" width="' + (r - l) +
          '" height="' + (CH + 14) + '" rx="12"/>';
      } else {
        svg += '<rect class="link-plat" x="' + e.x + '" y="' + e.y + '" width="' + e.w + '" height="' + e.h + '" rx="12"/>';
      }
    }
    // Хосын тавцан (b) аль хүүхдийг аль хэдийн холбосон бэ — тэдэнд эцэг/эх
    // тус бүрээс ТУСДАА шугам (c) зурахгүй, ингэснээр 2 биш 1 гол шугам гарна.
    // Хосын ХОЁР гишүүн хоёулаа эцэг/эх болсон ч сервер салбарын жагсаалтад
    // оруулаагүй (тусдаа `c` ирмэгээр өгсөн) хүүхдийг салбарт нэгтгэнэ —
    // эс бөгөөс зүрхний доор ХОЁР өөр өнгийн шугмаа зэрэг зургдаж, «давхар
    // шугам» үүсдэг (жишээ: Намжил & Хулганаа → Эрдэнэчимэг).
    const mergeKids = new Map();
    for (const e of es) {
      if (e.t !== 'b' || !shown.has(e.a) || !shown.has(e.b)) continue;
      const have = new Set((e.stubs || []).map(st => st.c));
      const add = [];
      for (const c of (kidsOf.get(e.a) || [])) {
        if (have.has(c) || !shown.has(c)) continue;
        const pars = [...(parOf.get(c) || [])];
        if (!pars.includes(e.b)) continue;
        add.push(c);
      }
      if (add.length) mergeKids.set(e, add);
    }
    const busDone = new Set();
    for (const e of es) {
      if (e.t !== 'b' || (!shown.has(e.a) && !shown.has(e.b))) continue;
      for (const st of e.stubs || []) if (shown.has(st.c)) busDone.add(st.c);
      for (const c of (mergeKids.get(e) || [])) if (shown.has(c)) busDone.add(c);
    }
    for (const e of es) {
      if (e.t === 's') {
        if (!shown.has(e.a) || !shown.has(e.b)) continue;
        // ХОСЫН ШУГАМ (нөхөр–эхнэр): картуудын ГОЛООС биш, хоёр картын
        // ХООРОНДХИЙ зайгаар (баруун ирмэг → зүүн ирмэг) зурна — өмнө нь
        // карт доогуур нуугдаж, шугам алга болсон мэт харагддаг байв.
        let sx1 = e.x1, sy1 = e.y1, sx2 = e.x2, sy2 = e.y2;
        const na = LN.get(e.a), nb = LN.get(e.b);
        if (na && nb) {
          const wa = na.w || CW, wb = nb.w || CW;
          if (Math.abs(na.y - nb.y) < 4) {
            // Хосын шугам картуудын ирмэг хүртэл БҮРЭН хүрнэ — карт бүрийн
            // доогуур 10px давхарлаж татна (карт нь шугамаас дээр зурдаг тул
            // илүү хэсэг нь харагдахгүй, завсар л арилна).
            const PAD = 10;
            if (na.x <= nb.x) { sx1 = na.x + wa - PAD; sx2 = nb.x + PAD; }
            else { sx1 = nb.x + wb - PAD; sx2 = na.x + PAD; }
            sy1 = sy2 = na.y + CH / 2;
          } else {
            // Өөр мөрөнд: дээд картын доод ирмэг → доод картын дээд ирмэг (голоор)
            const up = na.y < nb.y ? na : nb, dn = up === na ? nb : na;
            sx1 = up.x + (up.w || CW) / 2; sy1 = up.y + CH;
            sx2 = dn.x + (dn.w || CW) / 2; sy2 = dn.y;
          }
        }
        // Хосын шугам: сонгосон хүний хань бол НИЛ ЯГААН тодруулга
        const isSp = (relSel != null && (e.a === relSel || e.b === relSel));
        // Хосын ХОЁР гишүүн ч шууд өвөг (эцэг/эх, өвөө/эмээ, элэнц …) бол зүрх нь
        // АЛТ (#F59E0B) болж, цагаан дугуйн хүрээ нь зөөлөн алт (#FDE68A) болно.
        const isUpPair = relUp(e.a) && relUp(e.b);
        svg += '<line class="link-s' + hlS(e.a, e.b) + (isSp ? ' link-sp' : '') + '" x1="' + sx1 + '" y1="' + sy1 + '" x2="' + sx2 + '" y2="' + sy2 + '"/>';
        // Хосын шугамын голд цагаан дугуй + зүрх. Бүх шугамаас хойш
        // зурдаг тул доош буух салаа зүрхний доороос эхэлсэн мэт харагдана.
        // Өнгө: хань — нил ягаан, шууд өвөг — алт, бусад — саарал.
        {
          const hx = Math.round((sx1 + sx2) / 2), hy = Math.round((sy1 + sy2) / 2);
          const hStroke = isSp ? '#8B5CF6' : isUpPair ? '#FDE68A' : '#CBD5E1';
          const hFill = isSp ? '#8B5CF6' : isUpPair ? '#F59E0B' : '#94A3B8';
          heartOverlay += '<g class="sp-heart' + (isSp ? ' sp-active' : isUpPair ? ' up-active' : '') + '">' +
            '<circle cx="' + hx + '" cy="' + hy + '" r="11" fill="#FFFFFF" stroke="' +
            hStroke + '" stroke-width="' + ((isSp || isUpPair) ? '1.6' : '1') + '"/>' +
            '<text x="' + hx + '" y="' + (hy + 3.5) + '" text-anchor="middle" font-size="11" fill="' +
            hFill + '">&#9829;</text></g>';
        }
      } else if (e.t === 'b') {
        // Хосын салбар: гол шугмаар → хэвтээ тавцан → хүүхэд бүрт салаа.
        // ХОСЫН НЭГ нь л харагдаж байсан ч (жишээ нь эх нь нуугдмал) шугмыг
        // ХАРАГДАЖ БАЙГАА эцэг/эхийнх нь голоос татна — эс бөгөөс хүүхдүүд
        // «холбоогүй» мэт харагддаг байв.
        const pa = shown.has(e.a), pb = shown.has(e.b);
        if (!pa && !pb) continue;
        let stubs = (e.stubs || []).filter(s => shown.has(s.c));
        for (const mc of (mergeKids.get(e) || [])) {
          if (shown.has(mc)) stubs.push({ c: mc, x: midOf(mc, e.x), y0: e.y1, y1: e.y1 });
        }
        if (!stubs.length) continue;
        // Шугмыг ХАРАГДАЖ байгаа эцэг/эхийнх нь картын ГОЛООС татна
        const stemX = (pa && pb) ? Math.round((midOf(e.a, e.x) + midOf(e.b, e.x)) / 2)
          : (pa ? midOf(e.a, e.x) : midOf(e.b, e.x));
        // Салаа бүр хүүхдийнхээ картын ЯГ ГОЛ руу бууна (дундаа тасрахгүй)
        const stub = stubs.map(st => ({ c: st.c, x: midOf(st.c, st.x), y1: st.y1 }));
        const xs = stub.map(st => st.x);
        const bx1 = Math.min(stemX, ...xs), bx2 = Math.max(stemX, ...xs);
        // Тавцангийн өнгө: салаа БҮГД дээшээ үе (сонгосон хүн/өвөг) бол ШАР.
        // Ах/дүү байвал ХЭЗЭЭ Ч шар биш — бүдэг цэнхэр. Хос өөрөө/удам бол ногоон.
        const allUp = stubs.every(st => relUp(st.c));
        const anyUp = stubs.some(st => relUp(st.c));
        const anySib = stubs.some(st => relSib.has(st.c));
        // Авга/нагац (эцэг/эхийн ах дүү) — өөрийн ах дүүгээс ялгаатай өнгө
        const anyUncle = stubs.some(st => relPat.has(st.c) || relMat.has(st.c));
        const anyKid = stubs.some(st => st.c === relSel || (descSet && descSet.has(st.c)));
        // Хань ба хадмын тал — нил ягаан
        const anySp = stubs.some(st => relSp.has(st.c) || relIn.has(st.c));
        // АЛТ зөвхөн БҮХ салаа дээшээ үед. Бусад үед дизайны шар-алт
        // (--link2) өнгө огт ашиглахгүй — ах/дүү рүү явсан тавцан/шугмаа
        // шар харагдахаас сэргийлж бүдэг цэнхэр (ах/дүү өнгө) болгоно.
        // Тавцангийн өнгө — «дээшээ үе»-ээс БУСАД салаануудынхаар тодорхойлно:
        //   авга/нагац — ЯГААН (#F43F5E), ах/дүү — ЦЭНХЭР, хүүхэд — НОГООН.
        // Дээшээ үе рүү явсан зам нь тусдаа АЛТ overlay-аар (доор) зурагдана —
        // ингэснээр /Баярсайхан/ руу явсан босоо зам алт хэвээр, харин
        // ах/дүү, авга/нагац руу явсан тавцан нь өөрийн өнгөтэй болно.
        // Өвгийн зам дээрх тавцан: АЛТ нь зөвхөн БҮХ салаа дээшээ үе бол.
        // Холимог үед (нэг хүүхэд өвөг, бусды нь эгч/ах, авга/нагац) тавцан
        // ба тэдгээр салаа нь СААРАЛ (#CBD5E1) хэвээр үлдэж, өвөг рүү явсан
        // зам нь доорх АЛТ overlay-аар тусдаа будагдана — ингэснээр алт ба
        // хамаатаны өнгө бүх эгч/ах, авга/нагац руу тархахгүй.
        const busCls = allUp ? ' link-up'
          : anyUp ? ''
            : anyUncle ? ' link-uncle'
              : anySp ? ' link-sp'
                : anySib ? ' link-sib'
                  : anyKid ? ' link-kid' : '';
        // ШАР нь ЗӨВХӨН дээшээ үе (эцэг/эх, эмээ/өвөө …). Ах/дүү нь өөрийн
        // хамаарлын өнгөөрөө (бүдэг цэнхэр) хэвээр — тиймээс салаа бүр
        // өөрийн хамаарлаар будагдана (busUp-аар бүх салааг шар болгохгүй).
        // Гол шугмаа ба салаанууд НЭГ ЦЭГ дээр (bY) нийлнэ — хосын голын
        // шугам доошоо дуусаад хүүхдийн салаатай зайтай харагдахгүй.
        const stubTop = Math.min(...stubs.map(st => Math.min(st.y0, st.y1)));
        const bY = Math.min(e.y1, stubTop);
        // Шугмаа картын ирмэгээс эхэлнэ — карт дээр/доор агаарт эхлэхгүй
        const pn = [LN.get(e.a), LN.get(e.b)].filter(Boolean);
        const pTop = pn.length ? Math.min(...pn.map(n => n.y)) : e.y0;
        const pBot = pn.length ? Math.max(...pn.map(n => n.y + CH)) : e.y0;
        let stemY0 = bY > pBot ? pBot : (bY < pTop ? pTop : e.y0);
        // Шугмаа (зүрхний доорх босоо) — «идэвхтэй» хосын зүрхэн доор
        // ХЭЗЭЭ Ч саарал болохгүй: дээшээ үе байвал АЛТ, эс бөгөөс тавцангийн
        // өнгө (ягаан/цэнхэр/ногоон).
        let stemCls = anyUp ? ' link-up' : busCls;
        // Хосын ХОЁР карт нэг мөрөнд, шугмаа картуудын ХООРОНДХИЙ зайд байвал
        // шугмыг хосын шугам (картын голын өндөр) хүртэл дээш сунгана —
        // хосын шугам + шугмаа + тавцан гурвуулаа ТАСРАЛГҮЙ холбогдоно.
        if (pn.length === 2 && Math.abs(pn[0].y - pn[1].y) < 4) {
          const l = pn[0].x <= pn[1].x ? pn[0] : pn[1];
          const r2 = l === pn[0] ? pn[1] : pn[0];
          const gapL = l.x + (l.w || CW), gapR = r2.x;
          if (stemX >= gapL - 1 && stemX <= gapR + 1) {
            stemY0 = Math.round(l.y + CH / 2);
            // Шугмаа нь доошоо буух САЛААТАЙ нэг тасралтгүй зам болдог тул
            // өнгийг нь салааны өнгөнөөс (busCls) авна — эс бөгөөс зүрхний
            // доорх босоо хэсэг саарал, доорх хэвтээ салаа өнгөтэй болж,
            // нэг зам хоёр өнгөтэй харагддаг байв.
            stemCls = anyUp ? ' link-up' : busCls;
          }
        }
        // Хосын хоёр карт НЭГ МӨРӨНД, шугмаа хоорондын зайд байвал шугмыг
        // хосыг холбосон шугам (картын голын өндөр) хүртэл дээш сунгана —
        // «хосын шугамаас доош буусан» хэсэг нэг БҮТЭН босоо шугам болж,
        // картын доод ирмэг хүртэл завсар үлдэхгүй.
        // Бүх холбоос ижил өндөртэй байхын тулд шугмыг картын доод ирмэгээс
        // (тавцангийн доороос) эхлүүлнэ — хосын шугам хүртэл дээш сунгахгүй.
        if (!stemCls) stemCls = anyUp ? ' link-up' : busCls;
        svg += '<path class="link-s' + stemCls + '" d="M ' + stemX + ' ' + stemY0 + ' L ' + stemX + ' ' + bY + '"/>';
        if (bx2 > bx1) svg += '<path class="link-s' + busCls + '" d="M ' + bx1 + ' ' + bY + ' L ' + bx2 + ' ' + bY + '"/>';
        // Салаа нь тавцангийн шугамаас (e.y1) эхэлж, карт хүртэл ТАСРАЛГҮЙ
        // үргэлжилнэ. Өмнө нь s.y0 ба e.y1 бага зэрэг зөрөхөд (эсвэл голын
        // шугамтай 1-2px шилжихэд) шугам дундаа тасарч харагддаг байв.
        let upOverlay = '';
        for (const s of stub) {
          // Өвгийн замтай нэг тавцанд байгаа бусад салаа (эгч/ах, авга/нагац)
          // хамаатаны өнгөөр биш, саарал байна — зөвхөн өвөг рүү явсан салаа алт.
          const scls = relUp(s.c) ? ' link-up' : (anyUp ? '' : relClass(s.c));
          // Төгсгөл нь хүүхдийн картын ЯГ ирмэг дээр (дээр байвал доод,
          // доор байвал дээд ирмэг) — агаарт дуусахгүй.
          const cn = LN.get(s.c);
          const yEnd = cn ? (cn.y < bY ? cn.y + CH : cn.y) : s.y1;
          // Голын шугамтай бараг нэг тэнхлэгт бол хосын голоос шууд нэг
          // тасралтгүй босоо шугам татна (жижиг шатлал гарахгүй).
          if (Math.abs(s.x - stemX) <= 3) {
            svg += '<path class="link-c' + scls + '" d="M ' + stemX + ' ' + bY + ' L ' + s.x + ' ' + yEnd + '"/>';
          } else {
            svg += '<path class="link-c' + scls + '" d="M ' + s.x + ' ' + bY + ' L ' + s.x + ' ' + yEnd + '"/>';
          }
          // Дээшээ үе (өөрөө эсвэл өвөг) рүү явсан салаа бол картаас
          // эхлээд тавцангаар шугмаа хүртэл, дараа нь шугмаагаар хосын
          // шугам хүртэл БҮТЭН ШАР замыг давхар зурна. Тавцан ба шугмаа
          // ах/дүүтэй хуваалцдаг тул зөвхөн энэ замын хэсэг шар болно —
          // ах/дүү рүү явсан хэсэг цэнхэр хэвээр үлдэнэ.
          // Зөвхөн тавцангийн хэвтээ хэсгийг алтаар будна — шугмаа өөрөө
          // аль хэдийн алт тул босоог дахин зурвал «давхар шугам» болно.
          if (scls.indexOf('link-up') >= 0 && Math.abs(s.x - stemX) > 1) {
            upOverlay += '<path class="link-c link-up" d="M ' + s.x + ' ' + bY + ' L ' + stemX + ' ' + bY + '"/>';
          }
        }
        svg += upOverlay;
      } else if (e.t === 'c') {
        if (!shown.has(e.p) || !shown.has(e.c)) continue;
        if (busDone.has(e.c)) continue; // тавцангаар холбогдсон — давхар шугам хэрэггүй
        // Зөвхөн ШУЛУУН (ортогональ) шугам — мурий (bezier) зураас хэрэглэхгүй.
        // Төгсгөлүүд нь картын ГОЛ + ирмэг дээр таарна (агаарт дуусахгүй).
        const pn = LN.get(e.p), cn = LN.get(e.c);
        // Сервер хосын төвийг (e.x1) өгсөн бол түүнийгээ ашиглана — шугмаатай
        // нэг шулуун дээр таарахын тулд (эс бөгөөс картын голоос зурж, 2 шугам болно).
        let x1 = (e.x1 != null) ? e.x1 : (pn ? pn.x + (pn.w || CW) / 2 : e.x1);
        let x2 = cn ? cn.x + (cn.w || CW) / 2 : e.x2;
        let y1 = e.y1, y2 = e.y2;
        if (pn && cn) {
          if (cn.y >= pn.y + CH) { y1 = pn.y + CH; y2 = cn.y; }            // хүүхэд доор
          else if (cn.y + CH <= pn.y) { y1 = pn.y; y2 = cn.y + CH; }       // хүүхэд дээр
          else { y1 = pn.y + CH / 2; y2 = cn.y + CH / 2; }
        }
        const my = Math.round((y1 + y2) / 2);
        svg += '<path class="link-c' + hlC(e.p, e.c) + '" d="M ' + x1 + ' ' + y1 +
          ' L ' + x1 + ' ' + my + ' L ' + x2 + ' ' + my + ' L ' + x2 + ' ' + y2 + '"/>';
      }
    }
    // Нуугдсан хүмүүс — улаан хүн-икон + тоо (зөвхөн фокус-горимд):
    // нуугдсан хүн бүр байрлал дээрээ жижиг тэмдэгээр гарч ирнэ
    // Нуугдсан хүмүүсийг тусдаа икон болгож ЗУРАХГҮЙ — зөвхөн картын `👥 +N` тэмдэг
    hiddenCount = 0;
    if (focus != null && !showHidden) {
      hiddenCount = (L.nodes || []).filter(n => !shown.has(n.id)).length;
    }
    svg += heartOverlay;
    $('links').innerHTML = svg;
    // картууд
    let html = '';
    for (const n of L.nodes || []) {
      if (!shown.has(n.id)) continue;
      const m = byId.get(n.id);
      if (m) html += cardHtml(m, n, shown);
    }
    $('cards').innerHTML = html;
    renderTop();
    applyView();
    // хоосон / хүлээж буй
    const empty = $('empty'), waiting = $('waiting');
    empty.classList.add('hidden'); waiting.classList.add('hidden');
    if (!RO && S.awaiting) waiting.classList.remove('hidden');
    else if (!RO && S.members.length === 0) empty.classList.remove('hidden');
    if (!fitted && (L.nodes || []).length) {
      fitted = true;
      if (firstOnMe) {
        // ШУУД өөрийн карт дээр — fit() ч, rAF анимэйшн ч байхгүй (нэг зурагдалт).
        const vp0 = $('viewport');
        const z0 = Math.max(0.62, Math.min(1.05, (vp0 ? vp0.clientWidth : 360) / 430));
        const n0 = (L.nodes || []).find(x => x.id === meFirst);
        if (vp0 && n0) {
          view.z = z0;
          view.x = vp0.clientWidth / 2 - (n0.x + (n0.w || 156) / 2) * z0;
          view.y = vp0.clientHeight / 2 - (n0.y + 40) * z0;
        } else { fit(); }
      } else {
        fit();
        // 160 гишүүнтэй өргөн мод дэлгэцэнд «толбо» болж жижигрэхгүйн тулд
        // уншигдахуйц доод зум (0.62) тавина — бүтнийг харахыг хүсвэл pinch out.
        if (view.z < 0.5) {
          const vp0 = $('viewport');
          view.z = Math.max(0.62, Math.min(1.1, (vp0 ? vp0.clientWidth : 360) / 430));
        }
      }
    }
  }

  // «👤 <нэр>» — ямар ч горимд өөрийн карт руу буцаж, сонгогдсон (selected)
  // байдалтайгаар дэлгэцийн голд фокуслана. Логин хийсэн үеийнхтэй ижил.
  window.__gotoMe = async () => {
    const me = (S.viewer && S.viewer.member_id) || null;
    if (me == null) return;
    if (focus != null) window.__exitFocus();               // фокусоос гарна
    if (!(activeLayout().nodes || []).some(n => n.id === me)) {
      await loadFullLayout();                              // модонд байхгүй бол ачаална
    }
    focusOnSelf();                                    // сонгох + голлуулах
  };

  // «🌳 Үндсэн мод» — фокусыг цэвэрлэж, бүх модыг бүтнээр нь харуулна
  window.__mainTree = async (openId) => {
    // «🌳 Үндсэн мод» ба нэвтрэх — нэвтэрсэн хүнээр (салбар нь нээлттэй,
    // карт нь сонгогдож, дэлгэцийн голд) нээгдэнэ.
    const meViewer = (S.viewer && S.viewer.member_id) || null;
    if (openId === undefined) openId = meViewer;
    focus = null; focusL = null; focusSeq++;
    revealed = new Set(); collapsed = new Set(); closedFams = new Set();
    openMid = 0; showHidden = false; selected = null;
    const p = $('panel'); if (p) p.classList.add('hidden');
    // Нэвтрэхэд/«Үндсэн мод»-оор ороход өөрийн (нээсэн) хүний салбар
    // шууд нээлттэй байна — тэр хүн ах/дүү нарынхаа хамгийн баруун захad гарна.
    // ACCORDION (v453-ын ажиллаж байсан логик): анх ачаалахад нэвтэрсэн
    // хэрэглэгчийн (эсвэл «Үндсэн мод»-оор дарсан хүний) гэр бүл л нээлттэй.
    // Зөвхөн НЭГ хүний эхнэр/нөхөр + хүүхдүүд харагдана; бусад нь хаалттай.
    fullOpen = (openId != null) ? openId : null;
    fullClosed = false;
    render();
    await loadFullLayout();
    const want = (openId != null) ? openId : null;
    if (want != null && (activeLayout().nodes || []).some(n => n.id === want)) {
      // Уншигдахуйц зум + сонгосон карт дэлгэцийн голд (бүтэн мод 13532px тул
      // багтаасан зумьд карт 2-3px болж, хүрээ харагдахгүй байдаг).
      const vp = $('viewport'); const vw = vp ? vp.clientWidth : 360;
      view.z = Math.max(0.62, Math.min(1.1, vw / 430));
      applyView();
      selected = want; render(); centerOn(want);
    } else fit();
  };
  function roleName(r) {
    return { super: 'Супер админ', admin: 'Админ', coord: 'Зохицуулагч', member: 'Гишүүн' }[r] || r;
  }
  // Мэнюгийн Lucide дүрснүүд (16px, нэг ижил stroke) — emoji-г орлоно.
  const NAVI = {
    trees: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z"/><path d="M7 16v6"/><path d="M13 19v3"/><path d="M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5"/></svg>',
    cake: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/><path d="M7 4h.01"/><path d="M12 4h.01"/><path d="M17 4h.01"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>',
    idcard: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/><line x1="6" x2="6" y1="15" y2="15"/><line x1="10" x2="14" y1="15" y2="15"/></svg>',
    eyeoff: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  };
  const navBtn = (icon, label, onclick, opts) => {
    opts = opts || {};
    const tip = opts.title || label || '';
    return '<button class="nav-item' + (opts.on ? ' on' : '') + (opts.primary ? ' nav-primary' : '') + '"' +
      (tip ? ' title="' + tip + '" aria-label="' + tip + '"' : '') +
      ' onclick="' + onclick + '">' + icon + (label ? '<span>' + label + '</span>' : '') + '</button>';
  };
  const logoutBtn = () => '<button class="nav-logout" title="Гарах" onclick="window.__logout()">' + NAVI.logout + '<span>Гарах</span></button>';
  function whoHtml(name, roleTxt) {
    return '<span class="who-name">' + escapeHtml(name || '') +
      (roleTxt ? ' <b>· ' + escapeHtml(roleTxt) + '</b>' : '') + '</span>' + logoutBtn();
  }
  function renderTop() {
    const tb = $('topbtns'), who = $('who');
    if (RO) {
      tb.innerHTML = '<a class="btn" href="/">Нэвтрэх</a>';
      who.innerHTML = '<span class="who-name">Нийтийн холбоо</span>';
      return;
    }
    if (!S.viewer) { tb.innerHTML = ''; who.innerHTML = ''; return; }
    const role = S.viewer.role;
    let h = '';
    if (S.awaiting) {
      h += navBtn(NAVI.idcard, 'Карт холбох хүсэлт', 'window.__linkReq()', { primary: true });
      h += navBtn(NAVI.user, 'Профайл', 'window.__profile()');
      tb.innerHTML = h;
      who.innerHTML = whoHtml((S.viewer.name || '') + (S.pending_req ? ' · хүсэлт илгээсэн' : ''), '');
      const st = $('lr_status');
      // Хүсэлт илгээсэн бол аль карт руу, хэзээ илгээснийг pill хэлбэрээр харуулна
      if (st) st.innerHTML = S.pending_req
        ? '<span class="wpill">⏳ «' + escapeHtml(S.pending_req.card_name || ('#' + S.pending_req.member_id)) + '» — ' + escapeHtml(String(S.pending_req.created_at || '').slice(5, 16)) + ' · админы зөвшөөрлийг хүлээж байна</span>'
        : '';
      return;
    }
    // Идэвхтэй үзэл (мод) — зөөлөн emerald pill; бусад нь хүрээгүй, саарал.
    h += navBtn(NAVI.trees, 'Үндсэн мод', 'window.__mainTree()', { on: true, title: 'Бүх модыг бүтнээр харах' });
    // «Удам мод» товч ОДООХОНДО НУУГДСАН (хэрэглэгчдэд харагдахгүй).
    h += navBtn(NAVI.cake, 'Сануулга', 'window.__reminders()');
    h += navBtn(NAVI.trophy, 'Оноо', 'window.__scores()');
    // Админтай холбоотой БҮХ зүйл — НЭГ «Админ» хуудсанд
    if (role === 'admin' || role === 'super') {
      h += navBtn(NAVI.settings, 'Админ', 'window.__adminPage()', { title: 'Админ: дизайн, backup, Excel, импорт, аудит, эрх' });
    }
    if (focus != null) {
      if (showHidden) h += navBtn(NAVI.eyeoff, 'Нуу', 'window.__hideHidden()', { title: 'Нуугдсан хүмүүсийг дахин нуух' });
      else if (hiddenCount > 0) h += navBtn(NAVI.users, String(hiddenCount), 'window.__revealHidden()', { title: 'Нуугдсан ' + hiddenCount + ' хүнийг нээх' });
    }
    h += navBtn(NAVI.user, 'Профайл', 'window.__profile()');
    tb.innerHTML = h;
    // Хэрэглэгчийн нэр · эрх ба «Гарах» — баруун захад бүлэглэнэ
    who.innerHTML = whoHtml(S.viewer.name, roleName(role));
  }

  // ---------- view: пан/зум/пинч ----------
  // Зум/пан: rAF-аар нэгтгэж, translate3d-ээр GPU давхаргад гаргана.
  // (өмнө нь wheel/pointermove бүрд синхрон transform бичиж, бүх карт дахин
  //  растраар гацалт үүсгэж байсан)
  let viewRaf = 0;
  function applyView() {
    if (viewRaf) return;
    viewRaf = requestAnimationFrame(() => {
      viewRaf = 0;
      const w = $('world');
      if (!w) return;
      w.style.transform = 'translate3d(' + view.x.toFixed(2) + 'px,' + view.y.toFixed(2) +
        'px,0) scale(' + view.z.toFixed(4) + ')';
    });
  }
  function fit() {
    const FL = activeLayout();
    const ns = FL.nodes || [];
    const vw = $('viewport').clientWidth, vh = $('viewport').clientHeight;
    let w, h, x1 = 0, y1 = 0;
    if (ns.length) {
      // БОДИТ картуудын хүрээ (L.width/height хуучирсан байж болно)
      x1 = Infinity; y1 = Infinity; let x2 = -Infinity, y2 = -Infinity;
      for (const n of ns) {
        const nw = n.w || 156;
        if (n.x < x1) x1 = n.x;
        if (n.y < y1) y1 = n.y;
        if (n.x + nw > x2) x2 = n.x + nw;
        if (n.y + 118 > y2) y2 = n.y + 118;
      }
      w = Math.max(200, x2 - x1);
      h = Math.max(160, y2 - y1);
    } else {
      w = FL.width || 900; h = FL.height || 600;
    }
    // Доод хязгаар 0.03 — 160 гишүүнтэй өргөн модыг ч бүтнээрээ багтааж чадна
    const z = Math.max(0.03, Math.min(1.1, Math.min((vw - 36) / w, (vh - 70) / h)));
    view.z = z;
    // ХОЁР тэнхлэгээр төвлөрүүлнэ — дээр/доор хоосон зай, баруун захад тасралт байхгүй
    view.x = (vw - w * z) / 2 - x1 * z;
    view.y = (vh - h * z) / 2 - y1 * z;
    applyView();
  }
  function zoomAt(mx, my, nz) {
    nz = Math.max(0.03, Math.min(2.6, nz));   // бүтэн мод харагдуулахаар холдуулж болно
    view.x = mx - (mx - view.x) * (nz / view.z);
    view.y = my - (my - view.y) * (nz / view.z);
    view.z = nz;
    applyView();
  }
  function bindView() {
    const vp = $('viewport');
    vp.addEventListener('wheel', e => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      // Хулганы хүрд ба trackpad хоёуланд жигд: дельта хэмжээгээр зум
      const k = Math.max(0.85, Math.min(1.15, Math.exp(-e.deltaY * 0.0015)));
      zoomAt(e.clientX - r.left, e.clientY - r.top, view.z * k);
    }, { passive: false });

    const pts = new Map();
    let last = null, pinch = null, dragging = false, moved = 0;
    vp.addEventListener('pointerdown', e => {
      if (e.target.closest('#empty') || e.target.closest('#waiting')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }; vp.classList.add('dragging'); }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z };
        dragging = false;
        if (window.__markGesture) window.__markGesture();   // пинч зум
      }
    });
    vp.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const r = vp.getBoundingClientRect();
        zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, pinch.z * (d / pinch.d));
        return;
      }
      if (dragging && last) {
        moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
        if (moved > 8 && window.__markGesture) window.__markGesture();   // чирэлт
        view.x += e.clientX - last.x;
        view.y += e.clientY - last.y;
        last = { x: e.clientX, y: e.clientY };
        applyView();
      }
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { dragging = false; last = null; vp.classList.remove('dragging'); }
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);
    vp.addEventListener('pointerleave', up);
  }

  // ---------- сонголт / картын үйлдэл ----------
  function bindCards() {
    let lastTap = { id: 0, t: 0 };
    $('cards').addEventListener('click', e => {
      const card = e.target.closest('.card');
      if (!card) return;
      const id = Number(card.dataset.id);
      if (e.target.closest('.acts')) return;
      // Давхар даралт: карт бүр даралтын дараа дахин зурагдах тул браузерын dblclick
      // ажиллахгүй — 450ms дотор ижил картад хоёр даралт ирвэл ФОКУС
      const now = Date.now();
      if (!RO && lastTap.id === id && now - lastTap.t < 450) {
        lastTap = { id: 0, t: 0 };
        window.__setFocus(id);
        return;
      }
      lastTap = { id, t: now };
      // КАРТ ДЭЭР ДАРАХАД: модыг ДАХИН ЗУРАХГҮЙ/ТООЦООЛОХГҮЙ — зөвхөн
      // профайл самбар санах ойгоос шууд нээгдэж, камер тэр хүн рүү зөөлөн
      // гулсана (smooth pan/zoom). Гэр бүл сэлгэх бол картын давхар даралт.
      selected = id;
      render();            // сонголт + хань/хүүхдийн тодруулга (DOM л, сервергүй)
      // КОМПЬЮТЕР (≥768px): дэлгэрэнгүй самбар нээгдэж, камер зөөлөн гулсана.
      // ГАР УТАН (<768px): цонх НЭЭГДЭХГҮЙ — зөвхөн тодруулга + камер; профайлыг
      // зөвхөн карт дээрх ⓘ товчоор нээнэ. Самбар аль хэдийн нээлттэй бол
      // (жишээ нь чипээр шилжих) агуулгыг нь шинэчилнэ — хуучин мэдээлэл үлдэхгүй.
      const isDesktop = window.matchMedia('(min-width: 768px)').matches;
      const panelOpen = !$('panel').classList.contains('hidden');
      if (isDesktop || panelOpen) openDetail(id);
      // АККОРДЕОН: дарсан хүний үр хүүхэд нээгдэж, өмнөх хүнийх нь хумигдана
      // (серверээс open=<id> layout татна). Дууссаны дараа камерыг тэр хүн рүү
      // ХОЁР фрэймийн дараа зөөлөн гулсуулна — самбар нээгдэж flex хэмжээ
      // шинэчлэгдсэн, шинэ layout байрласан байна.
      const glide = () => requestAnimationFrame(() => requestAnimationFrame(() => panTo(id)));
      try { Promise.resolve(window.__accordion(id)).then(glide, glide); }
      catch (e) { glide(); }
    });
    // ХҮРЭХ/ДАРАХЫН ТЭР ДОРУЙ профайлын хүсэлтийг эхлүүлнэ — click хүртэлх
    // хугацаанд хариу ирж, самбар тэр даруй дүүрнэ.
    const prefetchDetail = (e) => {
      const card = e.target.closest && e.target.closest('.card');
      if (!card) return;
      const id = Number(card.dataset.id);
      if (!id || detailHtmlCache.has(id) || detailFetch.has(id)) return;
      try { detailFetch.set(id, getJson('/api/members/' + id)); } catch (err) {}
    };
    $('cards').addEventListener('pointerdown', prefetchDetail, { passive: true });
    $('cards').addEventListener('mouseenter', prefetchDetail, true);
    $('cards').addEventListener('dblclick', e => {
      const card = e.target.closest('.card');
      if (!card || RO) return;
      window.__setFocus(Number(card.dataset.id));
    });
    $('empty').addEventListener('click', e => {
      if (e.target.id === 'firstBtn') window.__newMember(null);
    });
  }

  // ---------- modal ----------
  function openModal(title, body, footer, cls) {
    const root = $('modalroot');
    root.classList.remove('hidden');
    root.innerHTML = '<div class="modal' + (cls ? ' ' + cls : '') + '"><div class="mh">' + title +
      '<button class="ghost close" style="margin-left:auto" onclick="window.__closeModal()">✕</button></div>' +
      '<div class="mb">' + body + '</div>' +
      '<div class="mf">' + (footer || '<button onclick="window.__closeModal()">Цуцлах</button>') + '</div></div>';
    root.onclick = e => { if (e.target === root) window.__closeModal(); };
  }
  window.__closeModal = () => { const r = $('modalroot'); r.classList.add('hidden'); r.innerHTML = ''; };

  // ---------- сонгогч (picker) ----------
  let pickState = { items: [], listId: '', inputId: '', sel: null };
  function renderPick() {
    const el = $(pickState.listId);
    if (!el) return;
    const inp = pickState.inputId ? $(pickState.inputId) : null;
    const q = ((inp && inp.value) || '').toLowerCase().trim();
    const list = pickState.items.filter(x => !q || String(x.name).toLowerCase().includes(q));
    el.innerHTML = list.map(x => {
      const badge = x.sex === 'm' ? 'Хүү' : x.sex === 'f' ? 'Охин' : 'хүн';
      const yr = x.birth_date ? String(x.birth_date).slice(0, 4) : (x.birth_year || '');
      return '<div data-id="' + x.id + '" class="' + (pickState.sel === x.id ? 'on' : '') + '" onclick="window.__pick(' + x.id + ')">' +
        '<span style="flex:1">' + escapeHtml(x.name) + '</span>' +
        '<span class="badge">' + badge + '</span>' +
        '<span style="opacity:.6">' + escapeHtml(String(yr)) + '</span></div>';
    }).join('') || '<div style="opacity:.6">Олдохгүй</div>';
  }
  window.__pick = id => { pickState.sel = id; renderPick(); };
  window.__pickQ = () => renderPick();
  async function loadPick(kind, of, listId, inputId) {
    const j = await getJson('/api/pick?kind=' + kind + '&of=' + of);
    pickState = { items: j.members || [], listId, inputId, sel: null };
    renderPick();
    return pickState;
  }

  // ---------- монгол зурхай + төрсөн тухай (бүгд бодит мэдээллээс тооцогдоно) ----------
  const ANIMALS = [
    ['Хулгана', 'хулганы'], ['Үхэр', 'үхрийн'], ['Бар', 'барын'], ['Туулай', 'туулайн'],
    ['Луу', 'луу'], ['Могой', 'могойн'], ['Морь', 'морин'], ['Хонь', 'хонин'],
    ['Бичин', 'бичин'], ['Тахиа', 'тахиа'], ['Нохой', 'нохойн'], ['Гахай', 'гахай']
  ];
  // 12 жилийн амьтны эможи — оноос хамаарч автоматаар солигдоно
  const JIL_ZURAG = {
    'Хулгана': '🐭', 'Үхэр': '🐮', 'Бар': '🐯', 'Туулай': '🐰',
    'Луу': '🐲', 'Могой': '🐍', 'Морь': '🐴', 'Хонь': '🐑',
    'Бичин': '🐵', 'Тахиа': '🐔', 'Нохой': '🐶', 'Гахай': '🐷'
  };
  const ELEMS10 = ['Мод', 'Мод', 'Гал', 'Гал', 'Шороо', 'Шороо', 'Төмөр', 'Төмөр', 'Ус', 'Ус'];
  const ELEM_COLOR = { 'Мод': 'ногоон', 'Гал': 'улаан', 'Шороо': 'шар', 'Төмөр': 'цагаан', 'Ус': 'хар' };
  // Суудал — найман суудал эргэлдэнэ
  // Суудлын хүрд (дээд талаас нар зөв): Гал → Шороо → Төмөр → Огторгуй → Ус → Уул → Мод → Хий
  const ZUR_WHEEL = ['Гал', 'Шороо', 'Төмөр', 'Огторгуй', 'Ус', 'Уул', 'Мод', 'Хий'];
  // Өнгөний тэмдэглэл: ЭР жилийн амьтан дээр «Хөх, Улаан, Шар, Цагаан, Хар»,
  // ЭМ жилийн амьтан дээр «Хөхөгчин, Улаагчин, Шарагчин, Цагаагчин, Харагчин»
  const COLOR_ADJ = {
    'ногоон': ['хөх', 'хөхөгчин'],
    'улаан': ['улаан', 'улаагчин'],
    'шар': ['шар', 'шарагчин'],
    'цагаан': ['цагаан', 'цагаагчин'],
    'хар': ['хар', 'харагчин']
  };
  // 9 мэнгэний албан ёсны нэршил (өөр хослол гаргахгүй)
  const MENGGE9 = [null, 'цагаан', 'хар', 'хөх', 'ногоон', 'шар', 'цагаан', 'улаан', 'цагаан', 'улаан'];
  // 8 хөлөл (суудал): эрэгтэй 1 настайдаа Гал, эмэгтэй 1 настайдаа Ус —
  // цааш нар зөв/нар буруу гэсэн энэ дарааллаар эргэлдэнэ.
  const ZUR_WHEEL_START = { m: 0, f: 4 };
  // Цагаан сарын өдөр — жил бүрийн шинийн нэгэн (сар.өдөр)
  const TSAGAAN = { 2020: '02.24', 2021: '02.12', 2022: '02.02', 2023: '02.21', 2024: '02.10',
    2025: '03.01', 2026: '02.17', 2027: '02.07', 2028: '01.26', 2029: '02.13', 2030: '02.03',
    2031: '02.22', 2032: '02.11', 2033: '01.31', 2034: '02.19' };
  const mod = (a, n) => ((a % n) + n) % n;

  function birthParts(m) {
    const s = String((m && m.birth_date) || '').trim();
    const y = Number((s.match(/^(\d{4})/) || [])[1] || (m && m.birth_year) || 0) || null;
    const mo = Number((s.match(/^\d{4}-(\d{1,2})/) || [])[1] || 0) || null;
    const d = Number((s.match(/^\d{4}-\d{1,2}-(\d{1,2})/) || [])[1] || 0) || null;
    return { y, mo, d };
  }
  // Билгийн жил: Цагаан сарын шинийн нэгний өдрөөс өмнө төрвөл өмнөх билгийн жилд тооцно
  function lunarYearOf(m) {
    const { y, mo, d } = birthParts(m);
    if (!y) return null;
    const ts = TSAGAAN[y];
    if (ts && mo) {
      const tm = Number(ts.slice(0, 2));
      const td = Number(ts.slice(3, 5));
      const before = mo < tm || (mo === tm && (!d || d < td));
      return before ? y - 1 : y;
    }
    // Цагаан сарын хүснэгтэд байхгүй он: 2-р сарын 5-ны өмнө төрсөн бол өмнөх жил
    const before = !!mo && (mo < 2 || (mo === 2 && (!d || d < 5)));
    return before ? y - 1 : y;
  }
  // Өнгөний тэмдэглэл: амьтны хүйсээр (0,2,4… = эр жил; 1,3,5… = эм жил)
  function colorAdjOf(elem, animalIdx) {
    const pair = COLOR_ADJ[ELEM_COLOR[elem]] || ['хар', 'харагчин'];
    return animalIdx % 2 === 0 ? pair[0] : pair[1];
  }
  // 8 хөлөл: эрэгтэй Галаас, эмэгтэй Уснаас эхэлж, 1 нас тутам нэг суудлаар
  function seatOf(sex, age) {
    const start = sex === 'f' ? ZUR_WHEEL_START.f : ZUR_WHEEL_START.m;
    return ZUR_WHEEL[mod(start + age - 1, 8)];
  }
  function zurkhaiOf(m) {
    const ly = lunarYearOf(m);
    if (!ly) return null;
    const aIdx = mod(ly - 4, 12);
    const an = ANIMALS[aIdx];
    const el = ELEMS10[mod(ly - 4, 10)];
    const nowY = new Date().getFullYear();
    const nIdx = mod(nowY - 4, 12);
    const now = ANIMALS[nIdx];
    const nowEl = ELEMS10[mod(nowY - 4, 10)];
    const lunarAge = nowY - ly + 1;
    // Мэнгэ: (2 − билгийн жил) mod 9, 0 гарвал 9
    const mengge = mod(2 - ly, 9) || 9;
    const pIdx = mod(ly - 5, 12);
    return {
      ly,
      animal: an[0], animalAdj: an[1],
      elem: el, color: ELEM_COLOR[el],
      colorAdj: colorAdjOf(el, aIdx),
      mengge,
      menggeName: MENGGE9[mengge],
      seat: seatOf(m.sex, lunarAge),
      seatStartWord: m.sex === 'f' ? 'Уснаас' : 'Галаас',
      seatDirWord: m.sex === 'f' ? 'нар буруу' : 'нар зөв',
      nowY, nowAnimal: now[0], nowAnimalAdj: now[1], nowColor: ELEM_COLOR[nowEl],
      nowColorAdj: colorAdjOf(nowEl, nIdx),
      lunarAge,
      icon: JIL_ZURAG[an[0]] || an[2] || '🐾',
      prevColorAdj: colorAdjOf(ELEMS10[mod(ly - 5, 10)], pIdx),
      prevAnimalAdj: ANIMALS[pIdx][1],
      nextSeat: seatOf(m.sex, lunarAge + 1),
      nextTsagaan: TSAGAAN[nowY + 1] || '02.07'
    };
  }
// Монгол харьяалахын тийн ялгал — угийн бичгийн «эцгийн нэр»:
//  1) эр үг -ын/-ы, эм үг -ийн/-ий (аялгыг сүүлийн бүтэн эгшгээр тогтооно)
//  2) ж, ч, ш, г, х, ь, и-ээр төгссөн эр үг ч -ийн/-ий авна
//  3) «-атар/-этэр» төгсгөлийн эгшиг унана: Хатанбаатар → Хатанбаатрын
//  4) ь нь «и» болно: Төмөрбань → Төмөрбанийн, Ань → Анийн
function genitiveName(name) {
  const n = String(name == null ? '' : name).trim();
  if (!n) return '';
  const V = 'аэиоуөүяеёюы';
  const isV = (c) => V.indexOf(c) >= 0;
  const vowels = n.split('').filter(isV);
  const full = vowels.filter(c => c !== 'и');
  const lastV = (full.length ? full : vowels).slice(-1)[0] || '';
  const back = 'аоуыя'.indexOf(lastV) >= 0;
  const suf = back ? 'ын' : 'ийн';
  // 3) гээгдэх эгшиг: -атар / -этэр
  const tail4 = n.slice(-4);
  if (tail4 === 'атар' || tail4 === 'этэр') return n.slice(0, -2) + n.slice(-1) + suf;
  const last = n.slice(-1);
  // 4) зөөлрүүлэх тэмдэг «ь» → «и»
  if (last === 'ь') return n.slice(0, -1) + 'ийн';
  if (last === 'й') return n + 'н';
  // 1) «-н»: эр үг «-ы», эм үг «-гийн»
  if (last === 'н') return n + (back ? 'ы' : 'гийн');
  // 2) ж, ч, ш, г, х
  if ('гкхжчш'.indexOf(last) >= 0) return n + 'ийн';
  if (isV(last)) {
    const dbl = n.length > 1 && n.charAt(n.length - 2) === last;
    return dbl ? n + 'гийн' : n.slice(0, -1) + 'ийн';
  }
  return n + suf;
}

  // Аавын нэрээр эцгийн нэр (Монгол ёсон: «Баярсайханы Дөлгөөн»)
  function patronymicOf(id) {
    const pars = [...(parOf.get(id) || [])].map(x => byId.get(x)).filter(Boolean);
    const dad = pars.find(p => p.sex === 'm') || pars[0];
    return dad && dad.name ? genitiveName(dad.name) : '';
  }
  function cap1(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function seatWheelHtml(z) {
    let s = '<div class="zwheel"><div class="zwring"></div><div class="zwcenter"><b>' + z.lunarAge + '</b><span>нас</span></div>';
    ZUR_WHEEL.forEach((name, i) => {
      const a = (i * 45 - 90) * Math.PI / 180;
      const x = 50 + 46 * Math.cos(a), y = 50 + 46 * Math.sin(a);
      s += '<span class="zwl' + (name === z.seat ? ' on' : '') + '" style="left:' + x.toFixed(1) + '%;top:' + y.toFixed(1) + '%">' + name + '</span>';
    });
    return s + '</div>';
  }
  function birthInfoHtml(m) {
    const z = zurkhaiOf(m);
    let h = '';
    if (!z) {
      h += '<div class="zcard"><div class="zh">🌙 Монгол зурхай</div>' +
        '<div class="zlock">Төрсөн огноо бүртгэгдээгүй тул зурхай тооцогдохгүй байна — огноогоо нэмээд дахин харна уу.</div></div>';
    } else {
      // ── Жил
      h += '<div class="zcard">' +
        '<div class="zh">Билгийн жил</div>' +
        '<div class="zrow">' +
          '<div class="zring"><span>' + z.icon + '</span></div>' +
          '<div class="zbody">' +
            '<h3>' + escapeHtml(cap1(z.colorAdj) + ' ' + z.animalAdj + ' жил') + '</h3>' +
            '<p class="zmuted">Цагаан сараас өмнө төрсөн бол ' + escapeHtml(z.prevColorAdj + ' ' + z.prevAnimalAdj + ' жил') + '</p>' +
            '<p class="zline">' + z.ly + ' оны билгийн жил · билгийн нас ' + z.lunarAge + '</p>' +
            '<p class="zline"><b>Мэнгэ: ' + escapeHtml(z.mengge + ' ' + z.menggeName) + '</b></p>' +
          '</div>' +
        '</div>' +
        '<div class="zfoot">Одоогийн билгийн жил: ' + escapeHtml(z.nowColorAdj + ' ' + z.nowAnimalAdj + ' жил') + ' (' + z.nowY + ')</div>' +
      '</div>';
      // ── Суудал
      const sexWord = m.sex === 'f' ? 'эмэгтэй' : 'эрэгтэй';
      h += '<div class="zcard">' +
        '<div class="zh">Суудал</div>' +
        '<div class="zrow zrow-seat">' + seatWheelHtml(z) +
          '<div class="zbody">' +
            '<h3>' + escapeHtml(z.seat) + '</h3>' +
            '<p class="zsmall">' + z.nowY + ' оны билгийн жилд ' + z.lunarAge + ' настай. ' + cap1(sexWord) + ' хүн 1 настайдаа ' + z.seatStartWord + ' эхлэн ' + z.seatDirWord + ' тоолно.</p>' +
            '<p class="zsmall">Төрсөн өдөр Цагаан сартай давхцвал <span class="zstrong">' + escapeHtml(z.nextSeat) + '</span> суудалд тооцогдоно.</p>' +
            '<p class="zsmall znext">Ирэх Цагаан сар (' + (z.nowY + 1) + '.' + z.nextTsagaan + ')-аас хойш: <b class="znextb">' + escapeHtml(z.nextSeat) + '</b></p>' +
          '</div>' +
        '</div>' +
      '</div>';
    }
    // ── Төрсөн тухай (модны бодит өгөгдлөөс)
    const pars = [...(parOf.get(m.id) || [])].map(x => byId.get(x)).filter(Boolean);
    const dad = pars.find(p => p.sex === 'm') || null;
    const mom = pars.find(p => p.sex === 'f') || null;
    const sibSet = new Set();
    for (const p of parOf.get(m.id) || []) for (const k of kidsOf.get(p) || []) sibSet.add(k);
    const yr = x => Number(String((x.birth_date || '')).slice(0, 4) || x.birth_year || 0) || 0;
    const sibs = [...sibSet].map(x => byId.get(x)).filter(Boolean)
      .sort((a, b) => (yr(a) || 9999) - (yr(b) || 9999) || a.id - b.id);
    const pos = sibs.findIndex(x => x.id === m.id) + 1;
    const kind = m.sex === 'f' ? 'охин' : 'хүү';
    const dadGen = patronymicOf(m.id);
    let who = '';
    if (sibs.length > 1 && pos > 0) who = pos + '-р ' + kind + ' (нийт ' + sibs.length + ' хүүхдийн ' + pos + '-р нь)';
    else who = 'ганц ' + kind;
    if (dadGen) who += ' · ' + dadGen + ' ' + kind;
    const at = p => (p && yr(p) && yr(m)) ? yr(m) - yr(p) : null;
    const da = at(dad), ma = at(mom);
    let born = '';
    if (da != null || ma != null) {
      born = (da != null ? 'эцэг нь ~' + da : 'эцэг нь —') + ', ' + (ma != null ? 'эх нь ~' + ma + ' настай' : 'эх нь —');
    }
    h += '<div class="zcard"><div class="zh">Төрсөн тухай</div>' +
      '<div class="zkvu"><div class="zkvl">Төрсөн эрэмбэ</div><div class="zkvv">' + escapeHtml(who) + '</div></div>' +
      (born ? '<div class="zkvu zdiv"><div class="zkvl">Төрөх үеийн эцэг эхийн нас</div><div class="zkvv">' + escapeHtml(born) + '</div></div>' : '') +
      '</div>';
    return h;
  }

  // ---------- дэлгэрэнгүй самбар ----------
  async function openDetail(id) {
    const panel = $('panel');
    const local = byId.get(id);
    if (!local) return;
    // Панель ШУУД нээгдэнэ (хаалттай байсан ч) — өгөгдөл ирэхэд агуулга нь
    // дүүрнэ. Ингэснээр карт дарахад «юу ч болоогүй» мэт харагдахгүй.
    panel.classList.remove('hidden');
    if (RO) {
      panel.classList.remove('hidden');
      panel.innerHTML = '<h2>' + (local.photo
        ? avaImgHtml(local, local.photo, 34)
        : '<span class="ava" style="background:#9aa7b5">' + (local.emoji ? escapeHtml(local.emoji) : escapeHtml(String(local.name || '?').charAt(0))) + '</span>') + ' ' +
        escapeHtml(local.name) + '<button class="ghost close" onclick="document.getElementById(\'panel\').classList.add(\'hidden\')">✕</button></h2>' +
        '<div class="kv"><b>Төрсөн:</b> ' + escapeHtml(yearOf(local)) + '</div>' +
        '<div class="locked">Нийтийн холбоо: намтар, утас, цомог хаагдсан байна.</div>';
      return;
    }
    // ПРОФАЙЛ НЭГ Л УДАА, БҮТНЭЭР зурагдана — эхлээд хагас мэдээлэл (нэр, хүйс…)
    // гаргаад дараа нь зураг/товч/хамаатны насаар нөхөж сольдог хоёр үе шат
    // БҮРМӨСӨН хасагдав.
    //  ① Кэш байвал — өмнө нээсэн БҮРЭН HTML (зураг, үйл явдал, Эцэг/Эх, Хань,
    //     Хүүхдийн нас ба ✕ товч, Засах/Устгах, Билгийн жил бүгд хамт) шууд.
    //  ② Кэшгүй бол серверийн бүрэн өгөгдлийг хүлээж, дараа нь нэг удаа зурна.
    const cachedHtml = detailHtmlCache.get(id);
    const scrollKeep = panel.scrollTop;
    if (cachedHtml) { panel.innerHTML = cachedHtml; panel.scrollTop = scrollKeep; }
    else panel.innerHTML = '';
    let d = null;
    const pre = detailFetch.get(id);
    if (pre) detailFetch.delete(id);
    try { d = pre ? await pre : await getJson('/api/members/' + id); }
    catch (e) { toast(e.message); return; }
    const m = d.member;
    const rel = d.relations;
    // «Таны харилцаа» — нэвтэрсэн хэрэглэгчтэй харьцуулсан нэр;
    // харин доорх Эцэг/Эх, Ах/Дүү, Хань, Хүүхэд гэсэн жагсаалт нь
    // ТУХАЙН ХҮНЭЭС эхлэн тооцсон хамаатны нэрээр бичигдэнэ.
    const myRel = viewerLabels();
    const selfRel = myRel ? myRel.get(id) : null;
    const kinRel = labelsFrom(id) || vRel;
    const pat = patronymicOf(id);
    // Устгах үйлдэл зөвхөн админ/супер админд (буруу дараад бүгдийг устгахаас сэргийлнэ)
    const isBoss = !!(S.viewer && (S.viewer.role === 'admin' || S.viewer.role === 'super'));
    // kind (parent/spouse/child) өгвөл буруу холбоосыг устгах «✕» товч гарна
    // Чип ба түүнийг устгах «✕» нь НЭГ inline-flex блок (rel-unit) дотор —
    // ингэснээр ✕ нь чипээсээ салж, доош ганцаараа шилжихгүй.
    const relList = (arr, kind) => arr.length
      ? arr.map(x => {
        const chip = '<span onclick="window.__goto(' + x.id + ')">' + escapeHtml(x.name) +
          (kinRel && kinRel.get(x.id) && kinRel.get(x.id) !== 'Хамаатан' && kinRel.get(x.id) !== 'Энэ хүн'
            ? ' <b style="color:#2fae6a">(' + escapeHtml(kinRel.get(x.id)) + ')</b>' : '') +
          ' <i style="opacity:.6">' + escapeHtml(String(x.birth_date ? x.birth_date.slice(0, 4) : (x.birth_year || ''))) + '</i></span>';
        const delBtn = (kind && isBoss)
          ? '<button class="ghost" title="Буруу холбоосыг устгах" style="padding:0 4px;margin:0;font-size:11px" ' +
            'onclick="event.stopPropagation();window.__unlink(\'' + kind + '\',' + m.id + ',' + x.id + ')">✕</button>'
          : '';
        return '<div class="rel-unit">' + chip + delBtn + '</div>';
      }).join('')
      : '<span style="opacity:.5;border-style:dashed">байхгүй</span>';
    const avUrl = m.photo || avatarUrl(m);
    let h = '<h2>' + (avUrl
      ? avaImgHtml(m, avUrl, 34)
      : '<span class="ava" style="background:' + (m.sex === 'f' ? '#d06a9a' : m.sex === 'm' ? '#4a90d9' : '#9aa7b5') + '">' +
        (m.emoji ? escapeHtml(m.emoji) : escapeHtml(String(m.name || '?').charAt(0))) + '</span>') + ' ' +
      (pat ? '<span class="pat">' + escapeHtml(pat) + '</span> ' : '') + escapeHtml(m.name) +
      '<button class="ghost close" onclick="document.getElementById(\'panel\').classList.add(\'hidden\')">✕</button></h2>';
    h += '<div class="kv"><b>Хүйс:</b> ' + (m.sex === 'm' ? 'Эрэгтэй' : m.sex === 'f' ? 'Эмэгтэй' : '?') + '</div>';
    if (selfRel) h += '<div class="kv"><b>Таны харилцаа:</b> <span class="rpill" style="display:inline-block;margin:0;vertical-align:middle">' + escapeHtml(selfRel) + '</span></div>';
    h += '<div class="kv"><b>Төрсөн:</b> ' + escapeHtml(m.birth_date || m.birth_year || '—') +
      (m.alive === 0 ? ' <span style="color:var(--danger)">( нас барсан)</span>' : '') + '</div>';
    if (m.death_date) h += '<div class="kv"><b>Нас барсан:</b> ' + escapeHtml(m.death_date) + '</div>';
    if (d.has_bio) {
      if (m.clan) h += '<div class="kv"><b>Ургийн овог:</b> ' + escapeHtml(m.clan) + '</div>';
      if (m.birth_place) h += '<div class="kv"><b>Төрсөн газар:</b> ' + escapeHtml(m.birth_place) + '</div>';
      if (m.phone) h += '<div class="kv"><b>Утас:</b> ' + escapeHtml(m.phone) + '</div>';
      if (m.honors) h += '<div class="kv"><b>Гавьяа:</b> ' + escapeHtml(m.honors) + '</div>';
      if (m.bio) h += '<div class="kv"><b>Намтар:</b><br>' + escapeHtml(m.bio).replace(/\n/g, '<br>') + '</div>';
    } else {
      h += '<div class="locked">🔒 Намтар, утас, цомог зөвхөн <b>ойрын хамааралд</b> харагдана. Та зөвхөн карт, нэр, төрсөн оноог харж байна.</div>';
    }
    if (d.has_bio) {
      const xph = d.photos || [];
      const xev = d.events || [];
      // Зургийн хэсэг — хоосон ч харагдана; засах эрхтэй бол «＋» тавьж нэмнэ
      h += '<div class="rel-h">Нэмэлт зураг (' + xph.length + '/5)</div><div class="rel-p">' +
        xph.map(p => '<span onclick="window.__photoView(' + m.id + ',' + p.id + ')" style="cursor:zoom-in;padding:0;line-height:0;border:0"><img src="' +
          escapeHtml(p.url) + '" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:8px;display:block"></span>').join('') +
        (m.e && xph.length < 5
          ? '<span onclick="window.__addMemPhoto(' + m.id + ')" title="Зураг нэмэх" style="display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;box-sizing:border-box;border:2px dashed #b9c6d3;border-radius:8px;color:#7e93a6;font-size:22px;font-weight:700;cursor:pointer;line-height:1;background:#fff">＋</span>'
          : '') +
        (xph.length ? '' : '<span style="align-self:center;font-size:12px;opacity:.55;margin-left:6px">Зураг байхгүй — «＋» дарж нэмнэ</span>') +
        '</div>';
      if (xev.length) {
        h += '<div class="rel-h">📅 Огноотой үйл явдал (' + xev.length + '/4)</div>' +
          xev.map(ev => '<div class="kv">📌 <b>' + escapeHtml(ev.event_date) + '</b> ' + escapeHtml(ev.title) +
            (ev.photo
              ? '<div style="margin-top:6px"><img src="' + escapeHtml(ev.photo) + '" alt="" onclick="window.__evView(this.src)" ' +
                'style="width:96px;height:96px;object-fit:cover;border-radius:10px;display:block;cursor:zoom-in"></div>'
              : '') + '</div>').join('');
      }
    }
    h += '<div class="rel-h">Эцэг / Эх</div><div class="rel-p">' + relList(rel.parents, 'parent') + '</div>';
    h += '<div class="rel-h">Ах / Дүү</div><div class="rel-p">' + relList(rel.siblings, 'sibling') + '</div>';
    h += '<div class="rel-h">Хань</div><div class="rel-p">' + relList(rel.spouses, 'spouse') + '</div>';
    h += '<div class="rel-h">Хүүхэд</div><div class="rel-p">' + relList(rel.children, 'child') + '</div>';
    // Үйлдлийн товчнууд: «Садан нэмэх» бүтэн өргөнөөр дээр, бусад 4 нь 2x2
    // тороор доор. «Фокус» товч хасагдсан (карт дээр давхар дарахад фокус орно).
    const ICO = {
      plus: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
      pencil: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
      image: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="m21 15-4.6-4.6L7 20"/></svg>',
      cal: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/></svg>',
      trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
      camera: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.2h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.4"/></svg>',
      crop: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>'
    };
    h += '<div class="pbtns">';
    if (m.e) h += '<button class="pfull" onclick="window.__menu(event,' + m.id + ')">' + ICO.plus + 'Садан нэмэх</button>';
    if (m.e) h += '<button class="psoft" onclick="window.__edit(' + m.id + ')">' + ICO.pencil + 'Засах</button>';
    if (m.e) h += '<button class="psoft" onclick="window.__coverPick(' + m.id + ')">' + ICO.camera + 'Нүүр зураг</button>';
    if (m.e) h += '<button class="psoft" onclick="window.__coverAdjust(' + m.id + ')">' + ICO.crop + 'Зураг тааруулах</button>';
    if (m.e) h += '<button class="psoft" onclick="window.__addMemPhoto(' + m.id + ')">' + ICO.image + 'Зураг</button>';
    if (m.e) h += '<button class="psoft" onclick="window.__addMemEvent(' + m.id + ')">' + ICO.cal + 'Үйл явдал</button>';
    if (m.e && isBoss) h += '<button class="pdanger" onclick="window.__del(' + m.id + ')">' + ICO.trash + 'Устгах</button>';
    h += '</div>';
    h += birthInfoHtml(m);
    panel.classList.remove('hidden');
    // Арын дэвсгэрт ирсэн шинэ мэдээллээр сольж, ДАРААГИЙН удаад кэшээс шууд
    // харуулахын тулд хадгална. Хэрэглэгч гүйлгэсэн бол байрлалыг хадгална.
    const at = panel.scrollTop;
    panel.innerHTML = h;
    panel.scrollTop = at || (cachedHtml ? scrollKeep : 0);
    detailHtmlCache.set(id, h);
  }
  window.__detail = openDetail;
  window.__goto = (id) => { selected = id; render(); openDetail(id); centerOn(id); };
  // Нэвтэрсэн хэрэглэгчийн картыг defaultSelected/active болгоно:
  // viewer.member_id === card Node ID таарвал `selected` тавигдаж, .sel класс
  // (улбар шар хүрээ + хамаатны шар шугам) гарч, дэлгэцийн голд фокуслана.
  function focusOnSelf() {
    const me = (S.viewer && S.viewer.member_id) || null;
    if (me == null) return;
    const ns = activeLayout().nodes || [];
    const n = ns.find(x => x.id === me);
    if (!n) return;
    selected = me;                       // defaultSelected / active state
    render();                            // .sel класс + шар шугам зурагдана
    centerOn(me);                        // дэлгэцийн ГОЛД (хэвтээ + босоо тэнхлэг)
  }

  function centerOn(id) {
    const n = (activeLayout().nodes || []).find(x => x.id === id) || nodes.get(id);
    if (!n) return;
    const vp = $('viewport');
    view.x = vp.clientWidth / 2 - (n.x + (n.w || 156) / 2) * view.z;
    view.y = vp.clientHeight / 2 - (n.y + 40) * view.z;
    applyView();
  }

  // ЗӨӨЛӨН ПАН/ЗУМ: модыг дахин зурахгүй — зөвхөн камерыг (transform)
  // гулсуулж, тухайн хүнийг дэлгэцийн голд авчирна. Хэт жижиг зумтай бол
  // уншигдахуйц хэмжээ хүртэл бага зэрэг ойртуулна.
  let glideT = 0;
  function panTo(id) {
    const n = (activeLayout().nodes || []).find(x => x.id === id) || nodes.get(id);
    const vp = $('viewport');
    if (!n || !vp) return;
    const w = $('world');
    const vw = vp.clientWidth, vh = vp.clientHeight;
    // Профайл самбар нь viewport-ийг ӨӨРӨӨ нарийсгадаг (flex) — тэгвэл дахин
    // хасахгүй. Зөвхөн viewport дээрээ ДАВХАРЛАСАН (overlay) үед л хасаж,
    // картыг харагдах хэсгийн голд тавина.
    const pe = $('panel');
    let panelW = 0;
    if (pe && !pe.classList.contains('hidden') && pe.offsetParent !== null) {
      const pr = pe.getBoundingClientRect(), vr = vp.getBoundingClientRect();
      const overlays = pr.left < vr.left + vr.width - 4 && pr.width > 40;
      if (overlays) panelW = Math.min(vw * 0.6, pr.width);
    }
    const availW = Math.max(240, vw - panelW);
    const zRead = Math.max(0.62, Math.min(1.05, availW / 430));
    const z = Math.max(view.z, zRead);
    if (w) {
      w.classList.add('glide');
      clearTimeout(glideT);
      glideT = setTimeout(() => w.classList.remove('glide'), 620);
    }
    view.z = z;
    view.x = availW / 2 - (n.x + (n.w || 156) / 2) * z;
    view.y = vh / 2 - (n.y + 40) * z;
    applyView();
  }
  window.__panTo = panTo;

  // Дарсан хүн дээрээ УНШИГДАХУЙЦ зумтай төвлөрнө. Өмнө нь `fit()` бүх мод
  // (5000px) дэлгэцэнд багтааж жижигрүүлдэг байсан тул утсан дээр «өөрийн
  // хүмүүс рүү очихгүй», хамаагүй холын хүмүүс л харагддаг байв.
  function zoomOn(id) {
    const vp = $('viewport'); const vw = vp ? vp.clientWidth : 360;
    view.z = Math.max(0.62, Math.min(1.1, vw / 430));
    applyView();
    centerOn(id);
    requestAnimationFrame(() => centerOn(id));
  }

  // Дарсан хүнийг ХАНЬ, ШУУД ХҮҮХДҮҮДТЭЙ нь хамт багтаана — хүүхдүүд
  // дэлгэцээс доош гарч алга болохгүй, картын хэмжээ хэт томрохгүй.
  function zoomFamily(id) {
    const vp = $('viewport');
    const ns = (activeLayout().nodes || []);
    const n = ns.find(x => x.id === id);
    if (!vp || !n) { fit(); return; }
    const ids = new Set([id]);
    for (const s of spOf.get(id) || []) ids.add(s);
    for (const k of kidsOf.get(id) || []) ids.add(k);
    const box = ns.filter(x => ids.has(x.id));
    const x1 = Math.min(...box.map(x => x.x));
    const x2 = Math.max(...box.map(x => x.x + (x.w || 156)));
    const y1 = Math.min(...box.map(x => x.y));
    const y2 = Math.max(...box.map(x => x.y + 118));
    const w = Math.max(200, x2 - x1), h = Math.max(160, y2 - y1);
    const z = Math.max(0.3, Math.min(1.1,
      Math.min((vp.clientWidth - 40) / w, (vp.clientHeight - 90) / h)));
    if (!isFinite(z) || !isFinite(x1) || !isFinite(y1)) { fit(); return; }
    view.z = z;
    view.x = vp.clientWidth / 2 - ((x1 + x2) / 2) * z;
    view.y = vp.clientHeight / 2 - ((y1 + y2) / 2) * z;
    applyView();
  }

  // ---------- фокус-горим ----------
  window.__setFocus = (id, opts) => {
    if (id != null && !nodes.has(id)) {
      id = (S.viewer && S.viewer.member_id) || null;
      toast('Хүрээнд байхгүй хүн — өөрийн карт руу буцлаа');
    }
    focus = id;
    revealed = new Set();
    openMid = 0;
    showHidden = false;
    focusL = null;
    focusSeq++;
    // фокус орсон бол хажуугийн жигүүр (ах/дүү + авга/нагац) НЭГДМЭЭР хумигдана
    collapsed = id != null ? sideHeads(id) : new Set();
    selected = id;
    render();
    if (id != null) {
      centerOn(id);
      if (!(opts && opts.silent)) openDetail(id);
      requestAnimationFrame(() => centerOn(id));
      loadFocusLayout(id);
    } else $('panel').classList.add('hidden');
  };
  // Фокусын НЯГТ байрлалыг серверээс авна (зөвхөн фокусын хүмүүс + шууд нуугдсан хамаатан)
  // Тухайн гишүүний дэлгэцэн дээрх байрлал (зум, пан хамт) — байрлал хадгалахад
  function screenPosOf(id) {
    const n = (activeLayout().nodes || []).find(x => x.id === id) || nodes.get(id);
    if (!n) return null;
    return {
      sx: view.x + (n.x + (n.w || 156) / 2) * view.z,
      sy: view.y + (n.y + 40) * view.z
    };
  }
  async function loadFocusLayout(id, opts) {
    const seq = ++focusSeq;
    // Байрлал шинэчлэгдэхэд «Би» карт дэлгэцэн дээрээ хөдлөхгүй байхын тулд
    // өмнөх дэлгэцэн дээрх байрлалыг тогтоож авна.
    const anchorId = (S.viewer && S.viewer.member_id) || id;
    const before = (opts && opts.keepView) ? screenPosOf(anchorId) : null;
    try {
      const op = [...revealed].join(',');
      const cl = [...closedFams].join(',');
      const meId = (S.viewer && S.viewer.member_id) || null;
      const ns = '&self=0';   // тухайн хүн + гэр бүл бүтнээр (шалгасан: 18 карт)
      const url = '/api/focus-layout?id=' + id + ns + (op ? '&open=' + op : '') +
        (cl ? '&closed=' + cl : '') + (openMid ? '&mid=' + openMid : '');
      // Кэшэнд байвал сүлжээг хүлээхгүй — картууд тэр даруй гарна
      const L = layoutCache.get(url) || await getJson(url);
      if (L) layoutCache.set(url, L);
      if (seq !== focusSeq || focus !== id || !L || !(L.nodes || []).length) return;
      focusL = L;
      render();
      // opts.keepView — хэрэглэгчийн харах өнцөг, зум хэвээр үлдэнэ
      // (зөвхөн дарсан хүнээ төвд барьж, бусдын гэр бүл «алга болохгүй»)
      if (opts && opts.keepView) {
        // ① Байрлал өөрчлөгдсөн ч «Би» карт дэлгэцэн дээрээ байрандаа үлдэнэ
        const after = screenPosOf(anchorId);
        if (before && after) {
          view.x += before.sx - after.sx;
          view.y += before.sy - after.sy;
          applyView();
        }
        // ② Гэсэн ч дэлгэцнээс гарсан бол «Би» карт руугаа төвлөрүүлнэ
        const vp = $('viewport');
        const now = screenPosOf(anchorId);
        if (now && vp && (now.sx < 70 || now.sy < 70 ||
            now.sx > vp.clientWidth - 70 || now.sy > vp.clientHeight - 70)) {
          centerOn(anchorId);
        }
        applyView();
      } else {
        fitFocus(id);
      }
    } catch (e) { /* бүтэн модны байрлалаар үлдэнэ */ }
  }
  // Фокусын байрлалыг дэлгэцэнд багтааж, уншигдахуйц зумтай болгоод төвлөрүүлнө
  function fitFocus(id) {
    const L = activeLayout();
    const vw = $('viewport').clientWidth, vh = $('viewport').clientHeight;
    const w = L.width || 900, h = L.height || 600;
    let z = Math.min((vw - 80) / w, (vh - 90) / h);
    z = Math.max(0.55, Math.min(1, z));
    view.z = z;
    applyView();
    centerOn(id);
  }
  // «БҮТЭН МОД» — үеийн хатуу мөрийг серверээс татна (`open` = нээлттэй салбар)
  async function loadFullLayout(opts) {
    const me = (S.viewer && S.viewer.member_id) || null;
    if (!me) { fullL = null; render(); return; }
    const seq = ++fullSeq;
    try {
      const url = '/api/full-layout?id=' + me +
        (fullOpen ? '&open=' + fullOpen + (fullClosed ? '&closed=1' : '') : '') +
        '&_=' + Date.now();
      // Өмнө нээсэн хүн рүү буцах / дахин дарахад серверийг хүлээхгүй.
      const cacheKey = me + '|' + (fullOpen || 0) + '|' + (fullClosed ? 1 : 0);
      let L = (!(opts && opts.refresh) && layoutCache.get(cacheKey)) || null;
      if (!L) {
        L = await getJson(url);
        if (L && (L.nodes || []).length) {
          layoutCache.set(cacheKey, L);
          if (layoutCache.size > 24) layoutCache.delete(layoutCache.keys().next().value);
        }
      }
      if (seq !== fullSeq || !L || !(L.nodes || []).length) return;
      fullL = L;
      fullOpen = L.open || null;
      if (!fullOpen) fullClosed = false;
      render();
      if (!(opts && opts.keepView)) {
        fitted = true;
        fit();
        // АНХ ОРЖ ИРЭХЭД: логин хийсэн хүн өөрийн карт дээрээ төвлөрнө
        // (өмнө нь fit() үүнийг дарж, бүх мод харагдаж байсан)
        const me0 = (S.viewer && S.viewer.member_id) || null;
        if (!startCentered && me0 && !RO && (L.nodes || []).some(n => n.id === me0)) {
          startCentered = true;
          // Автоматаар СОНГОГДОХГҮЙ — Дөлгөөн «дарсан» төлөвтөй (улбар шар
          // хүрээ, шар шугам) харагдахгүй. Зөвхөн түүний карт дээр төвлөрнө.
          // Модыг дэлгэцэнд бүтнээр тааруулж (хоосон зайгүй), дараа нь
          // нэвтэрсэн хэрэглэгчийн картыг СОНГОЖ дэлгэцийн голд тавина.
          fit();
          focusOnSelf();
          // Дэлгэрэнгүй самбар автоматаар НЭЭГДЭХГҮЙ — зөвхөн өөрийн карт дээр
          // ирж тодрох ба картын дэлгэрэнгүйг ногоон «i» товчоор нээнэ.
        }
      }
      return fullL;
      if (!opts || !opts.keepView) fit();   // ачаалагдсаны дараа дэлгэцэнд багтаана
    } catch (e) { /* хуучин байрлалаар үлдэнэ */ }
  }
  // Аккордеон: зөвхөн НЭГ салбар нээлттэй. Идэвхтэй карт дээр дарахад хаагдахгүй.
  window.__lockLayout = async (on) => {
    const me = (S.viewer && S.viewer.member_id) || null;
    if (!me) return;
    try {
      await post('/api/layout-lock', { lock: !!on, viewer: me, open: fullOpen || 0 });
      toast(on ? 'Байрлал тогтоогдлоо ✓' : 'Байрлал тайлагдлаа ✓');
      fullL = null; fullSeq++;
      await loadFullLayout({ keepView: true });
    } catch (e) { toast(e.message); }
  };
  // Сонгосон ах/дүүг мөрийнхөө ХАМГИЙН БАРУУН ЗАХАД зөөнө (байрлалын слот
  // солилцоно). Ингэснээр дарсан хүн ах/дүү нарынхаа хамгийн ард гарч,
  // ирээдүйд үр удам нэмэгдэхэд баруун тийш салбарлаx зай гарна.
  function moveSiblingLast(id) {
    if (!fullL || !fullL.nodes) return;
    const n = fullL.nodes.find(x => x.id === id);
    if (!n) return;
    const pars = [...(parOf.get(id) || [])];
    if (!pars.length) return;
    const sibs = new Set();
    for (const p of pars) for (const k of kidsOf.get(p) || []) if (k !== id) sibs.add(k);
    const row = [...sibs].map(k => fullL.nodes.find(x => x.id === k))
      .filter(x => x && Math.abs(x.y - n.y) < 4);
    if (!row.length) return;
    const last = row.sort((a, b) => a.x - b.x)[row.length - 1];
    if (!last || last.x <= n.x) return;
    // Хань/хүүхэд нь хамт харагдаж байгаа бол дан картыг зөөхгүй — шугам тасрахгүй.
    const visible = (k) => fullL.nodes.some(x => x.id === k);
    const hasSpouse = (k) => [...(spOf.get(k) || [])].some(visible);
    if (hasSpouse(id) || hasSpouse(last.id)) return;
    const hasKids = (k) => [...(kidsOf.get(k) || [])].some(visible);
    if (hasKids(id) || hasKids(last.id)) return;
    const tx = n.x;
    n.x = last.x; last.x = tx;
    const a = nodes.get(id), b = nodes.get(last.id);
    if (a && a !== n) a.x = n.x;
    if (b && b !== last) b.x = last.x;
  }
  // Дарсан карт нь одоо нээлттэй байгаа хүний (эсвэл түүний хань/үр удам)
  // хэсэгт байвал салбарыг дахин ачаалахгүй — зөвхөн тэр карт руу төвлөрнө.
  // Ингэснээр «Сайнбаяр»/«Баяраа» дээр дарахад харагдац баруун тийш зөөгдөнө.
  function inOpenBranch(id) {
    const open = fullL && fullL.open;
    if (open == null) return false;
    if (id === open) return true;
    if ((spOf.get(open) || new Set()).has(id)) return true;
    const seen = new Set(), q = [...(kidsOf.get(open) || [])];
    while (q.length) {
      const x = q.shift();
      if (seen.has(x)) continue;
      seen.add(x);
      if (x === id) return true;
      if ((spOf.get(x) || new Set()).has(id)) return true;
      for (const k of kidsOf.get(x) || []) q.push(k);
    }
    return false;
  }
  // Карт дээр дарах = ГЭР БҮЛ СЭЛГЭХ (аккордеон): зөвхөн дарсан хүний
  // хүүхдүүд нээгдэж, өмнөх гэр бүлийн хүүхдүүд хураагдана. Энэ нь
  // хэрэглэгчийн хүлээж буй, өмнө ажиллаж байсан зан төлөв.
  window.__accordion = async (id) => {
    if (id == null || !nodes.has(id)) return;
    selected = id;
    const wasFocus = focus != null;
    if (wasFocus) {
      focus = null; focusL = null; focusSeq++;
      revealed = new Set(); collapsed = new Set(); closedFams = new Set();
      openMid = 0; showHidden = false;
      fullL = null; fullSeq++;
    }
    if (!wasFocus && fullL && fullL.open === id) {
      await window.__fullOpen(id);
      render();
      return;
    }
    fullOpen = id; fullClosed = false;
    if (!(S.viewer && S.viewer.member_id)) { render(); return; }
    await loadFullLayout({ keepView: true });
    render();
    zoomFamily(id);
  };
  window.__fullOpen = async (id) => {
    if (!fullL || id == null) return;
    // «Би» карт дээр дарахад — АНХДАГЧ харагдац руу буцна (өвөө/эмээ нуугдмал,
    // хоёр талын эцэг/эх харагдана). Ингэснээр нөгөө тал руу буцах зам бий.
    // «Би» дээр дарахад ч мөн өөрийн гэр бүлийн харагдац нээгдэнэ (бүтэн мод
    // руу буцах нь «← Бүтэн мод» товчоор).
    if ((fullL.openable || []).indexOf(id) < 0) {
      // Салбар нээгдэхгүй карт (жишээ нь «Би») дээр дарахад ч тухайн карт
      // руу төвлөрнө — аав/ээж дээр дарахад шиг л харагдац зөөгдөнө.
      zoomOn(id);
      return;
    }
    if (fullL.open === id) {
      // Дахин дарахад ХУРААХГҮЙ — хүүхдүүд нь үргэлж нээлттэй харагдана.
      fullClosed = false;
      await loadFullLayout({ keepView: true });
      zoomFamily(id);
      return;
    }
    const before = new Set(((fullL && fullL.nodes) || []).map(n => n.id));
    fullOpen = id;
    fullClosed = false;
    await loadFullLayout({ keepView: true });
    // Шинээр нэмэгдсэн хүмүүс мөрийн БАРУУН зах дээр гардаг тул дэлгэцнээс
    // гадуур үлддэг байв. Тиймээс нэмэгдсэн карт руу төвлөрч, тоог нь хэлнэ.
    // Нэмэгдсэн карт байхгүй байсан ч (гэр бүл нь анхдагч модонд аль хэдийн
    // бүтэн байгаа — Намжилын тал) харагдацыг БУЦААХГҮЙ: дарсан хүний
    // ах/дүү + хань + шууд хүүхэд л үлдэнэ.
    const added = ((fullL && fullL.nodes) || []).map(n => n.id).filter(x => !before.has(x));
    // Бүх мод багтаахын оронд дарсан хүн дээрээ төвлөрнө — түүний хань,
    // хүүхэд дэлгэцийн голд уншигдахуйц хэмжээтэй гарна.
    zoomFamily(id);
    if (added.length) toast('👥 ' + added.length + ' хүн нэмэгдлээ');
  };
  // Бүтэн мод руу буцах: нээсэн салбарыг хааж, бүх гишүүнийг харуулна
  window.__fullReset = async () => {
    fullOpen = null;
    fullClosed = false;
    await loadFullLayout({ keepView: true });
    fit();
  };
  window.__exitFocus = () => {
    focus = null; collapsed = new Set(); revealed = new Set(); closedFams = new Set(); openMid = 0; showHidden = false;
    focusL = null; focusSeq++;
    // Энгийн гишүүн бүтэн мод руу биш, ӨӨРИЙН салбар руу буцна
    const meId = (S.viewer && S.viewer.member_id) || null;
    const isBoss = S.viewer && (S.viewer.role === 'admin' || S.viewer.role === 'super');
    fullL = null; fullOpen = (!isBoss && meId) ? meId : null; fullClosed = false; fullSeq++;
    render();
    fit();
    loadFullLayout();
  };
  window.__revealHidden = () => { showHidden = true; render(); };
  window.__hideHidden = () => { showHidden = false; revealed = new Set(); closedFams = new Set(); openMid = 0; render(); };
  // Картын `👥 +N` тэмдэг дээр дарвал зөвхөн тэдгээр хүмүүсийг нээнэ
  window.__revealGroup = (...ids) => {
    // ГЭР БҮЛ СЭЛГЭХ: зөвхөн өмнө нээсэн гэр бүл хаагдана («Би»-ийн гэр бүл хэвээр)
    const heads = new Set(revealedHeadIds());
    for (const id of ids) for (const p of parOf.get(id) || []) heads.delete(p);
    closedFams = heads;
    openMid = 0;
    revealed = new Set(ids.filter(Boolean));
    render();
    // нээгдсэн хүмүүс бүтэн карт болж, зай нь дахин тооцоологдоно
    if (focus != null) loadFocusLayout(focus, { keepView: true });
  };
  window.__coll = (id) => {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
    render();
  };

  // ---------- «Садан нэмэх» сонголт (1-р зураг) ----------
  let relPick = null;
  window.__menu = (ev, id) => {
    selected = id;
    const m = byId.get(id);
    if (!m || RO) return;
    relPick = null;
    const OPTS = [
      { k: 'father', sec: 'up',   emo: '👨', t: 'Эцэг нэмэх', s: 'Энэ хүний эцэг' },
      { k: 'mother', sec: 'up',   emo: '👩', t: 'Эх нэмэх', s: 'Энэ хүний эх' },
      { k: 'spouse', sec: 'side', emo: '💍', t: 'Эхнэр / нөхөр нэмэх', s: 'Хосын холбоо' },
      { k: 'child',  sec: 'down', emo: '🍼', t: 'Хүүхэд нэмэх', s: 'Хүү, охин — хамтран хүүхэдтэй болгоно' },
      { k: 'new',    sec: 'down', emo: '➕', t: 'Шинэ гишүүн нэмэх', s: 'Холбоогүй шинэ карт' }
    ];
    const sec = (ico, title) => '<div class="rel-sec"><span class="rel-ico">' + ico + '</span>' + title + '</div>';
    const opt = o => '<div class="rel-opt" data-k="' + o.k + '" onclick="window.__relPick(\'' + o.k + '\')">' +
      '<span class="emo">' + o.emo + '</span><span><b>' + o.t + '</b><small>' + o.s + '</small></span></div>';
    const block = (s, ico, title) => sec(ico, title) + OPTS.filter(o => o.sec === s).map(opt).join('');
    openModal('Садан нэмэх: ' + escapeHtml(m.name),
      block('up', '↑', 'ДЭЭШЭЭ ҮЕ') +
      block('side', '→', 'ХАЖУУ ТИЙШ — ГЭР БҮЛ') +
      block('down', '↓', 'ДООШОО ҮЕ'),
      '<button onclick="window.__closeModal()">Болих</button>' +
      '<button class="btn-amber" id="rel_go" disabled onclick="window.__relGo()">Нэмэх</button>');
  };
  window.__relPick = (k) => {
    relPick = k;
    document.querySelectorAll('.rel-opt').forEach(el => el.classList.toggle('on', el.dataset.k === k));
    const g = $('rel_go'); if (g) g.disabled = false;
  };
  window.__relGo = () => {
    if (!relPick) return;
    const k = relPick;
    window.__closeModal();
    if (k === 'father') window.__parent('father');
    else if (k === 'mother') window.__parent('mother');
    else if (k === 'spouse') window.__spouse();
    else if (k === 'child') window.__child();
    else if (k === 'new') window.__newMember('none');
  };
  // ---------- «⚙️ Админ» — нэг хуудас ----------
  window.__adminPage = () => {
    const role = S.viewer && S.viewer.role;
    if (role !== 'admin' && role !== 'super') return;
    // Lucide дүрснүүд — emoji-гийн оронд, пастел дэвсгэртэй квадрат дотор
    const AD = {
      palette: '<circle cx="13.5" cy="6.5" r=".6"/><circle cx="17.5" cy="10.5" r=".6"/><circle cx="8.5" cy="7.5" r=".6"/><circle cx="6.5" cy="12.5" r=".6"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.12-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.55-2.5 5.55-5.55C21.97 6.01 17.46 2 12 2z"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>',
      link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
      bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
      image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L7 21"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
      table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
      archive: '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
      upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5"/><path d="M12 3v12"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>'
    };
    const ic = (n, sz) => '<svg viewBox="0 0 24 24" width="' + (sz || 18) + '" height="' + (sz || 18) +
      '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + AD[n] + '</svg>';
    const item = (ico, tone, t, sub, fn) =>
      '<button class="ad-card" onclick="window.__adminGo(\'' + fn + '\')">' +
        '<span class="ad-ic ' + tone + '">' + ic(ico) + '</span>' +
        '<span class="ad-t"><b>' + t + '</b><small>' + sub + '</small></span>' +
        '<span class="ad-chev">' + ic('chevron', 16) + '</span></button>';
    let body = '<div class="ad-sec">Удирдлага</div><div class="ad-grid">';
    body += item('palette', 'violet', 'Дизайн', 'Өнгө, картын хэлбэр, нийтийн холбоос', '__design');
    // Бүртгүүлсэн хүсэлт, карт холбох хүсэлтийг АДМИН ч хүлээж авна
    body += item('users', 'blue', 'Эрх ба хүсэлт', 'Бүртгэгдсэн хэрэглэгч, карт холбох хүсэлт', '__users');
    body += item('fileText', 'slate', 'Аудит', 'Хийсэн үйлдлийн түүх', '__audit');
    body += item('link', 'amber', 'Холбоогүй / Давхар', 'Модтой холбогдоогүй гишүүд, давхар нэрс', '__orphans');
    body += item('bell', 'rose', 'Мэдэгдэл', 'Шинэ бүртгэл, хүсэлтийг утсанд мэдэгдэх', '__pushPage');
    body += '</div>';
    if (role === 'super') {
      body += '<div class="ad-sec">Супер админ</div><div class="ad-grid">';
      body += item('image', 'violet', 'Анхдагч дүрс', 'Зураггүй хүмүүст харагдах 8 дүрс', '__avatarsPage');
      // Backup файлууд (JSON / Excel / ZIP) — зөвхөн супер админд
      body += item('download', 'emerald', 'Backup', 'Бүх өгөгдлийг JSON файлаар татах', '__backup');
      body += item('table', 'emerald', 'Excel', 'Бүх гишүүний мэдээллийг Excel-ээр татах', '__excel');
      body += item('archive', 'emerald', 'Бүрэн ZIP', 'Дата + Excel + CSV + D1 схем + БҮХ эх код — нэг файл', '__fullzip');
      body += item('upload', 'blue', 'Импорт', 'Excel / JSON-оос гишүүд оруулах', '__import');
      body += '</div>';
    }
    openModal('Админ', body, '<button onclick="window.__closeModal()">Хаах</button>', 'ad-modal');
  };
  // ---------- 🔗 Модтой холбоогүй гишүүд ----------
  let orphansPollT = 0;
  window.__orphans = async (silent) => {
    try {
      const j = await getJson('/api/admin/orphans?t=' + Date.now());
      const iso = j.isolated || [];
      // Бүх давхар нэрийг харуулна — зөвхөн холбоогүй бичлэгтэйг биш.
      const dup = j.duplicates || [];
      const sim = j.similar || [];
      const all = [
        ...iso.map(m => ({ ...m, linked: false })),
        ...dup.flatMap(g => g.members),
        ...sim.flatMap(g => g.members)
      ];
      const byMemberId = new Map();
      for (const m of all) byMemberId.set(Number(m.id), m);
      window.__orphanData = [...byMemberId.values()];
      const row = (m) => {
        const meta = [
          m.sex === 'f' ? 'эмэгтэй' : m.sex === 'm' ? 'эрэгтэй' : '',
          m.birth_year || m.birth_date || '',
          m.created_at ? 'үүссэн ' + String(m.created_at).slice(0, 16) : ''
        ].filter(Boolean).join(' · ');
        return '<div class="list-row" style="align-items:flex-start">' +
          '<span class="grow"><b>' + escapeHtml(m.name || '(нэргүй)') + '</b> ' +
          '<span style="opacity:.6">#' + m.id + '</span>' +
          '<div style="font-size:11px;opacity:.65">' + escapeHtml(meta) + '</div></span>' +
          '<button onclick="window.__closeModal();window.__goto(' + m.id + ')">Нээх</button>' +
          '<button class="danger" onclick="window.__orphanDel(' + m.id + ')">🗑 Устгах</button></div>';
      };
      const dateOf = (m) => m.birth_date || m.birth_year || '—';
      const groupMember = (m) => '<div class="list-row" style="align-items:flex-start">' +
        '<span class="grow"><b>' + escapeHtml(m.name || '(нэргүй)') + '</b> ' +
        '<span style="opacity:.6">#' + m.id + '</span> ' +
        '<span style="font-size:10px;border:1px solid currentColor;border-radius:8px;padding:0 5px;opacity:.75">' +
        (m.linked ? 'модтой' : 'холбоогүй') + '</span>' +
        '<div style="font-size:11px;opacity:.65">' + escapeHtml(dateOf(m)) +
        (m.created_at ? ' · үүссэн ' + escapeHtml(String(m.created_at).slice(0, 16)) : '') + '</div></span>' +
        '<button onclick="window.__closeModal();window.__goto(' + m.id + ')">Нээх</button>' +
        '<button class="danger" onclick="window.__orphanDel(' + m.id + ')">🗑 Устгах</button></div>';
      let h = '<div class="rel-p">Модтой холбогдоогүй: <b>' + iso.length + '</b> / нийт ' +
        (j.total || 0) + ' гишүүн · давхар нэр: <b>' + dup.length + '</b> · төстэй: <b>' + sim.length + '</b></div>';
      h += '<div class="rel-sec">Давхар нэр (' + dup.length + ')</div>';
      h += dup.length ? dup.map(g => '<div class="rel-p" style="margin-bottom:6px"><b>' +
        escapeHtml(g.name) + '</b> — ' + g.members.length + ' бичлэг' +
        (g.parent ? ' · <span style="font-size:11px;opacity:.7">' + escapeHtml(g.parent) + '</span>' : '') +
        '<div style="font-size:11px;opacity:.7">' +
        (g.year ? 'Ижил нэр, ижил төрсөн он' : 'Ижил нэр') +
        (g.parent && g.parent !== 'эцэг/эх тодорхойгүй' ? ', ижил эцэг/эхтэй' : ' · эцэг/эх тодорхойгүй') +
        '. Аль нь давхар болохыг шалгана уу.</div>' +
        g.members.map(groupMember).join('') + '</div>').join('')
        : '<div style="opacity:.7">Байхгүй.</div>';
      h += '<div class="rel-sec">Ижил нэр + төрсөн он (' + sim.length + ')</div>';
      h += sim.length ? '<div style="font-size:11px;opacity:.7;margin-bottom:6px">Эцгийн нэр/инициал өөр бичигдсэн ч эцэг/эх эсвэл эцгийн нэр ижил байгаа бичлэгүүд.</div>' +
        sim.map(g => '<div class="rel-p" style="margin-bottom:6px"><b>' +
          escapeHtml(g.given) + '</b> · ' + escapeHtml(g.year) + ' — ' + g.members.length + ' бичлэг' +
          (g.reason ? ' · <span style="font-size:11px;opacity:.7">' + escapeHtml(g.reason) + '</span>' : '') +
          (g.parent ? '<div style="font-size:11px;opacity:.7">' + escapeHtml(g.parent) + '</div>' : '') +
          g.members.map(groupMember).join('') + '</div>').join('')
        : '<div style="opacity:.7">Байхгүй.</div>';
      h += '<div class="rel-sec">Холбоогүй гишүүд</div>';
      h += iso.length ? iso.map(row).join('') : '<div style="opacity:.7">Байхгүй.</div>';
      openModal('🔗 Холбоогүй ба давхар гишүүд',
        '<div data-orphans="1" style="max-height:64vh;overflow:auto">' + h +
        '<div style="font-size:11px;opacity:.65;margin-top:8px">5 секунд тутам автоматаар шинэчлэгдэнэ. «Төстэй» нь баталгаа биш — нээж шалгаад л устгана уу.</div></div>',
        '<button onclick="window.__orphans()">↻ Шинэчлэх</button>' +
        '<button onclick="window.__closeModal()">Хаах</button>');
      // Жагсаалт нээлттэй үед автоматаар шинэчилнэ (шинэ гишүүн нэмэгдэхэд ч).
      if (!orphansPollT) {
        orphansPollT = setInterval(() => {
          const mr = document.getElementById('modalroot');
          const box = mr && !mr.classList.contains('hidden') ? mr.querySelector('[data-orphans]') : null;
          if (!box) { clearInterval(orphansPollT); orphansPollT = 0; return; }
          const y = box.scrollTop;
          window.__orphans(true).then(() => {
            const b = document.querySelector('[data-orphans]');
            if (b) b.scrollTop = y;
          });
        }, 5000);
      }
    } catch (e) { if (!silent) toast(e.message); }
  };
  // Холбоогүй/давхар гишүүнийг устгах — админ баталгаажуулсны дараа.
  window.__orphanDel = async (id) => {
    const info = (window.__orphanData || []).find(x => Number(x.id) === Number(id)) || {};
    const name = info.name || ('#' + id);
    const linked = !!info.linked;
    const msg = linked
      ? '«' + name + '» (#' + id + ') модтой холбоостой байна.\n\n' +
        'Устгавал эцэг/эх, хань, хүүхдийн холбоос хамт устана. Итгэлтэй юу?'
      : '«' + name + '» (#' + id + ')-г устгах уу?';
    if (!confirm(msg)) return;
    try {
      await post('/api/members/' + id + '/delete', {});
      toast('Устгалаа ✓');
      await refresh();
      await window.__orphans();
    } catch (e) { toast(e.message); }
  };
  // ---------- 🔔 Web Push: төлөв + туршилт ----------
  window.__pushPage = async () => {
    try {
      // Энэ PWA/төхөөрөмжийн бодит subscription-ыг шалгана.
      let sub = null;
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) sub = await reg.pushManager.getSubscription();
        }
      } catch (e) { /* subscription шалгах боломжгүй */ }
      const st = await getJson('/api/push/status' + (sub && sub.endpoint ? '?endpoint=' + encodeURIComponent(sub.endpoint) : ''));
      const perm = ('Notification' in window) ? Notification.permission : 'дэмжихгүй';
      const on = perm === 'granted' && !!sub && st.thisDevice === true;
      const half = perm === 'granted' && !!sub && st.thisDevice === false;
      const state = on ? '✅ АСААЛТТАЙ' : half ? '⚠️ ХАГАС' : '⚪ УНТРААЛТТАЙ';
      const stateColor = on ? '#1a7048' : half ? '#a86a00' : '#8a3b3b';
      const detail = on
        ? 'Энэ PWA/төхөөрөмж серверт бүртгэгдсэн — шинэ карт холбох хүсэлт ирэхэд мэдэгдэнэ.'
        : half
          ? 'Энэ төхөөрөмжид subscription байгаа ч серверт холбогдоогүй. «Дахин бүртгэх» дарна уу.'
          : perm !== 'granted'
            ? 'Мэдэгдлийн зөвшөөрөл өгөөгүй. «Асаах» дарж зөвшөөрнө үү.'
            : 'Энэ PWA/төхөөрөмж бүртгэгдээгүй. «Асаах» дарна уу.';
      const h = '<div class="rel-p" style="font-size:20px;font-weight:800;color:' + stateColor + '">' + state + '</div>' +
        '<div class="rel-p" style="font-size:13px;opacity:.8">' + detail + '</div>' +
        '<div class="rel-p">Сервер: ' + (st.keyConfigured ? '✅ VAPID түлхүүр тохируулсан' : '❌ VAPID түлхүүр алга') + '</div>' +
        '<div class="rel-p">Админы нийт бүртгэл: ' + (st.mine || 0) + ' төхөөрөмж</div>' +
        '<div class="rel-p">Зөвшөөрөл: ' + escapeHtml(perm) + '</div>' +
        '<div class="rel-p" style="font-size:12px;opacity:.75">iPhone дээр мэдэгдэл зөвхөн Safari-аас «Нүүр дэлгэцэд нэмэх» хийсэн апп дотор ажиллана — энгийн таб дээр ирэхгүй.</div>';
      const actions = on
        ? '<button onclick="window.__pushOn()">Дахин бүртгэх</button>' +
          '<button class="primary" onclick="window.__pushTest()">Туршилт илгээх</button>'
        : '<button class="primary" onclick="window.__pushOn()">🔔 Асаах</button>' +
          '<button onclick="window.__pushTest()">Туршилт илгээх</button>';
      openModal('🔔 Мэдэгдэл', h, actions);
    } catch (e) { toast(e.message); }
  };
  window.__pushTest = async () => {
    try {
      const j = await post('/api/push/test', {});
      const lines = (j.results || []).map(r => r.host + ' — ' + (r.ok ? '✅ илгээгдлээ' : ('❌ ' + (r.status || r.error || 'алдаа'))));
      alert('Туршилт: ' + j.subs + ' төхөөрөмж\n\n' + (lines.join('\n') || 'Энэ хэрэглэгчид бүртгэлтэй төхөөрөмж байхгүй — эхлээд «Асаах» дарна уу.'));
    } catch (e) { toast(e.message); }
  };
  // ---------- 🔔 Web Push: админд утасны мэдэгдэл ----------
  window.__pushOn = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
        return toast('Энэ хөтөч мэдэгдэл дэмжихгүй. iPhone-д эхлээд Safari-аас «Нүүр дэлгэцэд нэмэх» хийсэн байх ёстой.');
      }
      // iOS Safari: зөвшөөрлийн асуулт ЗӨВХӨН хэрэглэгчийн даралтын шууд дотор
      // гарч болно — сүлжээний хүлээлтээс өмнө асууна.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return toast('Мэдэгдлийн зөвшөөрөл өгөөгүй');
      const { key } = await getJson('/api/push/key');
      if (!key) return toast('Серверт мэдэгдлийн түлхүүр тохируулаагүй байна');
      const t = key.replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (t.length % 4)) % 4);
      const bin = atob(t + pad);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const reg0 = await navigator.serviceWorker.register('/sw.js');
      try { await reg0.update(); } catch (e) { /* update шалгалт амжилтгүй */ }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      // VAPID түлхүүр солигдсон бол (жишээ нь Workers → Pages шилжилт) хуучин
      // subscription нь хуучин түлхүүртэй холбогдсон тул push үйлчилгээ
      // 400/403 буцаадаг. Тиймээс түлхүүр өөр байвал дахин үүсгэнэ.
      if (sub) {
        const cur = (sub.options && sub.options.applicationServerKey)
          ? new Uint8Array(sub.options.applicationServerKey) : null;
        const same = !!cur && cur.length === u8.length && cur.every((v, i) => v === u8[i]);
        if (!same) {
          try { await sub.unsubscribe(); } catch (e) { /* үгүй бол алгасна */ }
          sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8 });
      await post('/api/push/subscribe', sub.toJSON());
      toast('🔔 Мэдэгдэл асаалаа ✓');
    } catch (e) { toast('Мэдэгдэл асаахад алдаа: ' + (e.message || e)); }
  };
  window.__adminGo = (name) => {
    window.__closeModal();
    const fn = window[name];
    if (typeof fn === 'function') setTimeout(fn, 60);
  };

  // ---------- 🖼 Анхдагч дүрс (зөвхөн супер админ) ----------
  const AV_META = [
    ['m_child', 'Эрэгтэй хүүхэд', '0–12'],
    ['f_child', 'Эмэгтэй хүүхэд', '0–12'],
    ['m_young', 'Эрэгтэй залуу', '13–25'],
    ['f_young', 'Эмэгтэй залуу', '13–25'],
    ['m_mid', 'Эрэгтэй дунд', '26–55'],
    ['f_mid', 'Эмэгтэй дунд', '26–55'],
    ['m_old', 'Эрэгтэй ахмад', '56+'],
    ['f_old', 'Эмэгтэй ахмад', '56+']
  ];
  window.__avatarsPage = () => {
    const role = S.viewer && S.viewer.role;
    if (role !== 'super') return; // зөвхөн супер админ солино
    const cell = (slot, title, ages) => {
      const url = AVATARS[slot];
      const initial = title.charAt(0);
      return '<div class="av-cell">' +
        '<div class="av-prev">' + (url
          ? '<img src="' + escapeHtml(url) + '" alt="">'
          : '<span>' + escapeHtml(initial) + '</span>') + '</div>' +
        '<b>' + title + '</b><small>' + ages + ' нас</small>' +
        '<div class="av-btns">' +
          '<button onclick="window.__avPick(\'' + slot + '\')">' + (url ? 'Солих' : 'Зураг оруулах') + '</button>' +
          (url ? '<button class="ghost" title="Устгах" onclick="window.__avDel(\'' + slot + '\')">✕</button>' : '') +
        '</div>' +
        '<input type="file" accept="image/*" id="avf_' + slot + '" style="display:none" onchange="window.__avFile(\'' + slot + '\', this)">' +
        '</div>';
    };
    openModal('🖼 Анхдагч дүрс',
      '<div class="rel-p" style="margin-bottom:10px">Зураггүй хүмүүсийн карт дээр энэ 8 дүрс харагдана. Хүйс, наснаас хамаарч автоматаар сонгогдоно. Зураг нь 256×256 болж, төвөөр нь тайрагдна.</div>' +
      '<div class="av-grid">' + AV_META.map(x => cell(x[0], x[1], x[2])).join('') + '</div>',
      '<button onclick="window.__closeModal()">Хаах</button>');
  };
  window.__avPick = (slot) => { const el = $('avf_' + slot); if (el) el.click(); };
  window.__avFile = async (slot, inp) => {
    const f = inp && inp.files && inp.files[0];
    if (!f) return;
    try {
      toast('Зураг боловсруулж байна…');
      const url = await shrinkAvatar(f, 256);
      await post('/api/avatars/' + slot, { url: url });
      await loadAvatars();
      window.__avatarsPage();
      toast('✓ Хадгаллаа');
    } catch (e) { toast(e.message || 'Хадгалж чадсангүй'); }
    try { inp.value = ''; } catch (e) {}
  };
  window.__avDel = async (slot) => {
    if (!confirm('Энэ дүрсийг устгах уу?')) return;
    try {
      const r = await fetch('/api/avatars/' + slot, { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('Устгаж чадсангүй');
      await loadAvatars(); window.__avatarsPage(); toast('Устгалаа');
    } catch (e) { toast(e.message || 'Устгаж чадсангүй'); }
  };
  function shrinkAvatar(file, size) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const im = new Image();
        im.onload = () => {
          try {
            const cv = document.createElement('canvas');
            cv.width = cv.height = size;
            const g = cv.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
            const s = Math.min(im.width, im.height);
            g.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size);
            res(cv.toDataURL('image/jpeg', 0.85));
          } catch (e) { rej(new Error('Зураг боловсруулж чадсангүй')); }
        };
        im.onerror = () => rej(new Error('Зураг уншигдсангүй'));
        im.src = r.result;
      };
      r.onerror = () => rej(new Error('Файл уншигдсангүй'));
      r.readAsDataURL(file);
    });
  }

  window.__closeMenu = () => $('menu').classList.add('hidden');
  // ---- БРАУЗЕРЫН ХУУДСЫН ЗУМЫГ ХОРИГЛОХ ----
  // iOS Safari нь «user-scalable=no»-г үл тоомсорлож, пипч хийхэд БҮХ хуудсыг
  // (дээд мэнюг оролцуулан) томруулж, мэню дэлгэцээс гарч «алга болдог» байв.
  // Зумыг зөвхөн апп өөрөө зохицуулна: мэню байрандаа, хэмжээгээ хадгална.
  try {
    const noZoom = (e) => { e.preventDefault(); };
    document.addEventListener('gesturestart', noZoom, { passive: false });
    document.addEventListener('gesturechange', noZoom, { passive: false });
    document.addEventListener('gestureend', noZoom, { passive: false });
    // Хоёр ба түүнээс олон хуруутай хөдөлгөөн = пипч зум → хуудас томрохгүй
    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    // Давхар товшилтын зум (iOS) — карт дээр ажиллахгүй
    document.addEventListener('dblclick', noZoom, { passive: false });
  } catch (err) {}

  // Зум (пинч) эсвэл чирэлтийн дараах «товшилт» мэнюг хаахгүй — зум дарахад
  // мэню алга болдог байсныг зассан.
  let gestureAt = 0;
  window.__markGesture = () => { gestureAt = Date.now(); };
  document.addEventListener('click', e => {
    if (Date.now() - gestureAt < 350) return;
    if (!e.target.closest('#menu') && !e.target.closest('.a-add')) window.__closeMenu();
  });

  // ---------- бүрэн мэдээлэлтэй гишүүн форм (2-р зураг) ----------
  const EMOJIS = ['🙂', '🤷', '👨', '👩'];
  // /api/members/<id>/photo — зөвхөн харуулах lazy линк; засах формд бодит утга биш
  const LAZY_PHOTO = /^\/api\/members\/\d+\/photo$/i;
  function realPhoto(u) { return LAZY_PHOTO.test(String(u || '')) ? '' : String(u || ''); }
  const photoPrevHtml = (u) => (realPhoto(u) ? '<img src="' + escapeHtml(u) + '" alt="">' : '');
  // Одоогийн зургийг (lazy линк байсан ч) харуулна — форм дээр «зураггүй» мэт харагдахгүй
  const photoShowHtml = (u) => (String(u || '').trim() ? '<img src="' + escapeHtml(u) + '" alt="">' : '');
  function fullForm(p, m, withRel) {
    m = m || {};
    const sex = m.sex || '?';
    const alive = m.alive === undefined ? 1 : m.alive;
    return '' +
      '<label class="f">Нэр *</label><input type="text" id="' + p + '_name" value="' + escapeHtml(m.name || '') + '">' +
      '<div class="row"><div><label class="f">Хүйс</label><select id="' + p + '_sex">' +
      '<option value="m"' + (sex === 'm' ? ' selected' : '') + '>Эрэгтэй</option>' +
      '<option value="f"' + (sex === 'f' ? ' selected' : '') + '>Эмэгтэй</option>' +
      '<option value="?"' + (sex !== 'm' && sex !== 'f' ? ' selected' : '') + '>Тодорхойгүй</option>' +
      '</select></div>' +
      '<div><label class="f">Төрсөн он/өдөр</label><input type="text" inputmode="numeric" autocomplete="off" placeholder="1992 эсвэл 1992-06-07" onchange="window.__normD(this)" id="' + p + '_date" value="' + escapeHtml(m.birth_date || '') + '"></div></div>' +
      '<div class="row"><div><label class="f">Нас барсан он/өдөр</label><input type="text" id="' + p + '_death" placeholder="1990 эсвэл 1990-06-07" value="' + escapeHtml(m.death_date || '') + '"></div>' +
      '<div><label class="f">Амьд эсэх</label><select id="' + p + '_alive">' +
      '<option value="1"' + (alive !== 0 ? ' selected' : '') + '>Амьд</option>' +
      '<option value="0"' + (alive === 0 ? ' selected' : '') + '>Нас барсан</option>' +
      '</select></div></div>' +
      '<div class="row"><div><label class="f">Төрсөн нутаг</label><input type="text" id="' + p + '_place" value="' + escapeHtml(m.birth_place || '') + '"></div>' +
      '<div><label class="f">Ургийн овог</label><input type="text" id="' + p + '_clan" value="' + escapeHtml(m.clan || '') + '"></div></div>' +
      '<label class="f">Утас</label><input type="tel" id="' + p + '_phone" value="' + escapeHtml(m.phone || '') + '">' +
      '<label class="f">Гавьяа</label><textarea id="' + p + '_honors" style="min-height:44px">' + escapeHtml(m.honors || '') + '</textarea>' +
      '<label class="f">Намтар</label><textarea id="' + p + '_bio" style="min-height:60px">' + escapeHtml(m.bio || '') + '</textarea>' +
      '<label class="f">Зураг (утас/компьютерээс сонгоно)</label>' +
      '<button type="button" onclick="document.getElementById(\'' + p + '_file\').click()">📷 Зураг оруулах</button>' +
      '<input type="file" id="' + p + '_file" accept="image/*" style="display:none" onchange="window.__photoPick(\'' + p + '\')">' +
      '<label class="f">Эсвэл доорх талбарт линк бичнэ</label>' +
      '<input type="text" id="' + p + '_photo" placeholder="/img/16 эсвэл https://..." value="' + escapeHtml(realPhoto(m.photo)) + '" data-orig="' + escapeHtml(realPhoto(m.photo)) + '" oninput="window.__photoPrev(\'' + p + '\')">' +
      // Одоогийн зургийг (lazy линк ч) урьдчилан харуулна — хоосон мэт харагдахгүй
      '<div class="photo-prev" id="' + p + '_prev">' + photoShowHtml(m.photo) + '</div>' +
      (realPhoto(m.photo) ? '<button type="button" class="ghost" style="margin-top:6px;font-size:12px;margin-right:6px" onclick="window.__photoCrop(\'' + p + '\')">✂ Зураг тааруулах</button>' : '') +
      (m.photo ? '<button type="button" class="ghost" style="margin-top:6px;font-size:12px" onclick="window.__photoDel(\'' + p + '\')">🗑 Зургийг устгах</button>' : '') +
      '<label class="f">Эмодзи-аватар (заавал биш)</label>' +
      '<div class="emo-chips" id="' + p + '_emo">' + EMOJIS.map(e =>
        '<span data-e="' + e + '"' + (m.emoji === e ? ' class="on"' : '') +
        ' onclick="window.__emoPick(\'' + p + '\',\'' + e + '\')">' + e + '</span>').join('') + '</div>' +
      (withRel ?
        '<div style="height:1px;background:var(--line);opacity:.6;margin:12px 0 8px"></div>' +
        '<label class="f">Холбоотой хүн (модонд байгаа — шинэ карт үүсгэхгүй)</label>' +
        '<select id="' + p + '_rel" onchange="window.__relAs(\'' + p + '\')">' +
        '<option value="">— холбохгүй —</option>' +
        '<option value="father">Аав (энэ хүний ДЭЭР нь)</option>' +
        '<option value="mother">Ээж (энэ хүний ДЭЭР нь)</option>' +
        '<option value="child">Хүү / Охин (энэ хүний ДООР нь)</option>' +
        '<option value="spouse">Хань — эхнэр/нөхөр (ХАЖУУД нь)</option>' +
        '<option value="sibling">Ах / Эгч / Дүү (ХАЖУУД нь, адилхан эцэг эхтэй)</option>' +
        '</select>' +
        '<div id="' + p + '_relwrap" class="hidden" data-self="' + (m.id ? m.id : 0) + '">' +
        '<label class="f">Хүн сонгох — хайж, дарна уу</label>' +
        '<input type="text" id="' + p + '_relq" oninput="window.__relPickQ(\'' + p + '\')" placeholder="Нэрээр хайх">' +
        '<div class="picker" id="' + p + '_rellist" style="max-height:150px"></div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">Сонгосон хүн модонд бэлэн байрлана: Аав/Ээж — дээр, Хүү/Охин — доор, Хань/Ах/Эгч — хажууд нь.</div>' +
        '</div>' : '');
  }
  let relSel = { p: null, id: 0 };
  function renderRelPick(p) {
    const el = $(p + '_rellist');
    if (!el) return;
    const q = (($(p + '_relq') || {}).value || '').toLowerCase().trim();
    const selfId = Number(el.dataset.self) || 0;
    const items = [...byId.values()]
      .filter(x => x.id !== selfId && (!q || String(x.name || '').toLowerCase().includes(q)))
      .slice(0, 80);
    el.innerHTML = items.map(x => {
      const yr = x.birth_date ? String(x.birth_date).slice(0, 4) : (x.birth_year || '');
      return '<div data-id="' + x.id + '" class="' + (relSel.id === x.id ? 'on' : '') + '" onclick="window.__relSel(\'' + p + '\',' + x.id + ')">' +
        '<span style="flex:1">' + escapeHtml(x.name) + '</span>' +
        '<span class="badge">' + (x.sex === 'f' ? 'Эм' : x.sex === 'm' ? 'Эр' : '?') + '</span>' +
        '<span style="opacity:.6">' + escapeHtml(String(yr)) + '</span></div>';
    }).join('') || '<div style="opacity:.6">Олдохгүй</div>';
  }
  window.__relSel = (p, id) => { relSel = { p, id }; renderRelPick(p); };
  window.__relPickQ = (p) => renderRelPick(p);
  window.__relAs = (p) => {
    const sel = $(p + '_rel'), w = $(p + '_relwrap');
    if (!sel || !w) return;
    const on = !!sel.value;
    w.classList.toggle('hidden', !on);
    if (on) renderRelPick(p);
    else if (relSel.p === p) relSel = { p: null, id: 0 };
  };
  // «🗑 Зургийг устгах» — зургийг ЗОРИУД устгахыг илтгэнэ (data-orig-оос ялгаатай болгоно)
  window.__photoDel = (p) => {
    const el = $(p + '_photo'), pv = $(p + '_prev');
    if (el) { el.value = ''; el.setAttribute('data-orig', '__remove__'); }
    if (pv) pv.innerHTML = '';
    toast('Зураг хадгалахад устана');
  };
  window.__photoPrev = (p) => {
    const el = $(p + '_prev'), inp = $(p + '_photo');
    if (el && inp) el.innerHTML = photoPrevHtml(inp.value.trim());
  };
  window.__emoPick = (p, e) => {
    const box = $(p + '_emo'); if (!box) return;
    const cur = box.querySelector('span.on');
    if (cur && cur.dataset.e === e) { cur.classList.remove('on'); return; }
    box.querySelectorAll('span').forEach(s => s.classList.toggle('on', s.dataset.e === e));
  };
  // ---------- ЗУРАГ ТААРУУЛАХ (cropper) ----------
  // Картын өргөн/өндрийн харьцаа — тайрах хүрээ яг картын зурагтай ижил байна.
  // (Карт бодитоор зурагдаж байгаа бол түүнээс хэмжинэ; эс бөгөөс 140×96.)
  function cardAspect() {
    const b = document.querySelector('#cards .card .box');
    const w = b ? b.clientWidth : 0, h = b ? b.clientHeight : 0;
    return (w > 20 && h > 20) ? (w / h) : (140 / 96);
  }
  const CROP_OUT_W = 700;                      // гарах зургийн өргөн (2x retina)
  const CROP_MAX_CHARS = 600000;               // серверийн хүлээх дээд хэмжээ
  // Тааруулагч цонх: чирж зөөх + zoom. Буцаах: Promise<dataURL|null>
  // ── ЗУРАГ ТААРУУЛАХ: зургийг ТАЙРАХГҮЙ ──────────────────────────────────
  // Зураг бүтнээрээ хадгалагдана. Тааруулагч нь зөвхөн карт дотор хэвтээ/
  // босоо байрлал (cx, cy: 0..1) ба хэмжээг (zoom) тодорхойлж буцаана.
  // zoom = 1 нь зураг хүрээг ЯГ дүүргэсэн хэмжээ — цагаан зай гарахгүй.
  const ZOOM_MIN = 1, ZOOM_MAX = 3;
  const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));
  function cropModal(src, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const AR = cardAspect();                     // картын хүрээний харьцаа
      const p0 = o.params || {};
      const wrap = document.createElement('div');
      wrap.className = 'crop-wrap';
      wrap.innerHTML =
        '<div class="crop-panel" role="dialog" aria-label="Зураг тааруулах">' +
          '<div class="crop-head">Зураг тааруулах</div>' +
          '<div class="crop-stage" id="crop_stage">' +
            '<img id="crop_img" alt="" draggable="false">' +
            (o.name ? '<div class="crop-prev"><b>' + escapeHtml(o.name) + '</b>' +
              (o.meta ? '<i>' + escapeHtml(o.meta) + '</i>' : '') + '</div>' : '') +
          '</div>' +
          '<div class="crop-hint">Зургаа чирж байрлуулна · 🔍 гүйлгэгчээр томруулна (зураг хүрээнээс бага болохгүй)</div>' +
          '<div class="crop-zoom"><span aria-hidden="true">🔍</span>' +
            '<input id="crop_zoom" type="range" min="100" max="300" step="1" value="100" aria-label="Зургийн хэмжээ">' +
            '<button type="button" class="crop-zval" id="crop_zval" title="Хүрээг дүүргэсэн хэмжээ">1.0×</button></div>' +
          '<div class="crop-actions">' +
            '<button type="button" class="crop-cancel">Болих</button>' +
            '<button type="button" class="crop-save">Хадгалах</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(wrap);
      const stage = wrap.querySelector('#crop_stage');
      stage.style.aspectRatio = String(AR);
      const img = wrap.querySelector('#crop_img');
      const zoomEl = wrap.querySelector('#crop_zoom');
      const zval = wrap.querySelector('#crop_zval');
      let iw = 0, ih = 0, ar = 0, done = false;
      let zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(p0.zoom) || 1));
      let cx = p0.cx == null ? 0.5 : clamp01(p0.cx);
      let cy = p0.cy == null ? 0.5 : clamp01(p0.cy);
      const W = () => stage.clientWidth, H = () => stage.clientHeight;
      const dims = () => {
        const w = W(), h = H();
        let cw = w, ch = h;
        // «cover» — 1× үед зураг хүрээг бүрэн дүүргэнэ
        if (ar) { if (w / h > ar) { cw = w; ch = w / ar; } else { ch = h; cw = h * ar; } }
        return { dw: cw * zoom, dh: ch * zoom };
      };
      const paint = () => {
        const d = dims();
        img.style.width = d.dw.toFixed(1) + 'px';
        img.style.height = d.dh.toFixed(1) + 'px';
        img.style.left = (-(cx * Math.max(0, d.dw - W()))).toFixed(1) + 'px';
        img.style.top = (-(cy * Math.max(0, d.dh - H()))).toFixed(1) + 'px';
        if (zval) zval.textContent = zoom.toFixed(1) + '×';
        if (zoomEl) zoomEl.value = String(Math.round(zoom * 100));
      };
      const close = (val) => {
        if (done) return; done = true;
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(null); } };

      img.onload = () => {
        iw = img.naturalWidth || img.width; ih = img.naturalHeight || img.height;
        if (!iw || !ih) return close(null);
        ar = iw / ih;
        paint();
      };
      img.onerror = () => { toast('Энэ зургийг нээх боломжгүй байна'); close(null); };
      img.src = src;

      // Чирж зөөх (хулгана + хуруу) — цагаан зай гарахгүйн тулд хязгаартай
      let drag = null;
      stage.addEventListener('pointerdown', (e) => {
        const d = dims();
        drag = {
          x: e.clientX, y: e.clientY, cx, cy,
          ox: Math.max(0, d.dw - W()), oy: Math.max(0, d.dh - H())
        };
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        stage.classList.add('drag');
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        if (drag.ox > 0) cx = clamp01(drag.cx - (e.clientX - drag.x) / drag.ox);
        if (drag.oy > 0) cy = clamp01(drag.cy - (e.clientY - drag.y) / drag.oy);
        paint();
      });
      const endDrag = () => { drag = null; stage.classList.remove('drag'); };
      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', endDrag);
      stage.addEventListener('pointerleave', endDrag);

      // Хэмжээ: хамгийн бага нь хүрээг яг дүүргэсэн 1× — түүнээс зөвхөн томорно
      zoomEl.addEventListener('input', () => {
        zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (+zoomEl.value || 100) / 100));
        paint();
      });
      if (zval) zval.onclick = () => { zoom = 1; paint(); };

      wrap.querySelector('.crop-cancel').onclick = () => close(null);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
      document.addEventListener('keydown', onKey);
      wrap.querySelector('.crop-save').onclick = () => {
        if (!ar) return;
        close({ zoom: Number(zoom.toFixed(3)), cx: Number(cx.toFixed(4)), cy: Number(cy.toFixed(4)), ar: Number(ar.toFixed(4)) });
      };
    });
  }
  // Файлаас: ЭХ ЗУРГИЙГ БҮТНЭЭР нь (тайрахгүй) бэлтгэж, тааруулагчаас
  // зөвхөн хэмжээ/байрлалын параметрийг авна.
  async function pickCover(file, opts) {
    const url = await resizePhoto(file, { max: 1400 });
    const prm = await cropModal(url, opts || {});
    return prm ? { url, params: prm } : null;
  }
  window.__photoPick = async (p) => {
    const inp = $(p + '_file');
    const f = inp && inp.files && inp.files[0];
    if (!f) return;
    try {
      if (!/^image\//i.test(f.type || '') && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name || '')) {
        throw new Error('Зураг файл биш байна');
      }
      // Зургийг ТАЙРАХГҮЙ — эх зургийг бүтнээр нь хадгална
      let url = await resizePhoto(f, { max: 1400 });
      if (url == null) { inp.value = ''; return; }
      $(p + '_photo').value = url;
      window.__photoPrev(p);
      inp.value = '';
    } catch (e) {
      // Тааруулагч нээгдэхгүй бол (жишээ нь HEIC) хуучин аргаар шууд жижиглэнэ
      try {
        const url = await resizePhoto(f);
        $(p + '_photo').value = url;
        window.__photoPrev(p);
        inp.value = '';
      } catch (e2) { toast(e2.message || e.message); inp.value = ''; }
    }
  };
  // Форм доторх зургийг тааруулах — карт дээрх хэмжээ/байрлал нь
  // профайлын «Зураг тааруулах» товчоор реал цагт тохируулагдана.
  window.__photoCrop = async () => {
    toast('Зургийн байрлалыг профайл дахь «Зураг тааруулах» товчоор тааруулна');
  };
  // Утасны камераар авсан ТОМ зургийг ч хүлээж авна:
  //  • эх файл 40MB хүртэл (өмнө 10MB-аас дээш бол шууд алдаа гардаг байсан)
  //  • EXIF эргэлтийг зөв тооцно (createImageBitmap → from-image)
  //  • 1280px хүртэл буулгаж, багтахгүй бол чанарыг шатлаж бууруулна
  //  • HEIC зэрэг хөтчөөр нээгдэхгүй формат дээр ойлгомжтой алдаа өгнө
  async function resizePhoto(file, opts) {
    const MAX_IN = 40 * 1024 * 1024;   // эх файлын дээд хэмжээ
    const MAX_OUT = 600000;            // серверийн хүлээх дээд хэмжээ (тэмдэгт)
    const MAX_SIDE = (opts && opts.max) || 1280;
    if (!file) throw new Error('Зураг сонгоогүй байна');
    const isImg = /^image\//i.test(file.type || '') ||
      /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || '');
    if (!isImg) throw new Error('Зураг файл биш байна');
    if (file.size > MAX_IN) {
      throw new Error('Файл хэт том (' + Math.round(file.size / 1048576) + 'MB) — 40MB хүртэл зөвшөөрнө');
    }
    let src = null, w = 0, h = 0;
    // ① Орчин үеийн арга: зургийг шууд декодож, эргэлтийг зөв тооцно
    try {
      if (typeof createImageBitmap === 'function') {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        w = src.width || (src.naturalWidth || 0);
        h = src.height || (src.naturalHeight || 0);
      }
    } catch (e) { src = null; }
    // ② Нөөц арга: <img> — хуучин Safari зэрэгт
    if (!src || !w || !h) {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = () => rej(new Error('Файл унших алдаа'));
        fr.readAsDataURL(file);
      });
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('Энэ зургийг хөтчөөр нээх боломжгүй (ж: iPhone-ы HEIC). ' +
          '«Хамгийн нийцтэй» (JPEG) болгож эсвэл камераас дахин авна уу.'));
        i.src = dataUrl;
      });
      src = img; w = img.naturalWidth || img.width; h = img.naturalHeight || img.height;
    }
    if (!w || !h) throw new Error('Зургийн хэмжээ тодорхойгүй байна');
    // ③ Буулгах + чанар шатлаж, серверийн хязгаарт багтаана
    let side = MAX_SIDE, q = 0.86, out = '';
    for (let i = 0; i < 7; i++) {
      const k = Math.min(1, side / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cw, ch);   // тунгалаг PNG → цагаан
      cx.drawImage(src, 0, 0, cw, ch);
      out = cv.toDataURL('image/jpeg', q);
      if (out.length <= MAX_OUT) break;
      if (q > 0.55) q -= 0.12;            // эхлээд чанар
      else side = Math.round(side * 0.78); // дараа нь хэмжээ
    }
    if (src && src.close) { try { src.close(); } catch (e) {} }
    if (!out || out.length > MAX_OUT) throw new Error('Зураг багтахгүй байна — өөр зураг сонгоно уу');
    return out;
  }
  // Огноог ГАРААС бичсэнээр хүлээж авах (native date picker утсан дээр тохиромжгүй):
  //   1992 · 1992-06 · 1992-06-07 · 1992.6.7 · 07.06.1992 · 19920607
  // Буцаах: { date: 'YYYY-MM-DD' эсвэл '', year: 'YYYY' эсвэл '', bad: bool }
  function normBirth(raw) {
    let s = String(raw || '').trim();
    if (!s) return { date: '', year: '', bad: false };
    s = s.replace(/[^0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let p = s.split('-').filter(Boolean);
    const isYear = (v) => !!v && v.length === 4;
    if (p.length === 1) {
      if (p[0].length === 8) p = [p[0].slice(0, 4), p[0].slice(4, 6), p[0].slice(6, 8)];
      else if (p[0].length === 4) return { date: '', year: p[0], bad: false };
      else return { date: '', year: '', bad: true };
    }
    if (p.length === 2) {
      if (isYear(p[0]) && +p[1] >= 1 && +p[1] <= 12)
        return { date: p[0] + '-' + ('0' + p[1]).slice(-2), year: p[0], bad: false };
      return { date: '', year: '', bad: true };
    }
    if (p.length === 3) {
      let y, mo, d;
      if (isYear(p[0])) { y = p[0]; mo = p[1]; d = p[2]; }
      else if (isYear(p[2])) { y = p[2]; mo = p[1]; d = p[0]; } // 07.06.1992
      else return { date: '', year: '', bad: true };
      const mi = +mo, di = +d;
      if (!(mi >= 1 && mi <= 12) || !(di >= 1 && di <= 31)) return { date: '', year: '', bad: true };
      return { date: y + '-' + ('0' + mi).slice(-2) + '-' + ('0' + di).slice(-2), year: y, bad: false };
    }
    return { date: '', year: '', bad: true };
  }
  window.__normD = (el) => {
    const r = normBirth(el.value);
    if (r.bad) { toast('Огноо буруу — 1992 эсвэл 1992-06-07 гэж бичнэ үү'); return; }
    el.value = r.date || r.year || '';
  };
  window.__normBirth = normBirth;

  function readFull(p, orig) {
    const eb = $(p + '_emo');
    const on = eb ? eb.querySelector('span.on') : null;
    const nb = normBirth(($(p + '_date') || {}).value || '');
    if (nb.bad) { toast('Огноо буруу — 1992 эсвэл 1992-06-07 гэж бичнэ үү'); throw new Error('Огноо буруу'); }
    return {
      name: ($(p + '_name') || {}).value || '',
      sex: ($(p + '_sex') || {}).value || '?',
      birth_date: nb.date,
      birth_year: nb.year || (orig && orig.birth_year ? String(orig.birth_year) : ''),
      death_date: ($(p + '_death') || {}).value || '',
      birth_place: ($(p + '_place') || {}).value || '',
      clan: ($(p + '_clan') || {}).value || '',
      phone: ($(p + '_phone') || {}).value || '',
      honors: ($(p + '_honors') || {}).value || '',
      bio: ($(p + '_bio') || {}).value || '',
      // ЗУРАГ: талбар хөндөгдөөгүй бол photo-г огт илгээхгүй. Эс бөгөөс
      // state-ийн lazy линк '' болж, хадгалагдсан нүүр зураг устана.
      ...(() => {
        const el = $(p + '_photo');
        if (!el) return {};
        const cur = String(el.value || '').trim();
        const orig = String(el.getAttribute('data-orig') || '');
        return cur === orig ? {} : { photo: cur, photo_dirty: true };
      })(),
      emoji: on ? on.dataset.e : '',
      alive: Number(($(p + '_alive') || {}).value || 1),
      rel_as: ($(p + '_rel') || {}).value || '',
      rel_id: (relSel.p === p && relSel.id) ? relSel.id : 0
    };
  }

  // ①/② Эцэг, Эх нэмэх
  window.__parent = async (as) => {
    const sel = selected;
    const m = byId.get(sel);
    if (!m) return;
    openModal((as === 'father' ? 'Эцэг нэмэх' : 'Эх нэмэх') + ' — ' + escapeHtml(m.name),
      '<div class="radio"><label><input type="radio" name="pmode" value="new" checked onchange="window.__pmode()"> Шинэ хүн</label> ' +
      '<label><input type="radio" name="pmode" value="old" onchange="window.__pmode()"> Модонд байгаа хүн</label></div>' +
      '<div id="pnew">' + fullForm('p') + '</div>' +
      '<div id="pold" class="hidden"><label class="f">Хайх</label>' +
      '<input type="text" id="p_q" oninput="window.__pickQ()" placeholder="Нэрээр хайх">' +
      '<div class="picker" id="p_list"></div></div>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveParent(\'' + as + '\')">Холбох</button>');
    await loadPick('parent', sel, 'p_list', 'p_q');
  };
  window.__pmode = () => {
    const v = document.querySelector('input[name="pmode"]:checked').value;
    $('pnew').classList.toggle('hidden', v !== 'new');
    $('pold').classList.toggle('hidden', v !== 'old');
  };
  window.__saveParent = async (as) => {
    try {
      const mode = document.querySelector('input[name="pmode"]:checked').value;
      if (mode === 'old') {
        if (!pickState.sel) throw wrapErr('Хүн сонгоно уу');
        await post('/api/link', { kind: 'child', child_id: selected, parent_id: pickState.sel, as });
      } else {
        const p = readFull('p');
        if (!p.name.trim()) throw wrapErr('Нэр шаардлагатай');
        const nid = (await post('/api/members', p)).id;
        await post('/api/link', { kind: 'child', child_id: selected, parent_id: nid, as });
      }
      window.__closeModal();
      toast('Холбогдлоо ✓');
      await refresh();
      openDetail(selected);
    } catch (e) { toast(e.message); }
  };

  // ③ Эхнэр/Нөхөр
  window.__spouse = async () => {
    const sel = selected;
    const m = byId.get(sel);
    if (!m) return;
    openModal('Эхнэр/Нөхөр нэмэх — ' + escapeHtml(m.name),
      '<div class="radio"><label><input type="radio" name="smode" value="new" checked onchange="window.__smode()"> Шинэ хүн</label> ' +
      '<label><input type="radio" name="smode" value="old" onchange="window.__smode()"> Модонд байгаа хүн</label></div>' +
      '<div id="snew">' + fullForm('s') + '</div>' +
      '<div id="sold" class="hidden"><label class="f">Хайх</label>' +
      '<input type="text" id="s_q" oninput="window.__pickQ()" placeholder="Нэрээр хайх">' +
      '<div class="picker" id="s_list"></div></div>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveSpouse()">Холбох</button>');
    await loadPick('spouse', sel, 's_list', 's_q');
  };
  window.__smode = () => {
    const v = document.querySelector('input[name="smode"]:checked').value;
    $('snew').classList.toggle('hidden', v !== 'new');
    $('sold').classList.toggle('hidden', v !== 'old');
  };
  window.__saveSpouse = async () => {
    try {
      const mode = document.querySelector('input[name="smode"]:checked').value;
      let id2;
      if (mode === 'old') {
        if (!pickState.sel) throw wrapErr('Хүн сонгоно уу');
        id2 = pickState.sel;
      } else {
        const p = readFull('s');
        if (!p.name.trim()) throw wrapErr('Нэр шаардлагатай');
        const sel = byId.get(selected);
        if (p.sex === '?' && sel && sel.sex !== '?') p.sex = sel.sex === 'm' ? 'f' : 'm';
        id2 = (await post('/api/members', p)).id;
      }
      await post('/api/link', { kind: 'spouse', a_id: selected, b_id: id2 });
      window.__closeModal();
      toast('Холбогдлоо ✓');
      await refresh();
      openDetail(selected);
    } catch (e) { toast(e.message); }
  };

  // ④ Хүүхэд нэмэх
  window.__child = async () => {
    const sel = selected;
    const m = byId.get(sel);
    if (!m) return;
    const spouses = [...(spOf.get(sel) || [])].map(id => byId.get(id)).filter(Boolean);
    let partnerQ = '';
    if (spouses.length) {
      partnerQ = '<label class="f">Аль ханьтайгаа хүүхэд вэ?</label><select id="c_partner">' +
        '<option value="">— зөвхөн би —</option>' +
        spouses.map(s => '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>').join('') + '</select>';
    }
    openModal('Хүүхэд нэмэх — ' + escapeHtml(m.name),
      partnerQ +
      '<div class="radio"><label><input type="radio" name="cmode" value="new" checked onchange="window.__cmode()"> Шинэ хүн</label> ' +
      '<label><input type="radio" name="cmode" value="old" onchange="window.__cmode()"> Модонд байгаа хүн</label></div>' +
      '<div id="cnew">' + fullForm('c') +
      '<label class="f">Хамаарлын төрөл</label><select id="c_rel">' +
      '<option>Төрсөн</option><option>Үрчлэгдсэн</option><option>Амраг</option><option>Бусад</option></select>' +
      '</div>' +
      '<div id="cold" class="hidden"><label class="f">Хайх</label>' +
      '<input type="text" id="c_q" oninput="window.__pickQ()" placeholder="Нэрээр хайх">' +
      '<div class="picker" id="c_list"></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">Модонд бэлэн «Хүү/Охин» байвал сонгоод шууд холбоно.</div></div>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveChild()">Холбох</button>');
    await loadPick('child', sel, 'c_list', 'c_q');
  };
  window.__cmode = () => {
    const v = document.querySelector('input[name="cmode"]:checked').value;
    $('cnew').classList.toggle('hidden', v !== 'new');
    $('cold').classList.toggle('hidden', v !== 'old');
  };
  function parentRoles() {
    const sel = byId.get(selected);
    const pid = $('c_partner') ? Number($('c_partner').value) || null : null;
    const partner = pid ? byId.get(pid) : null;
    let father = null, mother = null;
    const sSex = sel ? sel.sex : '?';
    if (sSex === 'm') { father = sel.id; mother = pid; }
    else if (sSex === 'f') { mother = sel.id; father = pid; }
    else if (partner && partner.sex === 'm') { mother = sel.id; father = pid; }
    else { father = sel.id; mother = pid; }
    return { father, mother };
  }
  window.__saveChild = async () => {
    try {
      const mode = document.querySelector('input[name="cmode"]:checked').value;
      const roles = parentRoles();
      if (mode === 'old') {
        if (!pickState.sel) throw wrapErr('Хүн сонгоно уу');
        const cid = pickState.sel;
        if (roles.father) await post('/api/link', { kind: 'child', child_id: cid, parent_id: roles.father, as: 'father' });
        if (roles.mother) await post('/api/link', { kind: 'child', child_id: cid, parent_id: roles.mother, as: 'mother' });
      } else {
        const data = readFull('c');
        data.rel_type = $('c_rel').value;
        data.father_id = roles.father; data.mother_id = roles.mother;
        if (!data.name.trim()) throw wrapErr('Нэр шаардлагатай');
        await post('/api/members', data);
      }
      window.__closeModal();
      toast('Хүүхэд нэмэгдлээ ✓');
      await refresh();
      openDetail(selected);
    } catch (e) { toast(e.message); }
  };

  // ⑤ Шинэ гишүүн (холбоотой)
  window.__newMember = async (conn) => {
    const sel = selected;
    const m = sel != null ? byId.get(sel) : null;
    const hasSel = !!m && !RO;
    let connQ = '';
    if (hasSel) {
      connQ = '<label class="f">Холбоо</label><select id="n_conn">' +
        '<option value="none"' + (conn === 'none' || !conn ? ' selected' : '') + '>Холбоогүй (салангид карт)</option>' +
        '<option value="child"' + (conn === 'child' ? ' selected' : '') + '>Энэ хүний хүүхэд</option>' +
        '<option value="parents"' + (conn === 'parents' ? ' selected' : '') + '>Эцэг-эх (энэ хүүгийн эцэг/эх)</option>' +
        '<option value="spouse"' + (conn === 'spouse' ? ' selected' : '') + '>Эхнэр-нөхөр</option>' +
        '</select><div id="n_partner_wrap" class="hidden"></div>';
    }
    // Аав/ээж сонгох — карт сонгоогүй үед ч асууна
    const parOpts = (sex) => '<option value="">— холбохгүй —</option>' +
      [...byId.values()].filter(x => x.sex === sex && x.id !== (hasSel ? m.id : -1))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'mn'))
        .map(x => '<option value="' + x.id + '">' + escapeHtml(x.name) +
          (x.birth ? ' · ' + String(x.birth).slice(0, 4) : '') + '</option>').join('');
    const parQ = '<div id="n_par_box">' +
      '<label class="f">Аав (заавал биш)</label><select id="n_father">' + parOpts('m') + '</select>' +
      '<label class="f">Ээж (заавал биш)</label><select id="n_mother">' + parOpts('f') + '</select>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:4px">' +
      'Хэний хүүхэд болохыг сонгоно уу. Хоосон орхивол холбоогүй карт нэмэгдэнэ.</div></div>';
    relSel = { p: null, id: 0 };
    openModal(hasSel ? 'Шинэ гишүүн — ' + escapeHtml(m.name) : '＋ Шинэ гишүүн',
      connQ + parQ + fullForm('n', null, true) +
      '<label class="f">Хамаарлын төрөл</label><select id="n_rel"><option>Төрсөн</option><option>Үрчлэгдсэн</option><option>Амраг</option><option>Бусад</option></select>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveNew()">Нэмэх</button>');
    if (hasSel) window.__connChange();
    window.__connChange = () => {
      const v = $('n_conn') ? $('n_conn').value : 'none';
      const pb = $('n_par_box');
      if (pb) pb.classList.toggle('hidden', v !== 'none');   // холбоо сонгосон бол эцэг/эхийг автоматаар тогтооно
      const w = $('n_partner_wrap');
      if (!w) return;
      if ((v === 'child' || v === 'spouse') && spOf.get(sel) && spOf.get(sel).size) {
        w.classList.remove('hidden');
        w.innerHTML = '<label class="f">Аль ханьтайгаа?</label><select id="n_partner">' +
          '<option value="">— зөвхөн би —</option>' +
          [...spOf.get(sel)].map(id => byId.get(id)).filter(Boolean)
            .map(s => '<option value="' + s.id + '">' + escapeHtml(s.name) + '</option>').join('') + '</select>';
      } else { w.classList.add('hidden'); w.innerHTML = ''; }
    };
    if (hasSel) $('n_conn').onchange = window.__connChange;
  };
  window.__saveNew = async () => {
    try {
      const data = readFull('n');
      data.rel_type = $('n_rel').value;
      if (!data.name.trim()) throw wrapErr('Нэр шаардлагатай');
      if (data.rel_as && !data.rel_id) throw wrapErr('Холбоотой хүнийг сонгоно уу');
      const sel = selected;
      const m = sel != null ? byId.get(sel) : null;
      const conn = $('n_conn') ? $('n_conn').value : 'none';
      const pid = $('n_partner') ? Number($('n_partner').value) || null : null;
      let cre = null;
      if (!m || conn === 'none') {
        const fv = $('n_father') ? Number($('n_father').value) || null : null;
        const mv = $('n_mother') ? Number($('n_mother').value) || null : null;
        if (fv) data.father_id = fv;
        if (mv) data.mother_id = mv;
        cre = await post('/api/members', data);
      } else if (conn === 'child') {
        const roles = parentRoles2(sel, pid);
        data.father_id = roles.father; data.mother_id = roles.mother;
        cre = await post('/api/members', data);
      } else if (conn === 'spouse') {
        cre = await post('/api/members', data);
        await post('/api/link', { kind: 'spouse', a_id: sel, b_id: cre.id });
      } else if (conn === 'parents') {
        cre = await post('/api/members', data);
        await post('/api/link', { kind: 'child', child_id: sel, parent_id: cre.id, as: data.sex === 'f' ? 'mother' : 'father' });
      }
      window.__closeModal();
      toast((cre && cre.points) ? 'Нэмэгдлээ ✓ +' + cre.points + ' оноо' : 'Нэмэгдлээ ✓');
      await refresh();
    } catch (e) { toast(e.message); }
  };
  function parentRoles2(selId, partnerId) {
    const sel = byId.get(selId);
    const partner = partnerId ? byId.get(partnerId) : null;
    let father = null, mother = null;
    if (sel.sex === 'm') { father = selId; mother = partnerId; }
    else if (sel.sex === 'f') { mother = selId; father = partnerId; }
    else if (partner && partner.sex === 'm') { mother = selId; father = partnerId; }
    else { father = selId; mother = partnerId; }
    return { father, mother };
  }

  // ---------- засах / устгах ----------
  window.__edit = (id) => {
    const m = byId.get(id);
    if (!m) return;
    relSel = { p: null, id: 0 };
    openModal('✏️ ' + escapeHtml(m.name) + ' — засах',
      fullForm('e', m, true),
      '<button class="danger" onclick="window.__del(' + id + ')">🗑 Устгах</button>' +
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveEdit(' + id + ')">Хадгалах</button>');
  };
  window.__saveEdit = async (id) => {
    try {
      const m = byId.get(id) || {};
      const data = readFull('e', m);
      if (data.rel_as && !data.rel_id) throw wrapErr('Холбоотой хүнийг сонгоно уу');
      const r = await post('/api/members/' + id + '/update', data);
      window.__closeModal();
      toast(r.points ? 'Хадгаллаа ✓ +' + r.points + ' оноо' : 'Хадгаллаа ✓');
      // Модны төлөв (нээсэн салаа, сонголт, камер) ХЭВЭЭР — зөвхөн өгөгдөл шинэчилнэ
      await refreshKeepTree();
      openDetail(id);
    } catch (e) { toast(e.message); }
  };
  // ── НЭГ ДАРАЛТ = НЭГ БҮРТГЭЛ ─────────────────────────────────────────────
  // «Шинэ гишүүн», «Хүүхэд нэмэх» зэрэгт товчийг 2–3 удаа дарахад 2–3 давхар
  // гишүүн үүсдэг байв. Одоо хадгалалт дуустал дараагийн даралт ажиллахгүй.
  (() => {
    let busy = false;
    for (const k of ['__saveNew', '__saveChild', '__saveSpouse', '__saveParent', '__saveEdit']) {
      const fn = window[k];
      if (typeof fn !== 'function') continue;
      window[k] = async function (...args) {
        if (busy) return;
        busy = true;
        try { return await fn.apply(this, args); } finally { busy = false; }
      };
    }
  })();

  // Буруу холбоосыг устгах: ✕ → баталгаажуулж, серверээс холбоосыг хасна
  window.__unlink = async (kind, id, otherId) => {
    const a = byId.get(id), b = byId.get(otherId);
    const what = kind === 'parent' ? 'эцэг/эх' : kind === 'child' ? 'хүүхэд'
      : kind === 'sibling' ? 'ах/дүү' : 'хань';
    const note = kind === 'sibling'
      ? '\n(Түүнтэй хамтдаг эцэг/эхийн холбоосыг тэр хүнээс салгана — таны эцэг/эх хэвээр.)'
      : '\n(Буруу холбосон бол устгаад зөв хүнээ дахин нэмнэ.)';
    if (!confirm('«' + (b ? b.name : otherId) + '»-тэй ' + what + ' холбоосыг устгах уу?' + note)) return;
    try {
      await post('/api/link/delete', { kind, id, other_id: otherId });
      toast('Холбоос устгалаа ✓');
      await refresh();
      openDetail(id);
    } catch (e) { toast(e.message); }
  };
  window.__del = async (id) => {
    const m = byId.get(id);
    if (!m) return;
    if (!confirm('«' + m.name + '» болон түүний холбоосуудыг устгах уу?')) return;
    try {
      await post('/api/members/' + id + '/delete', {});
      window.__closeModal();
      $('panel').classList.add('hidden');
      selected = null;
      if (focus === id) focus = null;
      toast('Устгалаа ✓');
      await refresh();
    } catch (e) { toast(e.message); }
  };

  // ---------- сануулга ----------
  // Бүх төхөөрөмж дээр мэдэгдэл асаах төлөв (iPhone/Android/таблет/PC)
  async function pushDeviceState() {
    let sub = null;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) sub = await reg.pushManager.getSubscription();
      }
    } catch (e) { sub = null; }
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = (window.navigator.standalone === true) ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    return { on: perm === 'granted' && !!sub, perm, isIOS, standalone };
  }
  window.__bdayPush = async () => {
    try {
      await window.__pushOn();
    } finally {
      // Төлөвийг дахин зурна (ассан бол «Мэдэгдэл идэвхтэй ✅»)
      if (typeof window.__reminders === 'function') window.__reminders(window.__remPage || 1, window.__remTab || 'up');
    }
  };
  // Баяр/төрсөн өдрийн дүрс — «MN» үсэг эсвэл хоосон дүрсний оронд өнгөт SVG
  const HOLI_ICON = '<svg class="rem-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">' +
    '<rect x="3.2" y="5.2" width="17.6" height="15.6" rx="4" fill="#FFF7ED" stroke="#F97316" stroke-width="1.7"/>' +
    '<path d="M3.2 10.4h17.6" stroke="#F97316" stroke-width="1.7"/>' +
    '<path d="M8 3.2v3.4M16 3.2v3.4" stroke="#F97316" stroke-width="1.9" stroke-linecap="round"/>' +
    '<path d="m12 12.6.95 2 2.2.3-1.6 1.5.4 2.15L12 17.5l-1.95 1.05.4-2.15-1.6-1.5 2.2-.3z" fill="#F59E0B"/>' +
    '</svg>';
  window.__reminders = async (page, tab) => {
    try {
      // Таб: 'up' = удахгүй болох (анхдагч), 'past' = өнгөрсөн
      const tb = (tab || window.__remTab) === 'past' ? 'past' : 'up';
      window.__remTab = tb;
      // Бүх бичлэгийг нэг дор авна — жагсаалт нь гүйлгэдэг (хуудаслалт байхгүй)
      const j = await getJson('/api/reminders?limit=500' + (tb === 'past' ? '&past=1' : ''));
      const ps = await pushDeviceState();
      const agoText = (d) => {
        const n = Math.abs(d);
        if (n === 1) return 'Өчигдөр';
        return n + ' хоногийн өмнө';
      };
      const rows = j.items.map(it => {
        const isB = it.kind === 'b';
        // Төрсөн өдөр — жижиг дугуй профайл зураг (32px), баяр — өнгөт SVG дүрс
        const initial = escapeHtml(((it.name || '?').trim().charAt(0) || '?').toUpperCase());
        const av = isB
          ? '<span class="rem-av"><span class="rem-av-i">' + initial + '</span>' +
            '<img src="/api/members/' + it.id + '/photo" alt="" loading="lazy" onerror="this.remove()"></span>'
          : '<span class="rem-av rem-av-h">' + HOLI_ICON + '</span>';
        const mid = isB
          ? '<div class="rem-nm">' + (it.pat ? '<span class="rem-pat">' + escapeHtml(it.pat) + '</span> ' : '') +
            escapeHtml(it.name) + '</div>' +
            '<div class="rem-sub">' + (it.age != null && it.age > 0
              ? it.age + ' нас ' + (tb === 'past' ? 'хүрсэн' : 'хүрнэ') : 'Төрсөн өдөр') + '</div>'
          : '<div class="rem-nm">' + escapeHtml(it.name) + '</div><div class="rem-sub">Нийтээр амардаг баяр</div>';
        const when = tb === 'past' ? agoText(it.days) : (it.days === 0 ? 'Өнөөдөр' : it.days + ' хоног');
        // Тодорхой огноо — тоолуурын доор жижиг саарал бичгээр («11-р сарын 17»)
        const dt = new Date();
        dt.setHours(12, 0, 0, 0);
        dt.setDate(dt.getDate() + (it.days || 0));
        const dateTxt = dt.getMonth() + 1 + '-р сарын ' + dt.getDate();
        return '<div class="rem-row">' + av + '<div class="rem-mid">' + mid + '</div>' +
          '<div class="rem-right"><div class="rem-when' + (it.days === 0 ? ' today' : '') + '">' + when +
          '</div><div class="rem-date">' + dateTxt + '</div></div></div>';
      }).join('') ||
        '<div class="rem-empty">' + (tb === 'past'
          ? 'Сүүлийн жилд болж өнгөрсөн тэмдэглэлт өдөр олдохгүй байна.'
          : 'Тэмдэглэлт өдөр олдохгүй байна.') + '</div>';
      const seg = (k, label) => '<button class="seg' + (k === tb ? ' on' : '') +
        '" onclick="window.__reminders(1,\'' + k + '\')">' + label + '</button>';
      const body =
        '<div class="rem-tabs">' + seg('up', 'Удахгүй болох') + seg('past', 'Өнгөрсөн') + '</div>' +
        '<div class="rem-list">' + rows + '</div>' +
        '<div class="rem-legend">' + HOLI_ICON + '<span>Бүх нийтээр амарч тэмдэглэдэг баярууд</span></div>' +
        (!ps.on && ps.isIOS && !ps.standalone
          ? '<div class="rem-ios">📱 iPhone дээр мэдэгдэл авахын тулд Safari-аас <b>«Нүүр дэлгэцэд нэмэх»</b> хийсэн апп дотор нээнэ үү — энгийн таб дээр ирэхгүй.</div>'
          : '');
      const foot = '<div class="rem-foot">' +
        '<button class="sw' + (ps.on ? ' on' : '') + '" id="remSw" title="' +
        (ps.on ? 'Асаалттай' : 'Асаах') + '" aria-pressed="' + (ps.on ? 'true' : 'false') + '" onclick="window.__bdayPush()"><i></i></button>' +
        '<div class="rem-foot-l">Төрсөн өдөр, баярын өдрүүдэд мэдэгдэх</div>' +
        '<button onclick="window.__closeModal()">Хаах</button></div>';
      openModal('🎂 Төрсөн өдөр ба баярын сануулга', body, foot);
    } catch (e) { toast(e.message); }
  };

  // ---------- цомог ----------
  window.__albums = async () => {
    try {
      const j = await getJson('/api/albums');
      const rows = j.albums.map(a =>
        '<div class="list-row"><span class="grow" onclick="window.__openAlbum(' + a.id + ')">🖼 ' + escapeHtml(a.title) +
        (a.visibility === 'private' ? ' 🔒' : a.visibility === 'circle' ? ' 👥' : ' 🌐') + '</span>' +
        '<span style="opacity:.6">' + a.photos + ' зураг</span></div>').join('') ||
        '<div style="color:var(--muted)">Цомог байхгүй байна.</div>';
      openModal('🖼 Зургийн цомог', rows +
        '<div style="margin-top:12px"><button class="primary" onclick="window.__newAlbum()">＋ Шинэ цомог</button></div>');
    } catch (e) { toast(e.message); }
  };
  window.__newAlbum = async () => {
    const j = await getJson('/api/pick?kind=any&of=0');
    openModal('＋ Шинэ цомог',
      '<label class="f">Нэр</label><input type="text" id="al_title" placeholder="Гэр бүлийн зургууд">' +
      '<label class="f">Хэний хамааралд харагдах вэ?</label>' +
      '<label class="radio"><input type="radio" name="al_vis" value="all" checked> 🌐 Бүх хамаарал (модонд холбогдсон бүгд)</label>' +
      '<label class="radio"><input type="radio" name="al_vis" value="private"> 🔒 Зөвхөн би (хувийн)</label>' +
      '<label class="radio"><input type="radio" name="al_vis" value="circle"> 👥 Тодорхой хүний хамаарал</label>' +
      '<div id="al_circle" class="hidden"><div class="picker" style="max-height:160px">' +
      j.members.map(x => '<div data-id="' + x.id + '" onclick="this.classList.toggle(\'on\')">' +
        '<span style="flex:1">' + escapeHtml(x.name) + '</span></div>').join('') + '</div></div>',
      '<button onclick="window.__albums()">← Буцах</button>' +
      '<button class="primary" onclick="window.__saveAlbum()">Үүсгэх</button>');
    document.querySelectorAll('input[name="al_vis"]').forEach(r => r.onchange = () => {
      $('al_circle').classList.toggle('hidden', document.querySelector('input[name="al_vis"]:checked').value !== 'circle');
    });
    window.__saveAlbum = async () => {
      try {
        const vis = document.querySelector('input[name="al_vis"]:checked').value;
        const members = vis === 'circle'
          ? [...document.querySelectorAll('#al_circle .picker div.on')].map(d => Number(d.dataset.id)) : [];
        await post('/api/albums', { title: $('al_title').value, visibility: vis, members });
        toast('Цомог үүслээ ✓');
        window.__albums();
      } catch (e) { toast(e.message); }
    };
  };
  window.__openAlbum = async (id) => {
    try {
      const j = await getJson('/api/albums/' + id);
      const photos = j.photos.map(p =>
        '<div style="margin:6px 0"><img class="thumb" src="' + escapeHtml(p.url) + '" alt="">' +
        (p.caption ? '<div style="font-size:12px;color:var(--muted)">' + escapeHtml(p.caption) + '</div>' : '') + '</div>').join('') ||
        '<div style="color:var(--muted)">Зураг байхгүй байна.</div>';
      openModal('🖼 ' + escapeHtml(j.album.title), photos +
        '<div style="margin-top:10px"><label class="f">Шинэ зураг (URL)</label>' +
        '<input type="text" id="ph_url" placeholder="https://..."><input type="text" id="ph_cap" placeholder="Тайлбар" style="margin-top:6px">' +
        '<button style="margin-top:8px" onclick="window.__addPhoto(' + id + ')">＋ Нэмэх</button></div>',
        '<button onclick="window.__albums()">← Цомогийн жагсаалт</button>');
    } catch (e) { toast(e.message); }
  };
  window.__addPhoto = async (id) => {
    try {
      await post('/api/albums/' + id + '/photos', { url: $('ph_url').value, caption: $('ph_cap').value });
      toast('Нэмэгдлээ ✓');
      window.__openAlbum(id);
    } catch (e) { toast(e.message); }
  };

  // ---------- Түвшин ахих баяр хүргэлт (нэг түвшинд нэг л удаа) ----------
  // Түвшин бүр өөрийн дүрс, өнгө, хөдөлгөөнтэй.
  const LEVEL_FX = {
    1:  { emoji: '🌱', cls: 'fx-sprout', colors: ['#8ce99a', '#69db7c', '#b2f2bb', '#d8f5a2'] },
    2:  { emoji: '🌿', cls: 'fx-sway',   colors: ['#69db7c', '#38d9a9', '#96f2d7', '#c3fae8'] },
    3:  { emoji: '🌱✨', cls: 'fx-bounce', colors: ['#94d82d', '#ffd43b', '#d8f5a2', '#fcc419'] },
    4:  { emoji: '🍃', cls: 'fx-sway',   colors: ['#8ce99a', '#51cf66', '#c0eb75', '#a9e34b'] },
    5:  { emoji: '🌿🌳', cls: 'fx-rise',   colors: ['#40c057', '#2f9e44', '#a9e34b', '#d3f9d8'] },
    6:  { emoji: '🌳', cls: 'fx-rise',   colors: ['#2f9e44', '#37b24d', '#e6fcf5', '#8ce99a'] },
    7:  { emoji: '📜', cls: 'fx-sway',   colors: ['#e0a458', '#f08c00', '#ffe8cc', '#ffd8a8'] },
    8:  { emoji: '✍️', cls: 'fx-spin',   colors: ['#e0a458', '#4c6ef5', '#ffe8cc', '#a5d8ff'] },
    9:  { emoji: '📖', cls: 'fx-bounce', colors: ['#4c6ef5', '#74c0fc', '#dbe4ff', '#ffd43b'] },
    10: { emoji: '👑', cls: 'fx-crown',  colors: ['#ffd43b', '#fab005', '#fff3bf', '#ffe066'] }
  };

  function levelUpConfetti(host, colors) {
    const N = 64;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('i');
      p.className = 'lvup-p';
      const c = colors[i % colors.length];
      const w = 6 + Math.round(Math.random() * 7);
      p.style.left = Math.round(Math.random() * 100) + '%';
      p.style.width = w + 'px';
      p.style.height = (8 + Math.round(Math.random() * 10)) + 'px';
      p.style.background = c;
      p.style.opacity = String(0.75 + Math.random() * 0.25);
      if (i % 5 === 0) p.style.borderRadius = '50%';
      p.style.animationDuration = (2.1 + Math.random() * 2.2).toFixed(2) + 's';
      p.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
      host.appendChild(p);
    }
    setTimeout(() => { host.innerHTML = ''; }, 6500);
  }

  function showLevelUp(lu) {
    if (!lu || document.getElementById('lvup')) return;
    const fx = LEVEL_FX[lu.n] || LEVEL_FX[1];
    const fmt = (n) => String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const wrap = document.createElement('div');
    wrap.id = 'lvup';
    wrap.className = 'lvup-wrap';
    wrap.innerHTML =
      '<div class="lvup-card">' +
        '<div class="lvup-glow" style="background:radial-gradient(circle,' + fx.colors[0] + ',' + fx.colors[1] + '00 72%)"></div>' +
        '<div class="lvup-title">Баяр хүргэе!</div>' +
        '<span class="lvup-emoji ' + fx.cls + '">' + fx.emoji + '</span>' +
        '<div class="lvup-name">Та <b>«' + escapeHtml(String(lu.name || '')) + '»</b> түвшинд хүрлээ!</div>' +
        '<div class="lvup-sub">' + lu.n + '-р түвшин · ' + fmt(lu.score) + ' оноо</div>' +
        '<button class="lvup-btn" id="lvup-ok">Үргэлжлүүлэх</button>' +
      '</div>' +
      '<div class="lvup-confetti" id="lvup-cf"></div>';
    document.body.appendChild(wrap);
    levelUpConfetti(wrap.querySelector('#lvup-cf'), fx.colors);
    const close = () => { const w = document.getElementById('lvup'); if (w) w.remove(); };
    // Зөвхөн «Үргэлжлүүлэх» товчоор хаагдана — өөрөө алга болохгүй.
    wrap.querySelector('#lvup-ok').addEventListener('click', close);
  }

  async function levelUpCheck() {
    try {
      const j = await getJson('/api/level-up');
      const lu = j && j.levelUp;
      if (!lu) return;
      showLevelUp(lu);
      await post('/api/level-seen', { n: lu.n });
    } catch (e) { /* мэдэгдэл гаргаж чадаагүй — модонд нөлөөлөхгүй */ }
  }

  // ---------- оноо / түвшин / лидерүүд ----------
  window.__scores = async () => {
    try {
      const j = await getJson('/api/scores');
      openModal('🏆 Онооны самбар', scoresHtml(j),
        '<button onclick="window.__closeModal()">Хаах</button>', 'sc-modal');
    } catch (e) { toast(e.message); }
  };
  // Онооны самбар — дэлгэцэнд 2 багана, утсанд 2 таб
  window.__scTab = (k) => {
    document.querySelectorAll('.sc-tabs .seg').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    const a = document.getElementById('scColA'), b = document.getElementById('scColB');
    if (a) a.classList.toggle('sc-off', k !== 'a');
    if (b) b.classList.toggle('sc-off', k !== 'b');
  };
  function scoresHtml(j) {
    const me = j.me, lv = me.level, nx = me.next;
    const fmt = (n) => String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    // ── ЗҮҮН БАГАНА: түвшин + 10 шат + лидерүүд ──
    let left = '';
    left += '<div class="sc-head">' +
      '<div class="sc-ring" style="--p:' + (me.pct || 0) + '"><span>' + lv.n + '</span></div>' +
      '<div class="sc-hinfo"><div class="sc-lvl">' + escapeHtml(lv.name) + '</div>' +
      '<div class="sc-pts">' + fmt(me.score) + ' оноо</div>' +
      '<div class="sc-bar"><i style="width:' + (me.pct || 0) + '%"></i></div>' +
      '<div class="sc-next">' + (nx
        ? 'Дараагийн түвшин «' + escapeHtml(nx.name) + '» (' + fmt(nx.at) + ' оноо) хүртэл <b>' + fmt(me.need) + ' оноо</b>'
        : 'Дээд түвшинд хүрсэн 🎉') + '</div></div></div>';
    // 10 шат — нэг эгнээнд багтана (хэвтээ скроллгүй)
    left += '<div class="sc-track">' + j.levels.map((l) => {
      const cls = l.n === lv.n ? 'on' : (l.n < lv.n ? 'done' : '');
      return '<div class="sc-node ' + cls + '"><i>' + l.n + '</i><span>' + escapeHtml(l.name) + '</span></div>';
    }).join('') + '</div>';
    // 🏆 Системийн лидерүүд
    const dlt = me.delta > 0 ? '<span class="sc-up">▲ +' + me.delta + '</span>'
      : me.delta < 0 ? '<span class="sc-dn">▼ ' + Math.abs(me.delta) + '</span>' : '';
    left += '<div class="sc-sec">🏆 Системийн лидерүүд</div>' +
      '<div class="sc-note">Таны одоогийн байрлал: <b>#' + me.rank + '</b> · ' + fmt(me.score) + ' оноо · ' +
      me.users + ' хэрэглэгчээс ' + dlt + '</div>' +
      '<div class="sc-board"><div class="sc-row head"><span>БАЙР</span><span>НЭР</span><span>ТҮВШИН</span><span>ОНОО</span></div>';
    const medals = ['🥇', '🥈', '🥉'];
    const seenR = new Set();
    left += j.board.map((b) => {
      if (!b) return '<div class="sc-row"><span class="sc-rk">…</span><span class="sc-nm"></span><span class="sc-lv"></span><span class="sc-sc"></span></div>';
      let rk;
      if (b.rank <= 3 && !seenR.has(b.rank)) { seenR.add(b.rank); rk = medals[b.rank - 1]; }
      else rk = String(b.rank);
      return '<div class="sc-row' + (b.me ? ' me' : '') + '">' +
        '<span class="sc-rk">' + rk + '</span>' +
        '<span class="sc-nm">' + (b.me ? '<b class="sc-you">ТА</b>' : '') +
        '<span class="sc-nmt">' + escapeHtml(b.name) + '</span></span>' +
        '<span class="sc-lv">' + escapeHtml(b.level) + '</span>' +
        '<span class="sc-sc">' + fmt(b.score) + '</span></div>';
    }).join('') + '</div>' +
      '<div class="sc-hint">Байрлал нь хэрэглэгч бүрийн өөрөө нэмсэн мэдээллээр бодогдсон оноогоор тодорхойлогдоно.</div>';
    // ── БАРУУН БАГАНА: онооны задаргаа + дүрэм + бүртгэл ──
    let right = '';
    const bd = [['Хүмүүсийн мэдээлэл', me.breakdown.info || 0],
      ['Зураг', me.breakdown.photo || 0], ['Огноотой үйл явдал', me.breakdown.event || 0]]
      .concat((me.breakdown.legacy || 0) ? [['Өмнөх бүртгэлээс шилжүүлсэн', me.breakdown.legacy]] : []);
    const maxBd = Math.max(1, bd[0][1], bd[1][1], bd[2][1]);
    right += '<div class="sc-sec sc-sec-first">Оноо юунаас бүрдсэн</div>' + bd.map((x) =>
      '<div class="sc-bd"><span>' + x[0] + '</span><span class="sc-bar"><i style="width:' +
      Math.round(x[1] / maxBd * 100) + '%"></i></span><b>' + fmt(x[1]) + '</b></div>').join('');
    // Оноо хэрхэн тооцогддог вэ? — эвхдэг (accordion)
    right += '<details class="sc-acc"><summary>Оноо хэрхэн тооцогддог вэ?</summary>' +
      '<div class="sc-acc-body">' + j.rules.map((r) => '<div class="sc-rule"><span>' + escapeHtml(r.label) + '</span><b class="' +
        (r.cap ? 'sc-cap' : 'sc-plus') + '">' + (r.cap ? '' : '+') + fmt(r.points) + '</b></div>').join('') +
      '</div></details>';
    if (j.records && j.records.length) {
      right += '<div class="sc-sec">Миний бүртгэл</div>' +
        j.records.map((r) => '<div class="sc-rec"><span>' + escapeHtml(r.member) + ' — ' +
          escapeHtml(r.label) + '</span><b class="sc-plus">+' + fmt(r.points) + '</b><small>' +
          escapeHtml(r.at) + '</small></div>').join('');
    }
    const tab = (k, label) => '<button class="seg' + (k === 'a' ? ' on' : '') + '" data-k="' + k +
      '" onclick="window.__scTab(\'' + k + '\')">' + label + '</button>';
    return '<div class="sc-tabs">' + tab('a', '🏆 Лидерүүд') + tab('b', '⭐ Миний оноо &amp; Дүрэм') + '</div>' +
      '<div class="sc-cols">' +
        '<div class="sc-col" id="scColA">' + left + '</div>' +
        '<div class="sc-col sc-off" id="scColB">' + right + '</div>' +
      '</div>';
  }

  // --- нэмэлт зураг / огноотой үйл явдал (оноотой) ---
  window.__addMemPhoto = (id) => {
    openModal('🖼 Нэмэлт зураг нэмэх',
      '<div style="font-size:12px;color:var(--muted)">Нэг хүний хамгийн ихдээ <b>5</b> нэмэлт зураг. Тус бүр <b>+3 оноо</b>.</div>' +
      '<label class="f">Зураг (утас/компьютерээс сонгоно)</label>' +
      '<button type="button" onclick="document.getElementById(\'mp_file\').click()">📷 Зураг оруулах</button>' +
      '<input type="file" id="mp_file" accept="image/*" style="display:none">' +
      '<label class="f">Эсвэл линк</label>' +
      '<input type="text" id="mp_url" placeholder="/img/16 эсвэл https://...">' +
      '<div class="photo-prev" id="mp_prev"></div>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveMemPhoto(' + id + ')">＋ Нэмэх</button>');
    const f = $('mp_file'), inp = $('mp_url');
    if (inp) inp.oninput = () => { $('mp_prev').innerHTML = photoPrevHtml(inp.value.trim()); };
    if (f) f.onchange = async () => {
      try {
        if (!f.files || !f.files[0]) return;
        const url = await resizePhoto(f.files[0]);
        inp.value = url;
        $('mp_prev').innerHTML = photoPrevHtml(url);
        f.value = '';
      } catch (e) { toast(e.message); }
    };
  };
  // НҮҮР ЗУРАГ (cover): файлаас сонгож, картны харьцаагаар ЧИРЖ ЗӨӨХ + ZOOM
  // хийж тааруулна (cropModal), дараа нь сервер рүү илгээнэ.
  window.__coverPick = (id) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.onchange = async () => {
      try {
        if (!inp.files || !inp.files[0]) return;
        const m0 = byId.get(id) || {};
        // Эх зургийг бүтнээр нь хадгалаад, зөвхөн харагдах хэмжээ/байрлалыг тааруулна
        const r = await pickCover(inp.files[0], { name: coverLabel(id, m0) });
        if (r) await window.__coverSave(id, r.url, r.params);
      } catch (e) { toast(e.message || 'Энэ зургийг тайрч чадсангүй'); }
      finally { inp.remove(); }
    };
    inp.click();
  };
  // Одоо байгаа нүүр зургийг ДАХИН тааруулах — дахин хуулах шаардлагагүй.
  // Зураг байхгүй бол «Нүүр зураг»-ын сонголт руу шилжинэ.
  function coverLabel(id, m) {
    const pat = patronymicOf(id);
    return { name: (pat ? pat + ' ' : '') + (m.name || '') };
  }
  // Серверийн lazy линкээр ирсэн зургийг өгөгдлийн URL болгож хөрвүүлнэ
  function toDataUrl(src) {
    if (!src || src.indexOf('data:') === 0) return Promise.resolve(src);
    return fetch(src, { credentials: 'same-origin' })
      .then(r => r.blob())
      .then(b => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || ''));
        fr.onerror = () => rej(new Error('Зургийг уншиж чадсангүй'));
        fr.readAsDataURL(b);
      }));
  }
  window.__coverAdjust = async (id) => {
    const m = byId.get(id) || {};
    let src = String(m.photo || '').trim();
    if (!src) { toast('Эхлээд нүүр зураг сонгоно уу'); window.__coverPick(id); return; }
    if (src.indexOf('data:') !== 0 && src.indexOf('/api/members/') !== 0) {
      toast('Гадаад линкээр орсон зураг — шинээр «Нүүр зураг»-аас сонгоно уу');
      return;
    }
    try {
      const dataUrl = await toDataUrl(src);
      const pat = patronymicOf(id);
      const prm = await cropModal(dataUrl, {
        name: (pat ? pat + ' ' : '') + (m.name || ''),
        meta: [yearOf(m), m.alive === 0 ? 'нас барсан' : ''].filter(Boolean).join(' · '),
        params: { zoom: m.pz, cx: m.pcx, cy: m.pcy }
      });
      if (prm) await window.__coverSave(id, dataUrl, prm);
    } catch (e) { toast(e.message || 'Зургийг нээж чадсангүй'); }
  };
  window.__coverSave = async (id, url, p) => {
    try {
      const prm = p || {};
      const r = await post('/api/members/' + id + '/cover', {
        url, zoom: prm.zoom, cx: prm.cx, cy: prm.cy, ar: prm.ar
      });
      const mm = byId.get(id);
      if (mm) {
        mm.photo = url;
        mm.pz = r.pz == null ? null : r.pz;
        mm.pcx = r.pcx == null ? null : r.pcx;
        mm.pcy = r.pcy == null ? null : r.pcy;
        mm.par = r.par == null ? null : r.par;
      }
      // Мод дахин зурагдахгүй — зөвхөн тухайн картын зургийг солино
      setCardPhoto(id, url, mm);
      toast('Нүүр зураг солигдлоо ✓');
      window.__detail(id);
    } catch (e) { toast(e.message); }
  };
  window.__saveMemPhoto = async (id) => {
    try {
      const r = await post('/api/members/' + id + '/photos', { url: $('mp_url').value });
      window.__closeModal();
      // Нүүр зураг хоосон байсан бол сервер эхний зургийг нүүр болгоно — карт дээр шууд харагдана
      const mm = byId.get(id);
      if (mm && r.photo) {
        mm.photo = r.photo; mm.pz = null; mm.pcx = null; mm.pcy = null; mm.par = null;
        setCardPhoto(id, r.photo, mm);
      }
      toast(r.points ? 'Нэмэгдлээ ✓ +' + r.points + ' оноо' : 'Нэмэгдлээ ✓');
      window.__detail(id);
    } catch (e) { toast(e.message); }
  };
  // ---------- ЗУРГИЙН ТОМ ХАРАГДАЦ · КОММЕНТ · НҮҮР ЗУРАГ ----------
  const lbBox = () => document.getElementById('lb');
  window.__lbClose = () => { const b = lbBox(); if (b) b.remove(); };
  // Lightbox-ийн жагсаалт (нүүр зураг + цомгийн зургууд) ба одоогийн байрлал
  let lbMid = 0, lbList = [], lbIdx = 0;
  window.__lbNav = (dir) => {
    if (lbList.length < 2) return;
    lbIdx = (lbIdx + dir + lbList.length) % lbList.length;
    window.__photoView(lbMid, lbList[lbIdx].pid);
  };
  window.__photoView = async (mid, pid) => {
    try {
      const mem = byId.get(mid) || {};
      const j = await getJson('/api/members/' + mid);
      const cover = (j.member && j.member.photo) || mem.photo || '';
      const photos = j.photos || [];
      const cur = pid > 0 ? photos.find(x => x.id === pid) : null;
      const url = cur ? cur.url : cover;
      if (!url) { toast('Зураг байхгүй'); return; }
      let cj = { comments: [] };
      try { cj = await getJson('/api/members/' + mid + '/photos/' + pid + '/comments'); } catch (e) {}
      const editable = !!mem.e, isCover = pid === 0, cm = cj.comments || [];
      // Шилжих жагсаалт: [0]=нүүр зураг, дараа нь цомгийн зургууд
      lbMid = mid;
      lbList = [];
      if (cover) lbList.push({ pid: 0, url: cover });
      photos.forEach(x => lbList.push({ pid: x.id, url: x.url }));
      const at = lbList.findIndex(x => x.pid === pid);
      lbIdx = at >= 0 ? at : 0;
      const many = lbList.length > 1;
      let h = '<div id="lb" style="position:fixed;inset:0;z-index:9999;background:rgba(12,10,8,.94);overflow:auto;-webkit-overflow-scrolling:touch">';
      h += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;color:#fff;position:sticky;top:0;background:rgba(12,10,8,.94);z-index:2">';
      h += '<b style="font-size:14px">' + escapeHtml(mem.name || '') + '</b>';
      h += '<span style="opacity:.7;font-size:12px">' + (isCover ? 'Нүүр зураг' : 'Зураг') +
        (many ? ' · ' + (lbIdx + 1) + '/' + lbList.length : '') + '</span><span style="flex:1"></span>';
      h += '<button onclick="window.__lbClose()" style="background:rgba(255,255,255,.16);color:#fff;border:0;border-radius:10px;padding:9px 13px;font-size:15px">✕</button></div>';
      const arrow = (dir, sign) => '<button onclick="event.stopPropagation();window.__lbNav(' + dir + ')" ' +
        'style="position:absolute;top:50%;' + (dir < 0 ? 'left:6px' : 'right:6px') + ';transform:translateY(-50%);' +
        'background:rgba(0,0,0,.45);color:#fff;border:0;border-radius:50%;width:44px;height:44px;font-size:24px;line-height:1;z-index:3">' + sign + '</button>';
      h += '<div id="lb_wrap" style="position:relative;text-align:center;padding:0 8px;touch-action:pan-y;user-select:none">' +
        (many ? arrow(-1, '‹') : '') +
        '<img id="lb_img" src="' + escapeHtml(url) + '" alt="" style="max-width:100%;max-height:58vh;border-radius:12px;object-fit:contain;background:#000">' +
        (many ? arrow(1, '›') : '') + '</div>';
      let bs = '';
      if (editable && !isCover) bs += '<button onclick="window.__setCover(' + mid + ',' + pid + ')" style="flex:1;background:#f0b73e;color:#3a2a00;border:0;border-radius:12px;padding:12px;font-weight:700">⭐ Нүүр зураг болгох</button>';
      if (editable) bs += '<button onclick="window.__lbClose();window.__addMemPhoto(' + mid + ')" style="flex:1;background:rgba(255,255,255,.16);color:#fff;border:0;border-radius:12px;padding:12px">＋ Зураг нэмэх</button>';
      if (editable && !isCover) bs += '<button onclick="window.__delPhoto(' + mid + ',' + pid + ')" style="background:rgba(192,57,43,.9);color:#fff;border:0;border-radius:12px;padding:12px">🗑</button>';
      if (bs) h += '<div style="display:flex;gap:8px;padding:10px 12px">' + bs + '</div>';
      h += '<div style="background:#fff;margin:6px 8px 24px;border-radius:14px;padding:12px">';
      h += '<div style="font-weight:700;font-size:13px;margin-bottom:4px">💬 Коммент (' + cm.length + ')</div>';
      h += '<div id="lb_cm">' + (cm.length ? cm.map(function (c) {
        return '<div style="padding:8px 0;border-bottom:1px solid rgba(0,0,0,.07)">' +
          '<div style="display:flex;align-items:center;gap:6px"><b style="font-size:12px">' + escapeHtml(c.user_name || 'Хэрэглэгч') + '</b>' +
          '<span style="font-size:11px;opacity:.5">' + escapeHtml(String(c.created_at || '').slice(0, 16)) + '</span>' +
          '<span style="flex:1"></span>' +
          (c.mine ? '<button onclick="window.__lbDel(' + c.id + ',' + mid + ',' + pid + ')" style="background:none;border:0;color:#c0392b;font-size:12px">✕</button>' : '') +
          '</div><div style="font-size:13.5px;line-height:1.5;word-break:break-word">' + escapeHtml(c.text || '') + '</div></div>';
      }).join('') : '<div style="opacity:.55;font-size:13px;padding:4px 0">Одоохондоо коммент байхгүй — эхнийхийг бичээрэй.</div>') + '</div>';
      h += '<div style="display:flex;gap:8px;margin-top:10px">' +
        '<input id="lb_in" type="text" maxlength="500" placeholder="Коммент бичих…" style="flex:1;min-width:0;border:1px solid rgba(0,0,0,.16);border-radius:12px;padding:11px;font-size:14px">' +
        '<button onclick="window.__lbSend(' + mid + ',' + pid + ')" style="background:#2fae6a;color:#fff;border:0;border-radius:12px;padding:0 16px;font-size:16px;font-weight:700">➤</button></div>';
      h += '</div></div>';
      const old = lbBox(); if (old) old.remove();
      document.body.insertAdjacentHTML('beforeend', h);
      const inp = document.getElementById('lb_in');
      if (inp) inp.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); window.__lbSend(mid, pid); }
      });
      // Хуруугаар гулсуулах (swipe) — гар утсан дээр зургуудын хооронд шилжинэ
      const wrap = document.getElementById('lb_wrap');
      if (wrap && many) {
        let x0 = null, y0 = null;
        wrap.addEventListener('touchstart', (ev) => {
          const t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY;
        }, { passive: true });
        wrap.addEventListener('touchend', (ev) => {
          if (x0 == null) return;
          const t = ev.changedTouches[0];
          const dx = t.clientX - x0, dy = t.clientY - y0;
          x0 = null;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) window.__lbNav(dx < 0 ? 1 : -1);
        }, { passive: true });
      }
    } catch (e) { toast(e.message); }
  };
  window.__lbSend = async (mid, pid) => {
    try {
      const inp = document.getElementById('lb_in');
      const text = ((inp && inp.value) || '').trim();
      if (!text) { toast('Коммент хоосон байна'); return; }
      await post('/api/members/' + mid + '/photos/' + pid + '/comments', { text: text });
      await window.__photoView(mid, pid);
      const i2 = document.getElementById('lb_in'); if (i2) i2.focus();
    } catch (e) { toast(e.message); }
  };
  window.__lbDel = async (cid, mid, pid) => {
    try { await post('/api/comments/' + cid + '/delete', {}); await window.__photoView(mid, pid); }
    catch (e) { toast(e.message); }
  };
  window.__delPhoto = async (mid, pid) => {
    if (!confirm('Энэ зургийг устгах уу?')) return;
    try {
      await post('/api/members/' + mid + '/photos/' + pid + '/delete', {});
      window.__lbClose();
      toast('Зураг устгагдлаа');
      window.__detail(mid);
    } catch (e) { toast(e.message); }
  };
  window.__setCover = async (mid, pid) => {
    try {
      const r = await post('/api/members/' + mid + '/cover', { photo_id: pid });
      const mm = byId.get(mid);
      if (mm) mm.photo = r.photo || '';
      window.__lbClose();
      toast('Нүүр зураг боллоо ✓');
      if (typeof render === 'function') render();
      window.__detail(mid);
    } catch (e) { toast(e.message); }
  };

  let evPhotoUrl = '';
  window.__addMemEvent = (id) => {
    evPhotoUrl = '';
    openModal('📅 Огноотой үйл явдал нэмэх',
      '<div style="font-size:12px;color:var(--muted)">Нэг хүний хамгийн ихдээ <b>4</b> үйл явдал. Тус бүр <b>+5 оноо</b>.</div>' +
      '<label class="f">Огноо</label><input type="date" id="me_date">' +
      '<label class="f">Үйл явдлын нэр</label><input type="text" id="me_title" placeholder="Жишээ: Ахын хурим">' +
      '<label class="f">Зураг (сонголтоор)</label>' +
      '<button type="button" onclick="document.getElementById(\'me_file\').click()">📷 Зураг оруулах</button>' +
      '<input type="file" id="me_file" accept="image/*" style="display:none">' +
      '<div class="photo-prev" id="me_prev"></div>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__saveMemEvent(' + id + ')">＋ Нэмэх</button>');
    const f = $('me_file');
    if (f) f.onchange = async () => {
      try {
        if (!f.files || !f.files[0]) return;
        const pv = $('me_prev');
        if (pv) pv.innerHTML = '<span style="font-size:12px;color:var(--muted)">Зураг бэлтгэж байна…</span>';
        evPhotoUrl = await resizePhoto(f.files[0]);
        if (pv) pv.innerHTML = '<img src="' + evPhotoUrl + '" alt="" style="max-width:130px;max-height:130px;border-radius:10px;object-fit:cover">' +
          ' <button type="button" onclick="window.__evPhotoClear()" style="font-size:12px">✕</button>';
        f.value = '';
      } catch (e) { evPhotoUrl = ''; if ($('me_prev')) $('me_prev').innerHTML = ''; toast(e.message); }
    };
  };
  window.__evPhotoClear = () => { evPhotoUrl = ''; if ($('me_prev')) $('me_prev').innerHTML = ''; };
  window.__saveMemEvent = async (id) => {
    try {
      const r = await post('/api/members/' + id + '/events',
        { date: $('me_date').value, title: $('me_title').value, photo: evPhotoUrl || '' });
      evPhotoUrl = '';
      window.__closeModal();
      toast(r.points ? 'Нэмэгдлээ ✓ +' + r.points + ' оноо' : 'Нэмэгдлээ ✓');
      window.__detail(id);
    } catch (e) { toast(e.message); }
  };
  // Үйл явдлын зургийг томоор үзэх
  window.__evView = (src) => {
    const old = document.getElementById('evv'); if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'evv';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(12,10,8,.94);display:flex;align-items:center;justify-content:center;padding:12px';
    d.innerHTML = '<img src="' + src + '" alt="" style="max-width:100%;max-height:88vh;border-radius:12px;object-fit:contain">' +
      '<button style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,.16);color:#fff;border:0;border-radius:10px;padding:9px 13px;font-size:15px">✕</button>';
    d.querySelector('button').onclick = () => d.remove();
    d.onclick = (ev) => { if (ev.target === d) d.remove(); };
    document.body.appendChild(d);
  };

  // ---------- дизайн ----------
  window.__design = async () => {
    try {
      const d = await getJson('/api/design');
      // 10 өөр тем — өнгө, дэвсгэр, акцент, карт бүгд өөр
      const themeName = {
        blue: 'Цайвар цэнхэр', green: 'Ногоон', brown: 'Хүрэн', dark: 'Харанхуй',
        sand: 'Элсэн бор', rose: 'Сарнай ягаан', lilac: 'Нил ягаан',
        teal: 'Далайн цэнхэр', sunset: 'Нар жаргах', midnight: 'Шөнийн хөх'
      };
      const themeDot = {
        blue: '#3b82c4', green: '#2f9e5f', brown: '#a06a3f', dark: '#221b15',
        sand: '#c08a4a', rose: '#d0578a', lilac: '#7b5cd6',
        teal: '#159a9c', sunset: '#e2703a', midnight: '#243b5a'
      };
      const cardName = { round: 'Дугуй', square: 'Дөрвөлжин', big: 'Том зурагтай', best: 'Шилдэг' };
      const full = d.can_full;
      openModal('🎨 Дизайн', (
        full ? '<label class="f">Тем (өнгө)</label><div class="grid2">' +
          Object.keys(themeName).map(t => '<label class="radio"><input type="radio" name="d_theme" value="' + t + '"' +
            (d.theme === t ? ' checked' : '') + '> <i style="display:inline-block;width:11px;height:11px;border-radius:50%;' +
            'background:' + (themeDot[t] || '#999') + ';border:1px solid rgba(0,0,0,.18);margin-right:5px;vertical-align:-1px"></i>' +
            themeName[t] + '</label>').join('') + '</div>' +
          '<label class="f">Картны дизайн</label><div class="grid2">' +
          Object.keys(cardName).map(t => '<label class="radio"><input type="radio" name="d_card" value="' + t + '"' +
            (d.card === t ? ' checked' : '') + '> ' + cardName[t] + '</label>').join('') + '</div>' +
          '<label class="f">Холбоосын 3 өнгө</label><div class="row">' +
          '<input type="color" id="d_l1" value="' + d.link1 + '"><input type="color" id="d_l2" value="' + d.link2 + '">' +
          '<input type="color" id="d_l3" value="' + d.link3 + '"></div>' +
          '<label class="f">Нийтийн холбоо (нийтийн линк)</label>' +
          '<div class="row"><input type="text" id="d_slug" placeholder="laa-baatar" value="' + escapeHtml(d.public_slug || '') + '">' +
          '<label class="radio" style="flex:0 0 auto"><input type="checkbox" id="d_pub"' + (d.is_public === '1' ? ' checked' : '') + '> Нээлттэй</label></div>' +
          '<div class="copy" id="d_publink"></div>' : '') +
        '<label class="f">Telegram Bot Token' + (full ? '' : ' (админ)') + '</label>' +
        '<input type="password" id="d_tg_token" placeholder="' + (d.tg_set ? 'Аль хэдийн тохируулсан — солихыг хүсвэл оруулна уу' : '123456:ABC-...') + '">' +
        '<label class="f">Telegram Chat ID</label><input type="text" id="d_tg_chat" placeholder="' + escapeHtml(d.tg_chat || 'chat id') + '">' +
        (d.tg_set ? '<div style="font-size:12px;color:var(--muted)">✅ Telegram OTP тохируулсан байна.</div>' : ''),
        '<button onclick="window.__closeModal()">Цуцлах</button>' +
        '<button class="primary" onclick="window.__saveDesign()">Хадгалах</button>');
      const upd = () => {
        const el = $('d_publink');
        if (el) el.textContent = d.is_public === '1' || $('d_pub').checked
          ? location.origin + '/p/' + (($('d_slug').value || '—').trim()) : '';
      };
      if (full) { $('d_slug').oninput = upd; $('d_pub').onchange = upd; upd(); }
      window.__saveDesign = async () => {
        try {
          const patch = { tg_token: $('d_tg_token').value, tg_chat: $('d_tg_chat').value };
          if (full) {
            patch.theme = document.querySelector('input[name="d_theme"]:checked').value;
            patch.card = document.querySelector('input[name="d_card"]:checked').value;
            patch.link1 = $('d_l1').value; patch.link2 = $('d_l2').value; patch.link3 = $('d_l3').value;
            patch.public_slug = $('d_slug').value.trim();
            patch.is_public = $('d_pub').checked ? '1' : '0';
          }
          await post('/api/design', patch);
          toast('Хадгаллаа ✓');
          location.reload();
        } catch (e) { toast(e.message); }
      };
    } catch (e) { toast(e.message); }
  };

  // ---------- импорт / аудит / эрх ----------
  // ---------- backup ----------
  // Backup/Excel — ҮРГЭЛЖ сүлжээнээс, кэшгүй, цаг тэмдэгтэй нэрээр татна.
  // Ингэснээр саяхан нэмсэн өгөгдөл ч заавал шинэ файлд орно.
  function dlStamp() {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' +
      p(d.getHours()) + p(d.getMinutes());
  }
  async function downloadFresh(url, fallbackName) {
    try {
      toast('Бэлтгэж байна…');
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {
        cache: 'no-store', credentials: 'same-origin'
      });
      if (!r.ok) throw new Error('Алдаа ' + r.status);
      const blob = await r.blob();
      const cd = r.headers.get('content-disposition') || '';
      const m = /filename="?([^";]+)"?/.exec(cd);
      let name = m ? m[1] : fallbackName;
      const ext = (name.match(/\.[a-z0-9]+$/i) || [''])[0];
      const base = name.slice(0, name.length - ext.length).replace(/_\d{4}-\d{2}-\d{2}(_\d{4})?$/, '');
      name = base + '_' + dlStamp() + ext;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      toast('Татагдлаа ✓ ' + name);
    } catch (e) { toast(e.message); }
  }
  window.__backup = () => downloadFresh('/api/backup', 'ifamily-backup.json');
  // Бүх гишүүний мэдээлэл — Excel (.xlsx) файл татах
  window.__excel = () => downloadFresh('/api/export.xlsx', 'i-family-members.xlsx');
  // Бүх зүйл нэг ZIP-ээр — үргэлж шинэ дата
  window.__fullzip = () => downloadFresh('/api/export.zip', 'ifamily-FULL.zip');

  window.__import = () => {
    openModal('📋 Excel bulk import',
      '<div style="font-size:12px;color:var(--muted)">Excel-ээс хүснэгтийн <b>толгой мөртэй нь</b> хуулаад наана уу (эсвэл хуучин загвараар). Таслал/Tab-аар ялга:<br>' +
      '<code>Нэр, Хүйс, Төрсөн он, Төрсөн огноо, Нас барсан, Ургийн овог, Газар, Утас, Гавьяа, Намтар</code><br>' +
      'Нэмэлтээр <code>Аавын нэр</code>, <code>Ээжийн нэр</code> багана нэмвэл шууд холбоно. ' +
      '«Нас барсан» хоосон биш бол гишүүн нас барсан байдалтай орно.</div>' +
      '<textarea id="imp_text" style="min-height:160px" placeholder="Нэр, Хүйс, Төрсөн он, Төрсөн огноо, Нас барсан, Ургийн овог, Газар, Утас, Гавьяа, Намтар&#10;Батбаяр, Эрэгтэй, 1960, , , Мангуд, Улаанбаатар, 99112233, , Ахмад багш&#10;Оюун, Эмэгтэй, 1965, , , Гоо, Ховд, , , "></textarea>',
      '<button onclick="window.__closeModal()">Цуцлах</button>' +
      '<button class="primary" onclick="window.__runImport()">Импортлох</button>');
  };
  window.__runImport = async () => {
    try {
      const lines = $('imp_text').value.split('\n').map(l => l.trim()).filter(Boolean);
      const rows = lines.map(l => l.includes('\t') ? l.split('\t') : l.split(','));
      const j = await post('/api/import', { rows });
      toast('Нэмсэн: ' + j.created + ', холбосон: ' + j.linked);
      window.__closeModal();
      await refresh();
    } catch (e) { toast(e.message); }
  };
  window.__audit = async () => {
    try {
      const j = await getJson('/api/audit');
      const rows = j.rows.map(r =>
        '<div class="list-row"><span style="opacity:.6;font-size:11px">' + escapeHtml(String(r.at).slice(5, 16)) + '</span>' +
        '<span class="grow"><b>' + escapeHtml(roleName(r.uname || '')) + '</b> ' + escapeHtml(r.action) +
        ' <span style="opacity:.7">' + escapeHtml(r.detail || '') + '</span></span></div>').join('') ||
        '<div style="color:var(--muted)">Аудит хоосон.</div>';
      openModal('📜 Үйлдлийн аудит', '<div style="max-height:50vh;overflow:auto">' + rows + '</div>');
    } catch (e) { toast(e.message); }
  };
  // --- Push мэдэгдэл / ?req=1 → хүлээгдэж буй хүсэлт рүү шууд ---
  function openPendingRequests() {
    try {
      if (!S.viewer || (S.viewer.role !== 'admin' && S.viewer.role !== 'super')) return false;
      if (typeof window.__users !== 'function') return false;
      window.__users();
      return true;
    } catch (e) { return false; }
  }
  async function showPendingBanner() {
    try {
      if (!S.viewer || (S.viewer.role !== 'admin' && S.viewer.role !== 'super')) return;
      const j = await getJson('/api/link-requests');
      const n = (j.requests || []).length;
      if (!n || document.getElementById('reqBanner')) return;
      const d = document.createElement('div');
      d.id = 'reqBanner';
      d.style.cssText = 'position:fixed;left:8px;right:8px;bottom:12px;z-index:60;background:#1a7048;color:#fff;' +
        'border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:8px;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.25);font-size:14px;max-width:520px;margin:0 auto';
      d.innerHTML = '<span style="flex:1">⏳ ' + n + ' карт холбох хүсэлт</span>' +
        '<button style="background:#fff;color:#1a7048;border:0;border-radius:8px;padding:6px 10px;font-weight:700">Үзэх</button>' +
        '<button style="background:transparent;color:#fff;border:0;font-size:16px">✕</button>';
      const bs = d.querySelectorAll('button');
      bs[0].onclick = () => { d.remove(); window.__users(); };
      bs[1].onclick = () => d.remove();
      document.body.appendChild(d);
    } catch (e) {}
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'open-requests') openPendingRequests();
    });
  }
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const q = new URLSearchParams(location.search);
        if (q.get('req') === '1' && openPendingRequests()) {
          q.delete('req');
          history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
        }
      } catch (e) {}
      showPendingBanner();
      // 🎂 Өнөөдрийн төрсөн өдрийн мэдэгдлийг серверээр нэг удаа шалгуулна
      try {
        fetch('/api/birthday/notify', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      } catch (e) { /* push дэмжихгүй бол алгасна */ }
    }, 700);
  });
  // --- PWA: service worker + шууд суулгах ---
  try {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  } catch (e) {}
  window.__pwaPrompt = null;
  window.__pwaInstalled = () => !!(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();       // хөтчийн жижиг баннерыг зогсоож, өөрсдийн товчоор суулгана
    window.__pwaPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    window.__pwaPrompt = null;
    toast('Апп дэлгэцэнд нэмэгдлээ ✓');
  });
  window.__installPWA = async () => {
    if (window.__pwaInstalled()) { toast('Апп аль хэдийн дэлгэцэнд нэмэгдсэн ✓'); return; }
    const p = window.__pwaPrompt;
    if (p) {
      try {
        p.prompt();
        const r = await p.userChoice;
        window.__pwaPrompt = null;
        toast(r && r.outcome === 'accepted' ? 'Суулгаж байна… ✓' : 'Суулгалтыг цуцаллаа');
      } catch (e) { toast('Суулгах цонх гарсангүй — доорх зааврыг ашиглана уу'); }
      return;
    }
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    toast(iOS ? 'iPhone: Safari-гийн доорх ⬆ → «Дэлгэцэнд нэмэх»' : 'Хөтчийн ⋮ цэс → «Апп суулгах» / «Дэлгэцэнд нэмэх»');
  };

  // --- хувийн профайл ---
  // Lucide дүрснүүд (emoji-гийн оронд — vector, currentColor)
  const PF_IC = {
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    smartphone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    bell: '<path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M10.73 5.08A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.3 17.3 0 0 1-2.15 3.19"/><path d="M6.61 6.61A17.3 17.3 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 4.39-.92"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M2 2l20 20"/>',
    lock: '<rect x="3.5" y="11" width="17" height="10" rx="2"/><path d="M7.5 11V7a4.5 4.5 0 0 1 9 0v4"/>'
  };
  const pfIc = (n, sz) => '<svg class="pf-ic" viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) +
    '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + PF_IC[n] + '</svg>';
  // Нууц үгийн «нүд» — харах/нуух
  window.__pfEye = (id, btn) => {
    const el = $(id); if (!el) return;
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    if (btn) btn.innerHTML = pfIc(show ? 'eyeOff' : 'eye', 17);
    if (btn) btn.setAttribute('aria-label', show ? 'Нуух' : 'Харуулах');
  };
  window.__profile = async () => {
    try {
      const me = await getJson('/api/me');
      const ps = await pushDeviceState();
      // Холбодсон картын нэрийг аавын нэрээр бүтнээр харуулна: «Баярсайханы Дөлгөөн»
      const linkedName = me.member_name || '';
      const linkedPat = (me.member_id && linkedName) ? patronymicOf(me.member_id) : '';
      const linkedFull = linkedName ? (linkedPat ? linkedPat + ' ' + linkedName : linkedName) : '';
      const role = roleName(me.role);
      const isSuper = me.role === 'super' || /супер/i.test(role);
      // ── Профайлын хураангуй карт ──
      const initial = escapeHtml(((me.name || '?').trim().charAt(0) || '?').toUpperCase());
      const ava = me.member_id
        ? '<span class="pf-av"><span class="pf-av-i">' + initial + '</span>' +
          '<img src="/api/members/' + me.member_id + '/photo" alt="" onerror="this.remove()"></span>'
        : '<span class="pf-av"><span class="pf-av-i">' + initial + '</span></span>';
      let badges = '';
      if (isSuper || me.role === 'admin') {
        badges += '<span class="pf-badge role">' + pfIc('shield', 12) + escapeHtml(role) + '</span>';
      }
      if (linkedFull) {
        badges += '<span class="pf-badge ok">' + pfIc('check', 12) +
          'Холбогдсон: ' + escapeHtml(linkedFull) + '</span>';
      } else if (me.pending) {
        badges += '<span class="pf-badge wait">' + pfIc('link', 12) + 'Хүлээж байна: ' +
          escapeHtml(me.pending.card_name || ('#' + me.pending.member_id)) + '</span>';
      } else {
        badges += '<span class="pf-badge off">' + pfIc('link', 12) + 'Карт холбогдоогүй</span>';
      }
      let h = '<div class="pf-card">' + ava + '<div class="pf-info">' +
        '<div class="pf-name">' + escapeHtml(me.name || '—') + '</div>' +
        '<div class="pf-phone">' + pfIc('phone', 13) + '<span>' + escapeHtml(me.phone || '—') + '</span></div>' +
        '<div class="pf-badges">' + badges + '</div></div></div>';
      // ── Карт холбох (холбогдоогүй бол) ──
      if (!linkedFull) {
        h += '<div class="pf-row"><span class="pf-row-ic">' + pfIc('link', 17) + '</span>' +
          '<div class="pf-row-t"><b>Ургийн карттай холбох</b><span>' +
          (me.pending ? 'Хүсэлт админ зөвшөөрөхийг хүлээж байна.' : 'Мод дээрх өөрийн нэрээ сонгоод хүсэлт илгээнэ үү.') +
          '</span></div><button class="pf-btn sm" onclick="window.__profileLink()">Хүсэлт</button></div>';
      }
      // ── Нууц үг солих ──
      h += '<div class="pf-h">Нууц үг солих</div><div class="pf-group">';
      if (me.has_password) {
        h += '<div class="pf-field"><input type="password" id="pf_old" placeholder="Хуучин нууц үг" autocomplete="current-password">' +
          '<button type="button" class="pf-eye" aria-label="Харуулах" onclick="window.__pfEye(\'pf_old\',this)">' + pfIc('eye', 17) + '</button></div>';
      }
      h += '<div class="pf-field"><input type="password" id="pf_new" placeholder="Шинэ нууц үг (4+ тэмдэгт)" autocomplete="new-password">' +
        '<button type="button" class="pf-eye" aria-label="Харуулах" onclick="window.__pfEye(\'pf_new\',this)">' + pfIc('eye', 17) + '</button></div>' +
        '<button class="pf-btn primary" onclick="window.__pfSave()">' + pfIc('lock', 15) + 'Нууц үг хадгалах</button></div>';
      // ── PWA ──
      const pwaOn = window.__pwaInstalled();
      const pwaReady = !!window.__pwaPrompt;
      h += '<div class="pf-h">Апп ба мэдэгдэл</div>';
      h += '<div class="pf-row"><span class="pf-row-ic">' + pfIc('smartphone', 17) + '</span>' +
        '<div class="pf-row-t"><b>Дэлгэцэнд нэмэх (PWA)</b><span>' +
        (pwaOn ? 'Апп утасны дэлгэцэнд нэмэгдсэн байна.'
          : (pwaReady ? '«Суулгах» дарж дэлгэцэнд нэмнэ.'
            : 'Chrome ⋮ цэс → «Апп суулгах», Safari ⬆ → «Дэлгэцэнд нэмэх».')) +
        '</span></div>' +
        (pwaOn
          ? '<span class="pf-done">' + pfIc('check', 15) + '</span>'
          : '<button class="pf-btn sm" onclick="window.__installPWA()">Суулгах</button>') + '</div>';
      // ── Мэдэгдэл ──
      h += '<div class="pf-row"><span class="pf-row-ic">' + pfIc('bell', 17) + '</span>' +
        '<div class="pf-row-t"><b>Төрсөн өдрийн мэдэгдэл</b><span>' +
        (ps.on ? 'Асаалттай — өглөө 09:00-д мэдэгдэнэ.' : 'Төрсөн өдөр, баярын өдрүүдэд мэдэгдэнэ (өглөө 09:00).') +
        '</span></div>' +
        '<button class="sw' + (ps.on ? ' on' : '') + '" id="pfSw" aria-pressed="' + (ps.on ? 'true' : 'false') +
        '" onclick="window.__bdayPush()"><i></i></button></div>';
      openModal('Миний профайл', h, '<button onclick="window.__closeModal()">Хаах</button>', 'pf-modal');
    } catch (e) { toast(e.message); }
  };
  window.__profileLink = () => { window.__closeModal(); window.__linkReq(); };
  window.__pfSave = async () => {
    try {
      const body = { new_password: ($('pf_new') || {}).value || '' };
      const oldEl = $('pf_old');
      if (oldEl) body.old_password = oldEl.value;
      if (!body.new_password) throw wrapErr('Шинэ нууц үгээ оруулна уу');
      await post('/api/me/password', body);
      toast('Нууц үг солигдлоо ✓');
      window.__closeModal();
    } catch (e) { toast(e.message); }
  };

  // --- карт холбох хүсэлт (бүртгэлтэй, картгүй хэрэглэгч) ---
  const LRI = {
    search: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>'
  };
  window.__linkReq = async () => {
    try {
      window.__lrSel = null;
      const pend = S.pending_req;
      const j = await getJson('/api/link-requests/members');
      window.__lrItems = j.members || [];
      openModal('Карт холбох хүсэлт',
        (pend ? '<div style="font-size:12px;color:#64748B;margin-bottom:8px">⏳ Таны одоогийн хүсэлт: <b>«' + escapeHtml(pend.card_name || ('#' + pend.member_id)) + '»</b> (' + escapeHtml(String(pend.created_at || '').slice(5, 16)) + ') — өөрчлөх бол шинээр сонгоно уу.</div>' : '') +
        '<div style="font-size:12px;color:#64748B;margin-bottom:10px;line-height:1.5">Мод дээрх бүх нэрээс <b>өөрийн нэрээ</b> олж сонгоод хүсэлт илгээнэ үү — админ зөвшөөрсний дараа таны карт модонд гарна.</div>' +
        '<div class="lr-search"><span class="sic">' + LRI.search + '</span>' +
        '<input type="text" id="lr_q" oninput="window.__lrQ()" placeholder="Нэрээр хайх" autocomplete="off"></div>' +
        '<div class="lr-list" id="lr_list"></div>',
        '<button onclick="window.__closeModal()">Цуцлах</button>' +
        '<button class="primary" onclick="window.__lrSend()">Карт холбох хүсэлт илгээх</button>');
      window.__lrQ();
    } catch (e) { toast(e.message); }
  };
  window.__lrQ = () => {
    const el = $('lr_list'); if (!el) return;
    const q = (($('lr_q') || {}).value || '').toLowerCase().trim();
    const items = (window.__lrItems || []).filter(x => !q ||
      (String(x.name) + ' ' + (x.pat || '') + ' ' + (x.birth_year || '')).toLowerCase().includes(q));
    if (!items.length) { el.innerHTML = '<div class="lr-empty">Илэрц олдсонгүй</div>'; return; }
    el.innerHTML = items.map(x => {
      const yr = x.birth_date ? String(x.birth_date).slice(0, 4) : (x.birth_year || '');
      const initial = escapeHtml((String(x.name || '?').trim().charAt(0) || '?').toUpperCase());
      const av = '<span class="lr-av" data-i="' + initial + '">' +
        (x.photo ? '<img src="/api/members/' + x.id + '/photo" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>';
      const sub = [x.pat ? escapeHtml(x.pat) : '', yr ? escapeHtml(String(yr)) : ''].filter(Boolean).join(' · ');
      return '<div class="lr-item' + (window.__lrSel === x.id ? ' on' : '') + '" onclick="window.__lrPick(' + x.id + ')">' +
        av +
        '<span class="lr-nm"><b>' + escapeHtml(x.name) + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</span>' +
        '<span class="lr-chk">✓</span></div>';
    }).join('');
  };
  window.__lrPick = (id) => { window.__lrSel = id; window.__lrQ(); };
  window.__lrSend = async () => {
    try {
      if (!window.__lrSel) throw wrapErr('Жагсаалтаас өөрийн нэрээ сонгоно уу');
      await post('/api/link-requests', { member_id: window.__lrSel });
      window.__closeModal();
      toast('Хүсэлт илгээгдлээ ✓ — админ зөвшөөрөхийг хүлээнэ үү');
      await refresh();
    } catch (e) { toast(e.message); }
  };
  window.__lrApprove = async (id) => {
    try {
      await post('/api/link-requests/' + id + '/approve', {});
      toast('Зөвшөөрлөө ✓ — карт холбогдлоо');
      await refresh();
      await window.__users(true);
    } catch (e) { toast(e.message); await window.__users(true); }
  };
  window.__lrReject = async (id) => {
    try {
      await post('/api/link-requests/' + id + '/reject', {});
      toast('Татгалзлаа ✓');
      await window.__users(true);
    } catch (e) { toast(e.message); await window.__users(true); }
  };

  // ---------- 👥 Эрх ба карт холболт (5 хүнээр хуудаслана) ----------
  const USERS_PER_PAGE = 5;
  let usersPage = 0, usersData = null;
  // Устгах товчны дэвсгэрийг тухайн хүний хүйсийн өнгөөр будна
  function delSexCls(u) {
    try {
      const mid = u && u.member_id;
      if (!mid) return 'sex-q';
      let m = null;
      if (typeof byId !== 'undefined' && byId && byId.get) m = byId.get(mid);
      if (!m && typeof S !== 'undefined' && S && Array.isArray(S.members)) m = S.members.find(x => x.id === mid);
      return m && m.sex === 'f' ? 'sex-f' : m && m.sex === 'm' ? 'sex-m' : 'sex-q';
    } catch (e) { return 'sex-q'; }
  }
  function renderUsersModal() {
    const j = usersData.j, rq = usersData.rq;
    const reqs = rq.requests || [];
    const reqSec = reqs.length
      ? '<label class="f">⏳ Хүлээгдэж буй холболтын хүсэлтүүд (' + reqs.length + ')</label>' +
        reqs.map(r =>
          '<div class="list-row"><span class="grow"><b>' + escapeHtml(r.uname || r.phone) + '</b> ' +
          '<small style="opacity:.6">' + escapeHtml(r.phone) + '</small><br>' +
          '<span style="font-size:12px">→ модны «' + escapeHtml(r.card_name || ('#' + r.member_id)) + '» карт руу</span><br>' +
          '<small style="opacity:.5">' + escapeHtml(String(r.created_at || '').replace('T', ' ').slice(5, 16)) + '</small></span>' +
          '<button class="btn-ok" onclick="window.__lrApprove(' + r.id + ')">Зөвшөөрөх</button> ' +
          '<button class="danger" onclick="window.__lrReject(' + r.id + ')">Татгалзах</button></div>').join('') +
        '<div style="height:1px;background:var(--muted);opacity:.3;margin:8px 0"></div>'
      : '';
    const all = j.users || [];
    const pages = Math.max(1, Math.ceil(all.length / USERS_PER_PAGE));
    if (usersPage > pages - 1) usersPage = pages - 1;
    if (usersPage < 0) usersPage = 0;
    const from = usersPage * USERS_PER_PAGE;
    // Устгах товч — нэрийн мөрөнд, хүний ард (тусдаа мөр эзлэхгүй)
    const delBtn = (u) => (S.viewer && S.viewer.role === 'super')
      ? '<button class="danger ' + delSexCls(u) + '" onclick="window.__delUser(' + u.id + ')" title="Хэрэглэгч устгах">🗑</button>'
      : '';
    const rows = all.slice(from, from + USERS_PER_PAGE).map(u =>
      '<div class="list-row"><span class="uhead"><span class="grow">' + escapeHtml(u.name) + '<br><small style="opacity:.6">' + escapeHtml(u.phone) + '</small></span>' + delBtn(u) + '</span>' +
      '<button onclick="window.__resetCode(' + u.id + ')" title="Нэг удаагийн код үүсгэх">Код</button>' +
      (S.viewer && S.viewer.role === 'super'
        ? '<select onchange="window.__setRole(' + u.id + ',this.value)">' +
          ['member', 'coord', 'admin', 'super'].map(r =>
            '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + roleName(r) + '</option>').join('') + '</select>'
        : '<span style="font-size:12.5px;color:var(--muted);flex:0 0 auto">' + roleName(u.role) + '</span>') +
      '<select onchange="window.__setLink(' + u.id + ',this.value)"><option value="">— карт байхгүй —</option>' +
      j.members.map(x => {
        const pat = patronymicOf(x.id);
        const full = pat ? pat + ' ' + x.name : x.name;
        return '<option value="' + x.id + '"' + (u.member_id === x.id ? ' selected' : '') + '>' +
          escapeHtml(full) + '</option>';
      }).join('') + '</select>' +
      '</div>').join('');
    const pager = pages > 1
      ? '<div style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:10px;flex-wrap:wrap">' +
        '<button onclick="window.__usersPage(' + (usersPage - 1) + ')"' + (usersPage <= 0 ? ' disabled' : '') + '>← Өмнөх</button>' +
        '<span style="font-size:12px;color:var(--muted)">' + (all.length ? (from + 1) : 0) + '–' +
        Math.min(from + USERS_PER_PAGE, all.length) + ' / ' + all.length +
        ' · хуудас ' + (usersPage + 1) + '/' + pages + '</span>' +
        '<button onclick="window.__usersPage(' + (usersPage + 1) + ')"' + (usersPage >= pages - 1 ? ' disabled' : '') + '>Дараах →</button>' +
        '</div>'
      : '';
    const pageBtns = pages > 1
      ? '<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center;margin-top:8px">' +
        Array.from({ length: pages }, (_, i) =>
          '<button' + (i === usersPage ? ' class="primary"' : '') + ' onclick="window.__usersPage(' + i + ')" style="min-width:34px">' +
          (i + 1) + '</button>').join('') + '</div>'
      : '';
    openModal('👥 Эрх ба карт холболт', '<div data-users="1"></div>' + reqSec + rows + pager + pageBtns +
      '<div style="text-align:center;margin-top:10px"><button onclick="window.__users()">⟳ Шинэчлэх</button></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:8px">Эрэмбэ: Том админ → Жижиг админ → Зохицуулагч → Карттай гишүүн. Доод эрэмбэтэй дээдийг засах эрхгүй.</div>', undefined, 'users-modal');
  }
  window.__usersPage = (p) => {
    if (!usersData) return;
    usersPage = Number(p) || 0;
    renderUsersModal();
  };
  // Өөр админ зэрэг ажиллаж болох тул: хуучин хариу шинийг дарж болохгүй (seq).
  // Цонхыг автоматаар 10 секунд тутам шинэчлэхгүй — админ «⟳ Шинэчлэх»-ээр
  // эсвэл цонхыг дахин нээхэд л шинэ хүсэлт харагдана.
  let usersSeq = 0;
  window.__users = async (silent) => {
    const seq = ++usersSeq;
    try {
      const [j, rq] = await Promise.all([
        getJson('/api/users?t=' + Date.now()),
        getJson('/api/link-requests?t=' + Date.now())
      ]);
      if (seq !== usersSeq) return;              // хоцорсон хариу — алгасна
      usersData = { j, rq };
      renderUsersModal();
    } catch (e) { if (!silent) toast(e.message); }
  };
  window.__setRole = async (id, role) => {
    try {
      await post('/api/users/' + id + '/role', { role });
      toast('Эрх солигдлоо ✓');
      await window.__users(true);            // шинэ эрх шууд харагдана
    } catch (e) { toast(e.message); await window.__users(true); }
  };
  window.__setLink = async (id, mid) => {
    try {
      await post('/api/users/' + id + '/link', { member_id: mid ? Number(mid) : null });
      toast('Холбогдлоо ✓');
      await refresh();
      await window.__users(true);
    } catch (e) { toast(e.message); await window.__users(true); }
  };
  window.__delUser = async (id) => {
    let nm = '#' + id;
    try {
      const list = await getJson('/api/users');
      const t = (list.users || []).find(x => x.id === id);
      if (t) nm = (t.name || t.phone) + ' (' + t.phone + ')';
    } catch (e) { /* нэрийг олж чадвал confirm-д харуулна */ }
    if (!confirm('«' + nm + '» хэрэглэгчийг устгах уу?\n\nБүртгэл, нэвтрэх код, карт холболт устагдана. Модын карт хадгалагдана.')) return;
    try {
      await post('/api/users/' + id + '/delete', {});
      toast('Хэрэглэгчийг устгалаа ✓');
      await window.__users(true);
    } catch (e) { toast(e.message); }
  };
  window.__resetCode = async (id) => {
    try {
      const j = await post('/api/users/' + id + '/reset-code', {});
      alert('Нэг удаагийн код: ' + j.code + '\n\n' +
        '30 минут хүчинтэй.\nХэрэглэгч утас + ямар ч буруу нууц үгээр «Нэвтрэх» дараад, ' +
        'гарч ирсэн талбарт энэ код болон шинэ нууц үгээ оруулж шинэчилнэ.');
      await window.__users(true);
    } catch (e) { toast(e.message); }
  };

  // ---------- нэмэлт ----------
  // ЗӨВХӨН тухайн картын зургийг солино — мод дахин зурагдахгүй, камер
  // хөдлөхгүй, нээсэн/хумисан салаа хэвээр. (Зураг хадгалсны дараа ашиглана.)
  function setCardPhoto(id, url, m) {
    if (!id || !url) return;
    const card = document.querySelector('#cards .card[data-id="' + id + '"]');
    if (!card) return;
    const ava = card.querySelector('.ava');
    if (!ava) return;
    const style = photoBoxStyle(m || {}, 140, 96);
    if (ava.tagName === 'IMG') {
      ava.src = url;                    // зургийг л сольсон — layout хөндөхгүй
      ava.setAttribute('style', style);
    } else {
      const im = document.createElement('img');
      im.className = 'ava'; im.alt = ''; im.src = url; im.loading = 'lazy';
      im.setAttribute('style', style);
      ava.replaceWith(im);
    }
  }
  window.__setCardPhoto = setCardPhoto;

  // Модны ОДООГИЙН төлөвийг (нээсэн салаа, сонгосон хүн, камерын байрлал)
  // хадгалан өгөгдлийг шинэчилнэ — мэдээлэл засах үед мод дэлгэгдэхгүй.
  async function refreshKeepTree() {
    const keep = {
      open: fullOpen, closed: fullClosed, sel: selected, focus: focus,
      view: { x: view.x, y: view.y, z: view.z }
    };
    try {
      layoutCache.clear();
      const root = S.root ? '?root=' + S.root : '';
      S = await getJson('/api/state' + root);
      compile();
      applyDesign();
      fullL = null; fullSeq++;
      fullOpen = keep.open; fullClosed = keep.closed;
      focus = keep.focus; selected = keep.sel;
      fitted = true;                       // дахин fit()/төвлөрөл хийхгүй
      if (focus == null) {
        await loadFullLayout({ keepView: true });
        fullOpen = keep.open; fullClosed = keep.closed; selected = keep.sel;
      }
      render();
      view.x = keep.view.x; view.y = keep.view.y; view.z = keep.view.z;
      applyView();                         // камер ЯГ хэвээр
    } catch (e) { toast(e.message); }
  }

  window.__clearLayoutCache = () => { layoutCache.clear(); };
  window.__logout = async () => { await post('/api/logout', {}); location.href = '/'; };
  function wrapErr(msg) { return new Error(msg); }
  async function refresh() {
    try {
      layoutCache.clear();   // байрлалын кэш хуучирсан — дахин татна
      const root = S.root ? '?root=' + S.root : '';
      S = await getJson('/api/state' + root);
      compile();
      applyDesign();
      fullL = null; fullOpen = null; fullSeq++;
      render();
      // Анхдагч дүрсүүд модны өгөгдлөөс хамааралгүй тул энд дахин дуудахгүй
      // (дүрс солих үйлдлүүд loadAvatars-ыг өөрсдөө дуудна) — давхар хүсэлт хэмнэнэ.
      if (focus == null) loadFullLayout();   // дахин ачаалахад ч ҮНДСЭН МОД
    } catch (e) { toast(e.message); }
  }

  // ---------- эхлэл ----------
  // Панель нээгдэх/хаагдах үед модны талбар (flex) нарийсаж/өргөсөх тул
  // харагдацын төвийг хадгална — картууд гэнэт «баруун талд алга болохгүй».
  {
    const vpEl = $('viewport');
    let lastW = vpEl.clientWidth;
    new ResizeObserver(() => {
      const w = vpEl.clientWidth;
      if (!w || w === lastW) return;
      view.x += (w - lastW) / 2;
      lastW = w;
      applyView();
      // Панель нээгдэж талбар нарийссан ч дарсан карт бүтнээрээ харагдана.
      if (selected != null) keepCardVisible(selected);
    }).observe(vpEl);
  }
  // Сонгосон карт модны харагдах хэсгийн ГАДНА гарсан бол хамгийн бага
  // шилжүүлэг хийж бүтнээр нь харагдуулна (зум өөрчлөхгүй).
  function keepCardVisible(id) {
    const el = document.querySelector('#cards .card[data-id="' + id + '"]');
    if (!el) return;
    const vpEl = $('viewport');
    const vr = vpEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    const pad = 12;
    let dx = 0, dy = 0;
    if (r.left < vr.left + pad) dx = vr.left + pad - r.left;
    else if (r.right > vr.right - pad) dx = vr.right - pad - r.right;
    if (r.top < vr.top + pad) dy = vr.top + pad - r.top;
    else if (r.bottom > vr.bottom - pad) dy = vr.bottom - pad - r.bottom;
    if (dx || dy) { view.x += dx; view.y += dy; applyView(); }
  }
  compile();
  applyDesign();
  bindView();
  bindCards();
  render();
  loadAvatars();
  // Анх ороход: админ/супер админ — БҮТЭН МОД; энгийн гишүүн — ЗӨВХӨН
  // өөрийн салбар (нээсэн хүн = өөрөө, мөрийнхөө баруун захад). Ингэснээр
  // хүн бүр өөрийнхоо ойрын гэр бүлийг л харна, бүх мод нээлттэй байхгүй.
  if (S.viewer && S.viewer.member_id) {
    // Нэвтрэхэд зөвхөн ӨӨРИЙН гэр бүл: өөрийн карт идэвхтэй (selected),
    // эцэг эх, эхнэр/нөхөр, хүүхэд, ах дүү. Дэлгэцэнд багтаж, өөрийн карт
    // идэвхтэй (selected) байдалтай гарна.
    // Нэвтрэхэд зөвхөн ӨӨРИЙН гэр бүл: өөрийн карт идэвхтэй (selected),
    // дэлгэцийн голд. Бүтэн мод руу «Үндсэн мод» товчоор гарна.
    window.__mainTree(S.viewer.member_id);   // Үндсэн мод + өөрийн салбар
  }
  // Нүүр хуудсанд: түвшин ахсан бол нэг удаагийн баяр хүргэлт
  if (S.viewer && S.viewer.member_id) setTimeout(() => { levelUpCheck(); }, 900);
  // ---------- «Холболт хүлээж буй» — автомат статус ----------
  // 30 секунд тутам, ЗӨВХӨН хэрэглэгч «Холболт хүлээж буй» дэлгэцээ нээлттэй
  // харж байгаа үед л хөнгөн /api/my-status дуудна. Таб нуугдсан
  // (document.visibilityState === 'hidden') үед poll БҮРЭН зогсоно; батлагдсаны
  // дараа (үндсэн мод дээр) хойноо дуудахгүй. Ингэснээр өдрийн 10,000
  // хүсэлтийн хязгаарт зарцуулагдах дуудлага хэд дахин багасна.
  let statusTimer = null, statusBusy = false, statusDone = false;
  function stopStatusPoll() { if (statusTimer) { clearInterval(statusTimer); statusTimer = null; } }
  // Poll хийх нөхцөл: хүлээж буй дэлгэц байгаа, нуугдаагүй, таб харагдаж байгаа
  function statusPollNeeded() {
    if (statusDone || !S.viewer || !S.awaiting) return false;
    if (document.visibilityState === 'hidden') return false;
    const w = $('waiting');
    return !!w && !w.classList.contains('hidden');
  }
  async function checkStatus() {
    if (statusDone || statusBusy) return;
    if (!S.viewer || !S.awaiting) { stopStatusPoll(); return; }
    // Хэрэглэгч хүлээж буй дэлгэцээ хаасан (эсвэл өөр газар шилжсэн) бол дуудахгүй
    if (!statusPollNeeded()) { if (document.visibilityState === 'hidden') stopStatusPoll(); return; }
    statusBusy = true;
    try {
      const j = await getJson('/api/my-status');
      if (j && j.member_id) {
        statusDone = true;
        stopStatusPoll();
        const w = $('waiting'); if (w) w.classList.add('hidden');
        toast('Таны хүсэлт баталгаажлаа!');
        await refresh();
        await window.__mainTree(j.member_id);
        return;
      }
      if (j && !j.pending && S.pending_req) { S.pending_req = null; renderTop(); }
    } catch (e) { /* сүлжээний түр алдааг алгасна — дараагийн циклд дахин оролдоно */ }
    finally { statusBusy = false; }
  }
  function startStatusPoll() {
    stopStatusPoll();
    if (!statusPollNeeded()) return;      // үндсэн мод дээр/таб нуугдсан үед interval үүсгэхгүй
    statusTimer = setInterval(checkStatus, 30000);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { stopStatusPoll(); return; }  // бүрэн зогсоно
    if (statusPollNeeded()) { startStatusPoll(); checkStatus(); }             // буцаж ирэхэд нэг шалгана
  });
  startStatusPoll();
  window.addEventListener('resize', () => applyView());
})();
