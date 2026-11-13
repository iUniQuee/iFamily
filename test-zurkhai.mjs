// Апп-ын зурхайн хүснэгт/томьёог tree_client.js-ээс шууд уншиж шалгана
import fs from 'fs';
const src = fs.readFileSync('public/tree_client.js', 'utf8');
const grab = (re) => { const m = src.match(re); return m ? m[1] : null; };
const parts = {
  ANIMALS: grab(/const ANIMALS = (\[[\s\S]*?\]);/),
  ELEMS10: grab(/const ELEMS10 = (\[[\s\S]*?\]);/),
  ELEM_COLOR: grab(/const ELEM_COLOR = (\{[\s\S]*?\});/),
  SEATS: grab(/const SEATS = (\[[\s\S]*?\]);/),
};
for (const k of Object.keys(parts)) if (!parts[k]) { console.error('✗ ' + k + ' олдсонгүй'); process.exit(1); }
const ANIMALS = eval('(' + parts.ANIMALS + ')');
const ELEMS10 = eval('(' + parts.ELEMS10 + ')');
const ELEM_COLOR = eval('(' + parts.ELEM_COLOR + ')');
const SEATS = eval('(' + parts.SEATS + ')');
const JZ_SRC = grab(/const JIL_ZURAG = (\{[\s\S]*?\});/);
if (!JZ_SRC) { console.error('✗ JIL_ZURAG олдсонгүй'); process.exit(1); }
const JIL_ZURAG = eval('(' + JZ_SRC + ')');
const iconOf = (ly) => JIL_ZURAG[ANIMALS[mod(ly - 4, 12)][0]] || '🐾';
const mod = (a, n) => ((a % n) + n) % n;
function zurkhai(ly, sex, nowY = 2026) {
  const an = ANIMALS[mod(ly - 4, 12)];
  const el = ELEMS10[mod(ly - 4, 10)];
  return {
    jil: ELEM_COLOR[el].toLowerCase() + ' ' + an[1] + ' жил',
    nas: nowY - ly + 1,
    meng: String(mod(ly - 4, 9) || 9) + ' ' + (sex === 'f' ? 'хар' : 'цагаан'),
    suudal: SEATS[mod(ly - 4, 8)],
  };
}
let fail = 0;
const eq = (a, b, label) => {
  if (a !== b) { console.error('✗ ' + label + ': ' + JSON.stringify(a) + ' ≠ ' + JSON.stringify(b)); fail++; }
  else console.log('✓ ' + label + ' = ' + JSON.stringify(a));
};
// Хэрэглэгчийн өгсөн жишиг утгууд
const a = zurkhai(1967, 'f');
eq(a.jil, 'улаан хонин жил', '1967 эмэгтэй — жил');
eq(a.nas, 60, '1967 эмэгтэй — билгийн нас');
eq(a.meng, '1 хар', '1967 эмэгтэй — мэнгэ');
eq(a.suudal, 'Ус', '1967 эмэгтэй — суудал');
const b = zurkhai(1992, 'm');
eq(b.jil, 'хар бичин жил', '1992 эрэгтэй — жил');
eq(b.nas, 35, '1992 эрэгтэй — билгийн нас');
eq(b.meng, '8 цагаан', '1992 эрэгтэй — мэнгэ');
eq(b.suudal, 'Төмөр', '1992 эрэгтэй — суудал');
// Нэмэлт тогтвортой байдал
eq(zurkhai(1992, 'm', 2027).nas, 36, '2027 онд нас нэгээр өснө');
eq(zurkhai(2000, 'f').jil.length > 0, true, '2000 он тооцогдоно');
// Жилийн эможи оноос хамаарч солигдоно
eq(iconOf(1967), '🐑', '1967 — Хонь эможи');
eq(iconOf(1992), '🐵', '1992 — Бичин эможи');
eq(iconOf(1991), '🐑', '1991 — Хонь эможи (Морь нь 1990)');
eq(iconOf(1990), '🐴', '1990 — Морь эможи');
eq(Object.keys(JIL_ZURAG).length, 12, 'эможи массив 12 амьтантай');
console.log(fail ? '\n▶ ' + fail + ' амжилтгүй' : '\n▶ Бүгд амжилттай');
process.exit(fail ? 1 : 0);
