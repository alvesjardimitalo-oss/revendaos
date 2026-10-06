// Service worker simples: deixa o app abrir mesmo com internet instável (os dados vêm do Firebase com cache próprio)
const CACHE = 'revendaos-v10';
const ARQS = ['./', 'index.html', 'loja.html', 'manifest.json', 'assets/style.css', 'assets/icon.svg', 'assets/app.js', 'assets/core.js', 'assets/db.js', 'assets/utils.js', 'assets/config.js', 'assets/loja.js',
  ...['dashboard', 'vendas', 'cobrancas', 'clientes', 'produtos', 'compras', 'financeiro', 'relatorios', 'loja', 'loja-sync', 'catalogo', 'promocoes', 'consorcios', 'importar-vendas', 'dados-iniciais', 'notificacoes', 'equipe', 'config'].map(m => `assets/modules/${m}.js`)];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ARQS.map(a => c.add(a)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Rede primeiro (sempre a versão mais nova); cache só se estiver offline
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (!r.ok) return caches.match(e.request, { ignoreSearch: true }).then(c => c || r); const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
