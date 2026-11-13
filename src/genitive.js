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

export { genitiveName };
