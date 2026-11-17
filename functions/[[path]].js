// Cloudflare Pages Functions — бүх динамик хүсэлтийг эндээс Worker рүү дамжуулна.
// /api/*, /app, /p/* зэрэг динамик замууд энд ирнэ (public/_routes.json-оор тохируулна).
// Статик файлууд (icon, splash, tree_client.js …) Pages шууд үйлчилнэ.
import { handle } from '../src/app.js';

export async function onRequest(context) {
  const { request, env, next, waitUntil, passThroughOnException } = context;

  // Pages-д `env.ASSETS` binding байдаггүй (Workers-ийн assets биш) тул
  // src/app.js-ийн ашигладаг env.ASSETS-ийг Pages-ийн next()/fetch-ээр
  // дуурайлган хийнэ. env-ийг prototype-оор өвлүүлснээр DB, SESSION_SECRET
  // зэрэг бүх binding хэвээр ажиллана.
  const e = Object.create(env);
  e.ASSETS = {
    async fetch(input) {
      const raw = typeof input === 'string' ? input : (input && input.url) || '';
      const u = new URL(raw, request.url);
      if (u.pathname === new URL(request.url).pathname) return next();
      return fetch(u.toString(), { headers: { accept: '*' } });
    }
  };

  return handle(request, e, {
    waitUntil: (p) => { try { waitUntil(p); } catch (err) { /* Pages-д байхгүй бол алгасна */ } },
    passThroughOnException: () => { try { passThroughOnException(); } catch (err) {} }
  });
}
