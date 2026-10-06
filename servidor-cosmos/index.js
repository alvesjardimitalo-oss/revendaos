// Proxy da base Cosmos (Bluesoft) para o RevendaOS.
// Esconde o token, libera o acesso pelo navegador (CORS) e guarda em cache as consultas já feitas
// para economizar o limite diário. Sem dependências: Node 18+.
//
// Variáveis de ambiente (no Railway: Variables):
//   COSMOS_TOKEN      token da sua conta em cosmos.bluesoft.com.br (obrigatório)
//   ORIGENS           endereços autorizados, separados por vírgula (ex.: https://seuusuario.github.io)
//   PORT              definido automaticamente pelo Railway
const http = require('http');

const TOKEN = process.env.COSMOS_TOKEN || '';
const ORIGENS = (process.env.ORIGENS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const cache = new Map(); // ean -> { status, corpo, quando }
const DIA = 24 * 60 * 60 * 1000;

function cors(req, res) {
  const o = req.headers.origin || '';
  if (!ORIGENS.length || ORIGENS.includes(o)) res.setHeader('Access-Control-Allow-Origin', o || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  return !ORIGENS.length || ORIGENS.includes(o);
}
function responder(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
}

http.createServer(async (req, res) => {
  const permitido = cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') return responder(res, 200, { ok: true, servico: 'proxy-cosmos', tokenConfigurado: !!TOKEN, emCache: cache.size });
  const m = url.pathname.match(/^\/gtin\/(\d{8,14})$/);
  if (!m) return responder(res, 404, { erro: 'rota inválida' });
  if (!permitido) return responder(res, 403, { erro: 'origem não autorizada' });
  if (!TOKEN) return responder(res, 500, { erro: 'COSMOS_TOKEN não configurado' });
  const ean = m[1];
  const c = cache.get(ean);
  if (c && Date.now() - c.quando < (c.status === 200 ? 30 * DIA : DIA)) return responder(res, c.status, c.corpo);
  try {
    const r = await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}.json`, {
      headers: { 'X-Cosmos-Token': TOKEN, 'User-Agent': 'Cosmos-API-Request', 'Content-Type': 'application/json' }
    });
    const corpo = await r.text();
    if (r.status === 200 || r.status === 404) { cache.set(ean, { status: r.status, corpo, quando: Date.now() }); if (cache.size > 20000) cache.delete(cache.keys().next().value); }
    responder(res, r.status, corpo);
  } catch (e) {
    responder(res, 502, { erro: 'falha ao consultar a Cosmos' });
  }
}).listen(process.env.PORT || 3000, () => console.log('proxy-cosmos rodando'));
