// public/index.html-ийг src/ui.js-ийн хамгийн сүүлийн дизайн (loginPage + CSS)
// дээрээс үүсгэнэ. Cloudflare Pages `/`-ийг энэ файлаас үзүүлэх боломжтой.
// Ажиллуулах: npm run pages:index   (deploy-ийн өмнө)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loginPage } from '../src/ui.js';

const OUT = fileURLToPath(new URL('../public/index.html', import.meta.url));

// Нэвтэрсэн хэрэглэгч энэ хуудсыг онгойлговол шууд апп руу шилжинэ.
const boot = `<script>
// Cloudflare Pages: нэвтэрсэн бол / (Functions-ийн бүтэн апп) руу шилжинэ
fetch('/api/state', { credentials: 'same-origin' })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (j) { if (j && j.viewer) location.replace('/app'); })
  .catch(function () {});
</script>
</body>`;

let html = loginPage({ theme: 'blue' });
html = html.replace('</body>', boot);
writeFileSync(OUT, html, 'utf8');
console.log('public/index.html: ' + (html.length / 1024).toFixed(0) + ' KB (login дизайн)');
