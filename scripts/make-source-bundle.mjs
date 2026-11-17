// Сайтын БҮХ эх кодыг Worker-т бэлдэх скрипт.
// Ажиллуулах: npm run source:bundle   (deploy-ийн өмнө)
// Үр дүн: src/source_bundle.js — src/source_bundle.js-д текст файлууд,
//          public/ доорх зурагнуудын ЖАГСААЛТ (байт нь runtime-д ASSETS-ээс).
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (p) => relative(ROOT, p).split('\\').join('/');

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.jsonc', '.css', '.html',
  '.txt', '.md', '.sql', '.webmanifest', '.yml', '.yaml', '.toml', '.sh', '.csv']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'artifacts', '.wrangler',
  '.freebuff', '.vscode', '.idea', 'coverage']);
// Нууц мэдээлэл, асар том файлууд ZIP-д ОРОХГҮЙ:
const SKIP_FILES = new Set(['src/source_bundle.js', 'package-lock.json', '.env',
  '.dev.vars', '.env.local', 'st.json']);

const text = [], bin = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch (e) { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full); continue; }
    const r = rel(full);
    if (SKIP_FILES.has(r) || name.startsWith('.env')) continue;
    if (!st.isFile()) continue;
    if (TEXT_EXT.has(extname(name).toLowerCase()) || !extname(name)) {
      try { text.push({ path: r, text: readFileSync(full, 'utf8') }); } catch (e) {}
    } else {
      bin.push(r);
    }
  }
}
walk(join(ROOT, 'src'));
walk(join(ROOT, 'scripts'));
walk(join(ROOT, 'functions'));
walk(join(ROOT, 'public'));
for (const f of ['package.json', 'wrangler.jsonc', 'site-manifest.json', 'server.js',
  'README.md', 'D1-SCHEMA.sql']) {
  const full = join(ROOT, f);
  if (existsSync(full)) text.push({ path: f, text: readFileSync(full, 'utf8') });
}
for (const f of readdirSync(ROOT)) {
  if (/^(test-.*|.*\.mjs)$/.test(f) && !SKIP_FILES.has(f) &&
      statSync(join(ROOT, f)).isFile()) {
    text.push({ path: f, text: readFileSync(join(ROOT, f), 'utf8') });
  }
}

// Дахин давхардал арилгах
const seen = new Set();
const TEXT = text.filter((t) => (seen.has(t.path) ? false : (seen.add(t.path), true)));
const BIN = [...new Set(bin)];

const body = '// АВТОМАТААР ҮҮСГЭГДСЭН — гараар бүү зас. `npm run source:bundle`\n' +
  'export const SOURCE_GENERATED_AT = ' + JSON.stringify(new Date().toISOString()) + ';\n' +
  'export const SOURCE_TEXT = [\n' +
  TEXT.map((t) => '  { path: ' + JSON.stringify(t.path) + ', text: ' + JSON.stringify(t.text) + ' }').join(',\n') +
  '\n];\n' +
  'export const SOURCE_BIN = [\n' + BIN.map((p) => '  ' + JSON.stringify(p)).join(',\n') + '\n];\n';
writeFileSync(join(ROOT, 'src/source_bundle.js'), body, 'utf8');

const bytes = Buffer.byteLength(body);
console.log('source_bundle.js: ' + TEXT.length + ' текст, ' + BIN.length + ' хоёртын файл, ' +
  (bytes / 1024).toFixed(0) + ' KB');
