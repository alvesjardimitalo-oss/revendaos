// Catálogo de marcas: base compartilhada entre todas as contas do sistema.
// - Revendedoras navegam por marca, selecionam produtos e cadastram no estoque em lote.
// - Código de barras: busca no catálogo e, se não achar, no Open Beauty Facts.
// - Curadoria: importa tabelas das marcas (CSV/Excel), publica a partir do estoque e aprova sugestões.
import { $, $$, esc, brl, nfmt, parseNum, uid, norm, slugify, soDigitos, hoje, parseCSV, baixar, toCSV, fmtDataHora, reduzirImagem } from '../utils.js';
import { S, cfg, pode, isAdmin, icon, modal, ask, toast, commit, qtdProduto, vazio, badge } from '../core.js';
import { opsItemLoja } from './loja-sync.js';

const CAT = { marcas: null, itens: {}, carregando: false, erro: '', sugestoes: null };
const F = { marca: '', q: '', cat: '', aba: 'catalogo', sel: new Set(), pag: 60, soNovos: false };
let EL;
const redesenhar = () => { if (EL && EL.isConnected) render(EL); };

// ---------------------------------------------------------------- dados
export async function verificarCurador() {
  if (S.db.modo === 'demo') { S.curadoresExiste = true; return true; }
  try {
    const d = await S.db.lerDoc('sistema/curadores');
    S.curadoresExiste = !!d;
    return !!d && (d.emails || []).map(e => String(e).toLowerCase()).includes((S.user.email || '').toLowerCase());
  } catch { return false; }
}

async function carregarMarcas() {
  if (CAT.carregando) return;
  CAT.carregando = true;
  try { CAT.marcas = (await S.db.lerCol('catalogo')).sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id)); CAT.erro = ''; }
  catch (e) { CAT.erro = e.code || e.message; CAT.marcas = CAT.marcas || []; }
  CAT.carregando = false;
  redesenhar();
}

async function carregarItens(slug) {
  if (CAT.itens[slug]) return CAT.itens[slug];
  const partes = await S.db.lerCol(`catalogo/${slug}/partes`);
  const meta = (CAT.marcas || []).find(m => m.id === slug) || {};
  CAT.itens[slug] = partes.sort((a, b) => +a.id - +b.id).flatMap(p => p.itens || []).map(i => ({ ...i, marcaSlug: slug, marca: meta.nome || slug }));
  return CAT.itens[slug];
}

const chave = (nome, marca) => norm(marca) + '|' + norm(nome);
function existente(i) {
  return S.d.produtos.find(p => (i.codigo && String(p.codigo) === String(i.codigo)) || (normRef(i.ref) && normRef(p.sku) === normRef(i.ref) && slugify(p.marca) === (i.marcaSlug || slugify(i.marca))) || chave(p.nome, p.marca) === chave(i.nome, i.marca));
}
const idItem = i => soDigitos(i.codigo) || (normRef(i.ref) ? 'ref-' + normRef(i.ref) : '') || slugify(i.nome).slice(0, 60) || uid();
const fotoOk = f => /^(https?:\/\/|data:image\/)/.test(String(f || '')) ? String(f) : '';
function limparItem(i) {
  const o = { id: i.id, nome: String(i.nome || '').trim(), codigo: soDigitos(i.codigo), ref: String(i.ref || '').trim(), categoria: String(i.categoria || '').trim(), linha: String(i.linha || '').trim(), preco: Number(i.preco) || 0, foto: fotoOk(i.foto), descricao: String(i.descricao || '').trim() };
  Object.keys(o).forEach(k => { if (o[k] === '' || o[k] === 0) delete o[k]; });
  return o;
}
// Código do produto (revista): ignora espaços, pontos e zeros à esquerda (07390 = 7390)
export function normRef(r) { let s = String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0'; return s; }
// Fotos do catálogo hospedadas no próprio GitHub: pasta catalogo-img/<marca>/<código>.jpg
const BASE_IMG = new URL('catalogo-img/', location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '')).href;
export const chaveFoto = i => normRef(i.ref) || soDigitos(i.codigo);
export const urlFotoRepo = (i, slug) => { const k = chaveFoto(i); return k ? `${BASE_IMG}${slug || i.marcaSlug || slugify(i.marca)}/${k}.jpg` : ''; };
const cacheImg = new Map();
export function existeImagem(url) {
  if (!url) return Promise.resolve(false);
  if (!cacheImg.has(url)) cacheImg.set(url, new Promise(res => { const im = new Image(); const t = setTimeout(() => res(false), 5000); im.onload = () => { clearTimeout(t); res(true); }; im.onerror = () => { clearTimeout(t); res(false); }; im.src = url; }));
  return cacheImg.get(url);
}
export async function fotoDoItem(i) { if (i.foto) return i.foto; const u = urlFotoRepo(i); return (await existeImagem(u)) ? u : ''; }
const semFotoPesada = i => { const o = { ...i }; if (String(o.foto || '').startsWith('data:')) delete o.foto; return o; };

// ---------------------------------------------------------------- busca por código de barras (usada no cadastro de produto)
// Cosmos (Bluesoft): base brasileira de códigos de barras. Usa o proxy próprio (token fica no servidor) ou o token direto.
export async function buscarCosmos(ean, { silencioso = true } = {}) {
  const c = cfg(); const proxy = String(c.cosmosProxy || '').trim().replace(/\/+$/, ''), token = String(c.cosmosToken || '').trim();
  if (!proxy && !token) return null;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = proxy
      ? await fetch(`${proxy}/gtin/${ean}`, { signal: ctl.signal })
      : await fetch(`https://api.cosmos.bluesoft.com.br/gtins/${ean}.json`, { headers: { 'X-Cosmos-Token': token }, signal: ctl.signal });
    if (r.status === 404) return null;
    if (r.status === 429) { if (!silencioso) toast('Limite diário de consultas da Cosmos atingido.', 'aviso'); return { erro: 'limite' }; }
    if (r.status === 401 || r.status === 403) { if (!silencioso) toast('Token da Cosmos inválido. Confira em Configurações.', 'erro'); return { erro: 'token' }; }
    if (!r.ok) return null;
    const p = await r.json();
    if (!p || !p.description) return null;
    const preco = Number(p.avg_price || p.price || p.max_price) || 0;
    return { nome: p.description, marca: (p.brand && p.brand.name) || '', foto: p.thumbnail || '', categoria: (p.gpc && p.gpc.description) || '', preco, codigo: ean, fonte: 'base Cosmos' };
  } catch (e) {
    if (!silencioso && !proxy) toast('A consulta direta à Cosmos foi bloqueada pelo navegador. Use o proxy (veja o README, pasta servidor-cosmos).', 'aviso');
    return null;
  } finally { clearTimeout(t); }
}

async function buscarOBF(ean) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${ean}.json?fields=product_name,product_name_pt,brands,image_front_url,image_url`, { signal: ctl.signal });
    const j = await r.json();
    if (j.status !== 1 || !j.product) return null;
    const p = j.product;
    const nome = p.product_name_pt || p.product_name || '';
    return nome ? { nome, marca: String(p.brands || '').split(',')[0].trim(), foto: p.image_front_url || p.image_url || '', codigo: ean, fonte: 'Open Beauty Facts' } : null;
  } catch { return null; } finally { clearTimeout(t); }
}
export async function buscarEAN(ean) {
  ean = soDigitos(ean); if (ean.length < 8) return null;
  try {
    const d = await S.db.lerDoc(`catalogo_ean/${ean}`);
    if (d) {
      if (!d.foto && d.marcaSlug) { try { if (!CAT.marcas) CAT.marcas = await S.db.lerCol('catalogo'); const it = (await carregarItens(d.marcaSlug)).find(x => x.codigo === ean); if (it && it.foto) d.foto = it.foto; } catch { } }
      return { ...d, codigo: ean, fonte: 'catálogo ' + (d.marca || '') };
    }
  } catch { }
  const cz = await buscarCosmos(ean, { silencioso: false });
  if (cz && !cz.erro) return cz;
  return buscarOBF(ean);
}

async function completarFoto(d) {
  if (!d.foto) d.foto = await fotoDoItem(d);
  if (d.foto || !d.marcaSlug) return d;
  try { if (!CAT.marcas) CAT.marcas = await S.db.lerCol('catalogo'); const it = (await carregarItens(d.marcaSlug)).find(x => x.id === d.id); if (it && it.foto) d.foto = it.foto; } catch { }
  return d;
}
// Busca no catálogo global pelo código do produto. Retorna todas as marcas que têm esse código (filtra pela marca, se informada).
export async function buscarRef(ref, marca = '') {
  const r = normRef(ref); if (!r) return [];
  let l = [];
  try { l = await S.db.consultar('catalogo_ref', 'refN', r); } catch (e) { console.warn(e); }
  const ms = slugify(marca);
  if (ms) { const so = l.filter(x => x.marcaSlug === ms); if (so.length) l = so; }
  return Promise.all(l.map(x => completarFoto({ ...x, fonte: 'catálogo ' + (x.marca || '') })));
}
export function escolherItem(lista, aoEscolher) {
  const m = modal({
    titulo: 'Este código existe em mais de uma marca',
    corpo: `<p class="mudo pq">Escolha o produto certo. Dica: preencha a marca antes de buscar.</p><ul class="lista escolha">${lista.map((i, k) => `<li data-k="${k}"><span style="display:flex;gap:10px;align-items:center">${i.foto ? `<img src="${esc(i.foto)}" style="width:40px;height:40px;object-fit:contain;border-radius:8px;background:#fff">` : ''}<span><b>${esc(i.nome)}</b><small>${esc(i.marca)} · código ${esc(i.ref)}</small></span></span><em>${i.preco ? brl(i.preco) : ''}</em></li>`).join('')}</ul>`
  });
  m.$$('[data-k]').forEach(li => li.onclick = () => { m.fechar(); aoEscolher(lista[+li.dataset.k]); });
}

// Produto cadastrado com código de barras que ainda não está no catálogo vira sugestão para a curadoria
export async function sugerir(p) {
  const ean = soDigitos(p.codigo), r = normRef(p.sku), ms = slugify(p.marca);
  if (!p.marca || !p.nome || (ean.length < 8 && !r)) return;
  try {
    if (r && await S.db.lerDoc(`catalogo_ref/${ms}__${r}`)) return;
    if (!r && await S.db.lerDoc(`catalogo_ean/${ean}`)) return;
    const foto = p.foto && p.foto.length < 120000 ? p.foto : '';
    const id = r ? `${ms}__${r}` : ean;
    await S.db.commit([{ op: 'set', path: `catalogo_sugestoes/${id}`, data: { nome: p.nome, marca: p.marca, categoria: p.categoria || '', codigo: ean.length >= 8 ? ean : '', ref: p.sku || '', preco: Number(p.preco) || 0, foto, descricao: p.descricao || '', por: S.user.uid, porNome: S.membro.nome || '', em: Date.now() } }]);
  } catch { /* já sugerido por outra pessoa ou sem permissão: ignora */ }
}

// ---------------------------------------------------------------- publicação (curadoria)
async function publicarMarca(nomeMarca, novos, modo = 'mesclar') {
  nomeMarca = String(nomeMarca || '').trim();
  const slug = slugify(nomeMarca);
  if (!slug) { toast('Informe o nome da marca.', 'erro'); return 0; }
  if (!CAT.marcas) CAT.marcas = await S.db.lerCol('catalogo');
  const meta = CAT.marcas.find(m => m.id === slug);
  const atuais = meta ? await carregarItens(slug) : [];
  const mapa = new Map(modo === 'mesclar' ? atuais.map(i => [i.id, limparItem(i)]) : []);
  for (const n of novos) {
    if (!n.nome) continue;
    const id = idItem(n);
    mapa.set(id, { ...(mapa.get(id) || {}), ...limparItem({ ...n, id }) });
  }
  const itens = [...mapa.values()].filter(i => i.nome).sort((a, b) => a.nome.localeCompare(b.nome));
  // divide em partes de até ~800 KB (limite de 1 MB por documento)
  const partes = []; let cur = [], tam = 0;
  for (const i of itens) { const t = JSON.stringify(i).length; if (cur.length && tam + t > 800000) { partes.push(cur); cur = []; tam = 0; } cur.push(i); tam += t; }
  if (cur.length) partes.push(cur);
  for (let k = 0; k < partes.length; k++) if (!await commit([{ op: 'set', path: `catalogo/${slug}/partes/${k}`, data: { itens: partes[k] } }])) return 0;
  const ops = [];
  for (let k = partes.length; k < (meta && meta.partes || 0); k++) ops.push({ op: 'del', path: `catalogo/${slug}/partes/${k}` });
  const sobram = new Set(atuais.map(i => i.codigo).filter(Boolean));
  itens.forEach(i => { if (i.codigo) { sobram.delete(i.codigo); ops.push({ op: 'set', path: `catalogo_ean/${i.codigo}`, data: { ...semFotoPesada(i), marcaSlug: slug, marca: nomeMarca } }); } });
  sobram.forEach(e => ops.push({ op: 'del', path: `catalogo_ean/${e}` }));
  const sobramRef = new Set(atuais.map(i => normRef(i.ref)).filter(Boolean));
  itens.forEach(i => { const r = normRef(i.ref); if (r) { sobramRef.delete(r); ops.push({ op: 'set', path: `catalogo_ref/${slug}__${r}`, data: { ...semFotoPesada(i), refN: r, marcaSlug: slug, marca: nomeMarca } }); } });
  sobramRef.forEach(r => ops.push({ op: 'del', path: `catalogo_ref/${slug}__${r}` }));
  ops.push({ op: 'set', path: `catalogo/${slug}`, data: { nome: nomeMarca, total: itens.length, partes: partes.length, categorias: [...new Set(itens.map(i => i.categoria).filter(Boolean))].sort(), atualizadoEm: Date.now(), por: S.user.email || '' } });
  if (!await commit(ops)) return 0;
  CAT.itens[slug] = itens.map(i => ({ ...i, marcaSlug: slug, marca: nomeMarca }));
  CAT.marcas = null;
  return itens.length;
}

async function excluirMarca(m) {
  const itens = await carregarItens(m.id);
  const ops = [];
  for (let k = 0; k < (m.partes || 0); k++) ops.push({ op: 'del', path: `catalogo/${m.id}/partes/${k}` });
  itens.forEach(i => { if (i.codigo) ops.push({ op: 'del', path: `catalogo_ean/${i.codigo}` }); if (normRef(i.ref)) ops.push({ op: 'del', path: `catalogo_ref/${m.id}__${normRef(i.ref)}` }); });
  ops.push({ op: 'del', path: `catalogo/${m.id}` });
  if (await commit(ops)) { delete CAT.itens[m.id]; CAT.marcas = null; if (F.marca === m.id) F.marca = ''; toast('Marca removida do catálogo.'); redesenhar(); }
}

// ---------------------------------------------------------------- planilhas
function lerPlanilha() {
  return new Promise(res => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,.xlsx,.xls,text/csv';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return res(null);
      try {
        if (/\.xlsx?$/i.test(f.name)) {
          if (!window.XLSX) { toast('Leitor de Excel indisponível agora. Salve a planilha como CSV e tente de novo.', 'erro'); return res(null); }
          const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
          res(rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [norm(k).trim(), String(v).trim()]))));
        } else res(parseCSV(await f.text()));
      } catch (e) { toast('Não consegui ler o arquivo: ' + e.message, 'erro'); res(null); }
    };
    inp.click();
  });
}
const g = (r, ...ks) => { for (const k of ks) { const v = r[k]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
function mapear(r) {
  let codigo = soDigitos(g(r, 'codigo de barras', 'codigo_barras', 'cod barras', 'codigo barras', 'ean', 'gtin', 'ean13'));
  let ref = g(r, 'codigo revista', 'codigo_revista', 'cod revista', 'ref', 'referencia', 'codigo do produto', 'cod produto', 'sku');
  const cod = g(r, 'codigo', 'cod');
  if (cod) { const d = soDigitos(cod); if (!codigo && /^\d{8,14}$/.test(cod.replace(/\s/g, ''))) codigo = d; else if (!ref) ref = cod; }
  let nome = g(r, 'nome', 'produto', 'nome do produto', 'descricao do produto', 'item'), descricao = g(r, 'descricao', 'detalhes', 'observacao');
  if (!nome && descricao) { nome = descricao; descricao = ''; }
  return {
    marca: g(r, 'marca', 'fabricante'), nome, codigo, ref, descricao,
    categoria: g(r, 'categoria', 'departamento', 'secao'), linha: g(r, 'linha', 'colecao', 'familia'),
    preco: parseNum(g(r, 'preco', 'preco sugerido', 'preco_sugerido', 'preco de venda', 'preco revista', 'valor', 'pvp')),
    foto: g(r, 'foto', 'foto_url', 'imagem', 'url da imagem', 'url imagem', 'image')
  };
}
const MODELO = [{ marca: 'Nome da Marca', codigo_barras: '7890000000000', codigo_revista: '12345', nome: 'Nome do produto 100ml', categoria: 'Perfumaria', linha: 'Linha X', preco: '99,90', foto_url: 'https://…/foto.jpg', descricao: '' }];
const COLS_MODELO = ['marca', 'codigo_barras', 'codigo_revista', 'nome', 'categoria', 'linha', 'preco', 'foto_url', 'descricao'].map(k => ({ label: k, key: k }));

// ---------------------------------------------------------------- tela
export function render(el) {
  EL = el;
  if (CAT.marcas === null) {
    el.innerHTML = `<div class="carregando" style="min-height:300px"><div class="spin"></div><p>Abrindo o catálogo…</p></div>`;
    carregarMarcas(); return;
  }
  const abas = [['catalogo', 'Catálogo'], ...(S.curador ? [['gerenciar', 'Gerenciar catálogo']] : [])];
  if (!S.curador && F.aba === 'gerenciar') F.aba = 'catalogo';
  el.innerHTML = `
  ${abas.length > 1 ? `<div class="abas">${abas.map(([k, t]) => `<button data-aba="${k}" class="${F.aba === k ? 'ativo' : ''}">${t}</button>`).join('')}</div>` : ''}
  ${CAT.erro ? `<div class="erro-box">Não foi possível ler o catálogo (${esc(CAT.erro)}). Confira se as regras do Firestore foram atualizadas.</div>` : ''}
  <div id="aba"></div>`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.aba; render(el); });
  if (F.aba === 'gerenciar') abaGerenciar($('#aba', el));
  else abaCatalogo($('#aba', el));
}

function abaCatalogo(a) {
  const ms = CAT.marcas;
  if (!ms.length) {
    a.innerHTML = vazio(S.curador
      ? 'O catálogo ainda está vazio. Em "Gerenciar catálogo", importe a tabela de produtos de uma marca (CSV ou Excel) ou publique os produtos que você já tem no estoque.'
      : 'O catálogo de marcas ainda está sendo montado. Enquanto isso, ao cadastrar produtos com código de barras você ajuda a completá-lo.',
      S.curador ? `<button class="btn pri" id="ir">${icon('up')}Começar a montar o catálogo</button>` : '')
      + configCuradoria();
    const b = $('#ir', a); if (b) b.onclick = () => { F.aba = 'gerenciar'; redesenhar(); };
    ligarCuradoria(a);
    return;
  }
  if (!F.marca || !(F.marca === '*' || ms.some(m => m.id === F.marca))) F.marca = ms[0].id;
  const slugs = F.marca === '*' ? ms.map(m => m.id) : [F.marca];
  const faltam = slugs.filter(s => !CAT.itens[s]);
  const total = ms.reduce((s, m) => s + (m.total || 0), 0);
  let html = `<div class="marcas-grid">
    <button class="marca-card ${F.marca === '*' ? 'ativo' : ''}" data-m="*"><b>Todas as marcas</b><small>${nfmt(total)} produtos</small></button>
    ${ms.map(m => `<button class="marca-card ${F.marca === m.id ? 'ativo' : ''}" data-m="${m.id}"><b>${esc(m.nome)}</b><small>${nfmt(m.total || 0)} produtos</small></button>`).join('')}
  </div>`;
  if (faltam.length) {
    a.innerHTML = html + `<div class="carregando" style="min-height:200px"><div class="spin"></div><p>Carregando produtos…</p></div>`;
    ligarMarcas(a);
    Promise.all(faltam.map(carregarItens)).then(redesenhar).catch(e => { toast('Erro ao carregar: ' + (e.code || e.message), 'erro'); });
    return;
  }
  const todos = slugs.flatMap(s => CAT.itens[s]);
  const cats = [...new Set(todos.map(i => i.categoria).filter(Boolean))].sort();
  if (F.cat && !cats.includes(F.cat)) F.cat = '';
  const n = norm(F.q), qd = soDigitos(F.q);
  let l = todos.filter(i => (!F.cat || i.categoria === F.cat)
    && (!n || norm(`${i.nome} ${i.linha || ''} ${i.marca}`).includes(n) || (normRef(F.q) && normRef(i.ref) === normRef(F.q)) || (qd.length >= 6 && (i.codigo || '').includes(qd)))
    && (!F.soNovos || !existente(i)));
  const k = i => i.marcaSlug + ':' + i.id;
  const ed = pode('produtos', 'editar');
  html += `<div class="barra">
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Buscar por código do produto ou nome" value="${esc(F.q)}"></div>
    <button class="btn" id="scan" title="Ler código de barras">${icon('scan')}</button>
    ${cats.length ? `<select id="cat"><option value="">Todas as categorias</option>${cats.map(c => `<option ${F.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
    <label class="chk"><input type="checkbox" id="novos" ${F.soNovos ? 'checked' : ''}> Só o que não tenho</label>
  </div>
  <div class="barra"><span class="mudo pq grow">${nfmt(l.length)} produto(s)${F.sel.size ? ` · <b>${F.sel.size} selecionado(s)</b>` : ''}</span>
    ${ed && l.length ? `<button class="btn sm" id="seltodos">Selecionar os ${Math.min(l.length, 500)} da lista</button>` : ''}${F.sel.size ? `<button class="btn sm" id="limpar">Limpar seleção</button>` : ''}</div>
  ${l.length ? `<div class="cat-grade">${l.slice(0, F.pag).map(i => {
    const ex = existente(i), s = F.sel.has(k(i));
    return `<div class="cat-item ${s ? 'sel' : ''}" data-k="${esc(k(i))}">
      ${ed ? `<span class="cat-ck">${s ? icon('check') : ''}</span>` : ''}
      <div class="cat-foto">${(i.foto || urlFotoRepo(i)) ? `<img src="${esc(i.foto || urlFotoRepo(i))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}${icon('box')}${S.curador ? `<button class="cat-cam" data-foto title="Trocar foto deste produto">${icon('up')}</button>` : ''}</div>
      <div class="cat-info"><small>${esc(i.marca)}${i.ref ? ' · ' + esc(i.ref) : ''}</small><b>${esc(i.nome)}</b>
        ${i.linha || i.categoria ? `<small>${esc([i.linha, i.categoria].filter(Boolean).join(' · '))}</small>` : ''}
        <div class="cat-pe"><span>${i.preco ? brl(i.preco) : '<span class="mudo">sem preço</span>'}</span>${ex ? badge('No estoque · ' + nfmt(qtdProduto(ex)), 'ok') : ed ? `<button class="btn sm" data-add>${icon('plus')}Adicionar</button>` : ''}</div></div>
    </div>`;
  }).join('')}</div>${l.length > F.pag ? `<div class="ta-c" style="margin:14px"><button class="btn" id="mais">Mostrar mais (${nfmt(l.length - F.pag)} restantes)</button></div>` : ''}`
    : vazio('Nenhum produto encontrado com esses filtros.')}
  ${F.sel.size ? `<div class="sel-barra"><span><b>${F.sel.size}</b> produto(s) selecionado(s)</span><button class="btn" id="limpar2">Limpar</button><button class="btn pri" id="addsel">${icon('plus')}Adicionar ao estoque</button></div>` : ''}`;
  a.innerHTML = html;
  ligarMarcas(a);
  const re = () => abaCatalogo(a);
  $('#q', a).oninput = e => { F.q = e.target.value; F.pag = 60; re(); const i = $('#q', a); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  const c = $('#cat', a); if (c) c.onchange = e => { F.cat = e.target.value; re(); };
  $('#novos', a).onchange = e => { F.soNovos = e.target.checked; re(); };
  $('#scan', a).onclick = () => import('../core.js').then(m => m.scanner(cod => { F.q = cod; re(); }));
  const mais = $('#mais', a); if (mais) mais.onclick = () => { F.pag += 60; re(); };
  const st = $('#seltodos', a); if (st) st.onclick = () => { l.slice(0, 500).forEach(i => F.sel.add(k(i))); re(); };
  [$('#limpar', a), $('#limpar2', a)].forEach(b => b && (b.onclick = () => { F.sel.clear(); re(); }));
  const porK = new Map(todos.map(i => [k(i), i]));
  const as = $('#addsel', a); if (as) as.onclick = () => adicionar([...F.sel].map(x => porK.get(x) || Object.values(CAT.itens).flat().find(i => k(i) === x)).filter(Boolean));
  $$('.cat-item', a).forEach(card => card.onclick = e => {
    const it = porK.get(card.dataset.k);
    if (e.target.closest('[data-add]')) return adicionar([it]);
    if (e.target.closest('[data-foto]')) return trocarFoto(it);
    if (!ed) return;
    F.sel.has(card.dataset.k) ? F.sel.delete(card.dataset.k) : F.sel.add(card.dataset.k);
    re();
  });
}
function trocarFoto(it) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    const foto = await reduzirImagem(f, 400, 0.8);
    const nome = ((CAT.marcas || []).find(m => m.id === it.marcaSlug) || {}).nome || it.marca;
    if (await publicarMarca(nome, [{ ...it, foto }], 'mesclar')) { toast('Foto atualizada no catálogo.'); redesenhar(); }
  };
  inp.click();
}
function ligarMarcas(a) { $$('[data-m]', a).forEach(b => b.onclick = () => { F.marca = b.dataset.m; F.cat = ''; F.pag = 60; redesenhar(); }); }

// Admin de uma conta pode ativar a curadoria quando ainda não existe nenhum curador no sistema
function configCuradoria() {
  if (S.curador || S.curadoresExiste || !isAdmin()) return '';
  return `<div class="card" style="margin-top:14px"><h4>${icon('book')} Ativar curadoria do catálogo</h4>
    <p class="mudo pq">Ninguém administra o catálogo ainda. Quem ativa vira curador(a): pode importar tabelas das marcas, aprovar sugestões e adicionar outros curadores. Faça isso com a sua conta antes de divulgar o sistema.</p>
    <button class="btn pri" id="vira">Tornar-me curador(a)</button></div>`;
}
function ligarCuradoria(a) {
  const b = $('#vira', a); if (!b) return;
  b.onclick = async () => {
    if (!await ask(`Ativar a curadoria com ${S.user.email}?`, { ok: 'Ativar' })) return;
    try { await S.db.commit([{ op: 'set', path: 'sistema/curadores', data: { emails: [S.user.email.toLowerCase()] } }]); S.curador = true; S.curadoresExiste = true; F.aba = 'gerenciar'; toast('Você agora é curador(a) do catálogo.'); redesenhar(); }
    catch (e) { toast('Não foi possível: ' + (e.code || e.message), 'erro'); }
  };
}

// ---------------------------------------------------------------- adicionar ao estoque
export function adicionar(itens) {
  return new Promise(resolver => adicionarModal(itens, resolver));
}
function adicionarModal(itens, resolver) {
  if (!pode('produtos', 'editar')) { toast('Você não tem permissão para editar o estoque.', 'erro'); return resolver([]); }
  if (!itens.length) return resolver([]);
  let ids = [];
  const descs = { ...(cfg().descontosMarca || {}) };
  const marcas = [...new Map(itens.map(i => [i.marcaSlug, i.marca])).entries()];
  const custoDe = (i, d) => i.preco ? Math.round(i.preco * (1 - d / 100) * 100) / 100 : '';
  const m = modal({
    titulo: `Adicionar ${itens.length} produto(s) ao estoque`, largo: true,
    corpo: `<div class="grid3" style="margin-bottom:12px">${marcas.map(([s, n]) => `<label class="form">Desconto de revendedora · ${esc(n)} (%)<input data-desc="${s}" inputmode="decimal" value="${nfmt(descs[s] ?? 30, 0)}"></label>`).join('')}
      <label class="form">Validade (aplicar em todos)<input type="date" id="valtodos"></label></div>
    <p class="mudo pq">O custo é calculado pelo preço sugerido menos o seu desconto. Quantidade 0 apenas cadastra o produto, sem entrada no estoque. Produtos que você já tem recebem um novo lote.</p>
    <div class="tabela-w"><table class="tabela mini"><thead><tr><th>Produto</th><th class="n">Qtd.</th><th>Validade</th><th class="n">Custo un.</th><th class="n">Preço de venda</th></tr></thead><tbody>
    ${itens.map((i, k) => { const ex = existente(i); return `<tr data-k="${k}" data-m="${i.marcaSlug}"><td><b>${esc(i.nome)}</b><small class="bl mudo">${esc(i.marca)}${i.ref ? ' · ' + esc(i.ref) : ''}${ex ? ' · já cadastrado (' + nfmt(qtdProduto(ex)) + ' un.)' : ''}</small></td>
      <td class="n"><input class="n w70" name="qtd" inputmode="decimal" value="1"></td><td><input type="date" name="val"></td>
      <td class="n"><input class="n w90" name="custo" inputmode="decimal" value="${i.preco ? nfmt(custoDe(i, descs[i.marcaSlug] ?? 30), 2) : ''}"></td>
      <td class="n"><input class="n w90" name="preco" inputmode="decimal" value="${i.preco ? nfmt(ex && ex.preco ? ex.preco : i.preco, 2) : ''}"></td></tr>`; }).join('')}
    </tbody></table></div>`,
    rodape: `<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Cadastrar no estoque</button>`,
    onClose: () => resolver(ids)
  });
  m.$$('[data-desc]').forEach(inp => inp.oninput = () => {
    const d = parseNum(inp.value);
    m.$$(`tr[data-m="${inp.dataset.desc}"]`).forEach(tr => { const c = $('[name=custo]', tr); if (!c.dataset.manual) { const v = custoDe(itens[+tr.dataset.k], d); c.value = v === '' ? '' : nfmt(v, 2); } });
  });
  m.$$('[name=custo]').forEach(c => c.oninput = () => c.dataset.manual = 1);
  m.$('#valtodos').onchange = e => m.$$('[name=val]').forEach(v => v.value = e.target.value);
  m.$('#ok').onclick = async () => {
    const ops = []; let novos = 0, lotes = 0;
    const loja = !!(S.conta.loja || {}).ativa;
    m.$('#ok').disabled = true;
    await Promise.all(itens.map(async i => { i.foto = await fotoDoItem(i); }));
    m.$('#ok').disabled = false;
    m.$$('tbody tr').forEach(tr => {
      const i = itens[+tr.dataset.k];
      const qtd = parseNum($('[name=qtd]', tr).value), validade = $('[name=val]', tr).value;
      const custo = parseNum($('[name=custo]', tr).value), preco = parseNum($('[name=preco]', tr).value);
      const lote = qtd > 0 ? [{ id: uid(), qtd, validade, custo }] : [];
      const ex = existente(i);
      if (ex) {
        const upd = { lotes: [...(ex.lotes || []), ...lote], atualizadoEm: Date.now() };
        if (custo) upd.custo = custo; if (preco) upd.preco = preco;
        if (!ex.foto && i.foto) upd.foto = i.foto; if (!ex.codigo && i.codigo) upd.codigo = i.codigo;
        ops.push({ op: 'upd', col: 'produtos', id: ex.id, data: upd }, ...opsItemLoja({ ...ex, ...upd })); ids.push(ex.id);
        if (lote.length) lotes++;
      } else {
        const id = uid();
        const p = { nome: i.nome, marca: i.marca, categoria: i.categoria || '', codigo: i.codigo || '', sku: i.ref || '', descricao: i.descricao || '', foto: i.foto || '', custo, preco, precoLoja: 0, estoqueMin: cfg().estoqueMin ?? 1, ativo: true, naLoja: loja, lotes: lote, origemCatalogo: i.marcaSlug, criadoEm: Date.now(), atualizadoEm: Date.now() };
        ops.push({ op: 'set', col: 'produtos', id, data: p }, ...opsItemLoja({ ...p, id })); ids.push(id);
        novos++;
      }
    });
    m.$$('[data-desc]').forEach(inp => descs[inp.dataset.desc] = parseNum(inp.value));
    if (isAdmin()) ops.push({ op: 'upd', col: '@conta', data: { config: { ...cfg(), descontosMarca: descs } } });
    const idsSalvos = ids; ids = [];
    if (await commit(ops, `Adicionou do catálogo: ${novos} produto(s) novo(s), ${lotes} entrada(s) de estoque`)) {
      toast(`${novos} produto(s) cadastrado(s)${lotes ? ` e ${lotes} entrada(s) em produtos existentes` : ''}.`);
      F.sel.clear(); ids = idsSalvos; m.fechar(); redesenhar();
    }
  };
}

// ---------------------------------------------------------------- curadoria
function abaGerenciar(a) {
  const ms = CAT.marcas;
  const minhas = {};
  S.d.produtos.filter(p => p.marca && p.ativo !== false).forEach(p => (minhas[p.marca] = minhas[p.marca] || []).push(p));
  a.innerHTML = `
  <section class="card"><h4>${icon('up')} Importar tabela de uma marca</h4>
    <p class="mudo pq">Use a planilha de produtos e preços que a marca disponibiliza no portal da revendedora (Excel ou CSV). Colunas reconhecidas: <code>marca</code>, <code>codigo_barras</code>, <code>codigo_revista</code>, <code>nome</code>, <code>categoria</code>, <code>linha</code>, <code>preco</code>, <code>foto_url</code> e <code>descricao</code>. Nomes parecidos também funcionam, como "Produto", "EAN", "Preço sugerido" e "Código".</p>
    <div class="barra"><button class="btn pri" id="imp">${icon('up')}Escolher planilha</button><button class="btn" id="modelo">${icon('down')}Baixar modelo</button></div>
  </section>

  <section class="card"><h4>${icon('up')} Fotos do catálogo</h4>
    <p class="mudo pq">As fotos ficam hospedadas de graça no seu próprio GitHub, na pasta <code>catalogo-img/&lt;marca&gt;/</code>, com o nome igual ao código do produto (ex.: <code>catalogo-img/${esc((ms[0] || {}).id || 'natura')}/73852.jpg</code>). O sistema encontra a foto sozinho pelo código. Selecione as imagens que você baixou do banco de imagens da marca: o sistema reconhece o código no nome do arquivo, reduz o tamanho e gera um ZIP pronto para enviar ao GitHub.</p>
    <div class="barra"><select id="fmarca">${ms.map(m => `<option value="${m.id}">${esc(m.nome)}</option>`).join('')}</select><button class="btn pri" id="fotos" ${ms.length ? '' : 'disabled'}>${icon('up')}Escolher imagens</button></div>
    <p class="mudo pq">Para poucos produtos, também dá para tocar no ícone ${icon('up', 'mini')} em cada produto do catálogo e tirar ou escolher a foto ali mesmo.</p>
  </section>

  <section class="card"><h4>${icon('box')} Publicar a partir do meu estoque</h4>
    <p class="mudo pq">Envia para o catálogo os produtos que você já cadastrou: nome, código de barras, categoria, preço de venda (como sugerido) e foto. Custos e quantidades não são publicados.</p>
    ${Object.keys(minhas).length ? `<div class="checks">${Object.entries(minhas).sort().map(([mk, ps]) => `<label class="chk"><input type="checkbox" data-pm="${esc(mk)}"> ${esc(mk)} <span class="mudo">(${ps.length})</span></label>`).join('')}</div>
    <div class="barra" style="margin-top:10px"><button class="btn" id="pubest">Publicar marcas selecionadas</button></div>` : '<p class="mudo pq">Seu estoque ainda não tem produtos com marca.</p>'}
  </section>

  <section class="card"><h4>${icon('users')} Sugestões das revendedoras</h4>
    <p class="mudo pq">Quando alguém cadastra um produto com código de barras que não está no catálogo, ele aparece aqui para você aprovar.</p>
    <div id="sug">${CAT.sugestoes ? '' : `<button class="btn" id="carsug">Ver sugestões</button>`}</div>
  </section>

  <section class="card"><h4>${icon('book')} Marcas no catálogo</h4>
    ${ms.length ? `<div class="tabela-w"><table class="tabela mini"><thead><tr><th>Marca</th><th class="n">Produtos</th><th>Atualizado</th><th></th></tr></thead><tbody>
    ${ms.map(m => `<tr><td><b>${esc(m.nome)}</b></td><td class="n">${nfmt(m.total || 0)}</td><td>${fmtDataHora(m.atualizadoEm)}<small class="bl mudo">${esc(m.por || '')}</small></td>
      <td class="acoes"><button class="btn sm" data-exp="${m.id}">${icon('down')}Exportar</button><button class="btn-ic" data-del="${m.id}" title="Excluir">${icon('trash')}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="mudo pq">Nenhuma marca publicada.</p>'}
  </section>

  ${S.db.modo !== 'demo' ? `<section class="card"><h4>${icon('team')} Curadores</h4><div id="cur"><button class="btn" id="carcur">Ver curadores</button></div></section>` : ''}`;

  $('#modelo', a).onclick = () => baixar('modelo-catalogo-marca.csv', toCSV(MODELO, COLS_MODELO));
  $('#imp', a).onclick = importar;
  const bf = $('#fotos', a); if (bf) bf.onclick = () => prepararFotos($('#fmarca', a).value);
  const pe = $('#pubest', a);
  if (pe) pe.onclick = async () => {
    const sel = $$('[data-pm]:checked', a).map(c => c.dataset.pm);
    if (!sel.length) return toast('Marque ao menos uma marca.', 'aviso');
    let tot = 0;
    for (const mk of sel) tot += await publicarMarca(mk, minhas[mk].map(p => ({ nome: p.nome, codigo: p.codigo, ref: p.sku, categoria: p.categoria, preco: p.preco, foto: p.foto, descricao: p.descricao })), 'mesclar');
    if (tot) { toast(`Catálogo atualizado (${nfmt(tot)} produtos nas marcas publicadas).`); redesenhar(); }
  };
  $$('[data-exp]', a).forEach(b => b.onclick = async () => {
    const m = ms.find(x => x.id === b.dataset.exp); const it = await carregarItens(m.id);
    baixar(`catalogo-${m.id}-${hoje()}.csv`, toCSV(it.map(i => ({ ...i, marca: m.nome, codigo_barras: i.codigo, codigo_revista: i.ref, foto_url: String(i.foto || '').startsWith('data:') ? '' : i.foto, preco: i.preco ? nfmt(i.preco, 2) : '' })), COLS_MODELO));
  });
  $$('[data-del]', a).forEach(b => b.onclick = async () => {
    const m = ms.find(x => x.id === b.dataset.del);
    if (await ask(`Excluir a marca ${m.nome} do catálogo (${m.total} produtos)? O estoque das revendedoras não é afetado.`, { perigo: true, ok: 'Excluir' })) excluirMarca(m);
  });
  const cs = $('#carsug', a); if (cs) cs.onclick = async () => { try { CAT.sugestoes = await S.db.lerCol('catalogo_sugestoes'); } catch (e) { return toast('Erro: ' + (e.code || e.message), 'erro'); } abaGerenciar(a); };
  if (CAT.sugestoes) desenharSugestoes($('#sug', a), a);
  const cc = $('#carcur', a); if (cc) cc.onclick = () => desenharCuradores($('#cur', a));
}

function desenharSugestoes(box, raiz) {
  const l = [...CAT.sugestoes].sort((x, y) => (x.marca || '').localeCompare(y.marca || '') || x.nome.localeCompare(y.nome));
  if (!l.length) { box.innerHTML = '<p class="mudo pq">Nenhuma sugestão pendente.</p>'; return; }
  box.innerHTML = `<div class="tabela-w"><table class="tabela mini"><thead><tr><th><input type="checkbox" id="todas"></th><th>Produto</th><th>Marca</th><th>Código de barras</th><th class="n">Preço</th><th>Enviado por</th></tr></thead><tbody>
    ${l.map(s => `<tr><td><input type="checkbox" data-s="${s.id}"></td><td>${s.foto ? `<img src="${esc(s.foto)}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:6px">` : ''}<b>${esc(s.nome)}</b><small class="bl mudo">${esc(s.categoria || '')}</small></td>
      <td><input class="w-marca" data-sm="${s.id}" value="${esc(s.marca || '')}"></td><td>${esc(s.codigo)}</td><td class="n">${s.preco ? brl(s.preco) : '—'}</td><td>${esc(s.porNome || '')}<small class="bl mudo">${fmtDataHora(s.em)}</small></td></tr>`).join('')}
  </tbody></table></div>
  <div class="barra" style="margin-top:10px"><button class="btn pri" id="aprova">${icon('check')}Aprovar selecionadas</button><button class="btn perigo-txt" id="descarta">${icon('trash')}Descartar selecionadas</button>
  <span class="mudo pq">Corrija o nome da marca antes de aprovar, se precisar. Marcas iguais são agrupadas.</span></div>`;
  $('#todas', box).onchange = e => $$('[data-s]', box).forEach(c => c.checked = e.target.checked);
  const marcados = () => $$('[data-s]:checked', box).map(c => CAT.sugestoes.find(s => s.id === c.dataset.s));
  $('#aprova', box).onclick = async () => {
    const sel = marcados(); if (!sel.length) return toast('Marque ao menos uma sugestão.', 'aviso');
    const grupos = {};
    sel.forEach(s => { const mk = ($(`[data-sm="${s.id}"]`, box).value || s.marca || '').trim(); if (mk) (grupos[mk] = grupos[mk] || []).push(s); });
    // agrupa por slug para não duplicar "Natura" e "natura"
    const porSlug = {};
    Object.entries(grupos).forEach(([mk, ss]) => { const sl = slugify(mk); const nomeExist = ((CAT.marcas || []).find(m => m.id === sl) || {}).nome; (porSlug[sl] = porSlug[sl] || { nome: nomeExist || mk, itens: [] }).itens.push(...ss); });
    let ok = 0;
    for (const { nome, itens } of Object.values(porSlug)) ok += await publicarMarca(nome, itens, 'mesclar') ? itens.length : 0;
    if (ok) {
      await commit(sel.map(s => ({ op: 'del', path: `catalogo_sugestoes/${s.id}` })));
      CAT.sugestoes = CAT.sugestoes.filter(s => !sel.includes(s));
      toast(`${ok} produto(s) aprovados no catálogo.`); redesenhar();
    }
  };
  $('#descarta', box).onclick = async () => {
    const sel = marcados(); if (!sel.length) return;
    if (await commit(sel.map(s => ({ op: 'del', path: `catalogo_sugestoes/${s.id}` })))) { CAT.sugestoes = CAT.sugestoes.filter(s => !sel.includes(s)); abaGerenciar(raiz); }
  };
}

async function desenharCuradores(box) {
  let d; try { d = await S.db.lerDoc('sistema/curadores'); } catch (e) { box.textContent = 'Erro: ' + (e.code || e.message); return; }
  const emails = (d && d.emails) || [];
  box.innerHTML = `<ul class="lista">${emails.map(e => `<li><span>${esc(e)}</span>${e !== (S.user.email || '').toLowerCase() ? `<button class="btn-ic" data-rm="${esc(e)}">${icon('trash')}</button>` : '<small class="mudo">você</small>'}</li>`).join('')}</ul>
  <div class="barra" style="margin-top:8px"><input type="email" id="novoc" placeholder="e-mail do novo curador" style="max-width:300px"><button class="btn" id="addc">${icon('plus')}Adicionar</button></div>`;
  const salvar = async lista => { if (await commit([{ op: 'set', path: 'sistema/curadores', data: { emails: lista } }])) { toast('Curadores atualizados.'); desenharCuradores(box); } };
  $('#addc', box).onclick = () => { const e = $('#novoc', box).value.trim().toLowerCase(); if (!/@/.test(e)) return toast('E-mail inválido.', 'aviso'); if (!emails.includes(e)) salvar([...emails, e]); };
  $$('[data-rm]', box).forEach(b => b.onclick = async () => { if (await ask(`Remover ${b.dataset.rm} da curadoria?`)) salvar(emails.filter(e => e !== b.dataset.rm)); });
}

async function importar() {
  const rows = await lerPlanilha(); if (!rows) return;
  const lidos = rows.map(mapear).filter(r => r.nome || r.codigo);
  if (!lidos.length) return toast('Não encontrei produtos nem códigos. Confira se a primeira linha tem os nomes das colunas (ex.: nome, preco, codigo_barras).', 'erro');
  const comMarca = lidos.filter(r => r.marca).length;
  const marcasPlan = [...new Set(lidos.map(r => r.marca).filter(Boolean))];
  const m = modal({
    titulo: 'Importar para o catálogo',
    corpo: `<p>Encontrei <b>${nfmt(lidos.length)}</b> produto(s)${marcasPlan.length ? ` de <b>${marcasPlan.length}</b> marca(s) na planilha: ${esc(marcasPlan.slice(0, 6).join(', '))}${marcasPlan.length > 6 ? '…' : ''}` : ''}.
      ${nfmt(lidos.filter(r => r.codigo).length)} têm código de barras, ${nfmt(lidos.filter(r => r.preco).length)} têm preço e ${nfmt(lidos.filter(r => r.foto).length)} têm foto.</p>
    <form class="form" id="fi">
      <label>${comMarca === lidos.length ? 'Marca (já informada na planilha)' : 'Marca dos produtos sem marca na planilha *'}<input name="marca" list="dl-cm" value="${esc(marcasPlan.length === 1 ? marcasPlan[0] : '')}" ${comMarca === lidos.length ? '' : 'required'}></label>
      <datalist id="dl-cm">${(CAT.marcas || []).map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
      <label class="chk"><input type="radio" name="modo" value="mesclar" checked> Mesclar: atualiza os produtos existentes e acrescenta os novos</label>
      <label class="chk"><input type="radio" name="modo" value="substituir"> Substituir: a marca passa a ter só os produtos desta planilha</label>
    </form>
    <div class="tabela-w" style="max-height:240px;overflow:auto;margin-top:10px"><table class="tabela mini"><thead><tr><th>Produto</th><th>Código</th><th class="n">Preço</th></tr></thead><tbody>
      ${lidos.slice(0, 12).map(r => `<tr><td>${esc(r.nome)}<small class="bl mudo">${esc([r.marca, r.categoria].filter(Boolean).join(' · '))}</small></td><td>${esc(r.codigo || r.ref || '')}</td><td class="n">${r.preco ? brl(r.preco) : '—'}</td></tr>`).join('')}
      ${lidos.length > 12 ? `<tr><td colspan="3" class="mudo">… e mais ${nfmt(lidos.length - 12)}</td></tr>` : ''}</tbody></table></div>`,
    rodape: `<span id="semnome" class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('up')}Publicar no catálogo</button>`
  });
  const semNome = () => lidos.filter(r => !r.nome && r.codigo);
  const caixa = () => {
    const n = semNome().length, temCosmos = cfg().cosmosProxy || cfg().cosmosToken;
    m.$('#semnome').innerHTML = !n ? '' : temCosmos ? `<button class="btn" id="completar">${icon('search')}Completar ${n} pelo código (Cosmos)</button>`
      : `<span class="mudo pq">${n} linha(s) só com código serão ignoradas. Configure a Cosmos em Configurações para completá-las.</span>`;
    const b = m.$('#completar'); if (b) b.onclick = completar;
  };
  const completar = async () => {
    const lista = semNome(); let ok = 0, k = 0;
    for (const r of lista) {
      if (!m.el.isConnected) return;
      m.$('#completar').textContent = `Consultando ${++k}/${lista.length}…`; m.$('#completar').disabled = true;
      const x = await buscarCosmos(r.codigo);
      if (x && x.erro) { toast(x.erro === 'limite' ? `Limite diário da Cosmos atingido após ${ok} consulta(s). Continue amanhã.` : 'Token da Cosmos inválido.', 'aviso'); break; }
      if (x) { r.nome = x.nome; r.marca = r.marca || x.marca; r.foto = r.foto || x.foto; r.categoria = r.categoria || x.categoria; r.preco = r.preco || x.preco; ok++; }
      await new Promise(s => setTimeout(s, 350));
    }
    toast(`${ok} produto(s) completados pela Cosmos.`);
    const inp = m.$('#fi').marca; if (lidos.filter(r => r.nome).every(r => r.marca)) inp.required = false;
    caixa();
  };
  caixa();
  m.$('#ok').onclick = async () => {
    const f = m.$('#fi'); if (!f.reportValidity()) return;
    const modo = f.modo.value, padrao = f.marca.value.trim();
    const grupos = {};
    lidos.filter(r => r.nome).forEach(r => { const mk = r.marca || padrao; if (mk) (grupos[mk] = grupos[mk] || []).push(r); });
    m.$('#ok').disabled = true; m.$('#ok').textContent = 'Publicando…';
    let tot = 0;
    for (const [mk, its] of Object.entries(grupos)) tot += await publicarMarca(mk, its, modo);
    m.$('#ok').disabled = false;
    if (tot) { toast(`Catálogo publicado: ${nfmt(tot)} produto(s).`); m.fechar(); F.aba = 'catalogo'; F.marca = slugify(Object.keys(grupos)[0]); redesenhar(); }
  };
}

// importação direta (usada pelo "Importar dados iniciais"): torna-se curador se ninguém for, e publica
export async function importarCatalogoTexto(txt) {
  if (!S.curador) {
    const d = await S.db.lerDoc('sistema/curadores').catch(() => null);
    if (d) return { erro: 'Você não é curador(a) do catálogo.' };
    await S.db.commit([{ op: 'set', path: 'sistema/curadores', data: { emails: [S.user.email.toLowerCase()] } }]);
    S.curador = true; S.curadoresExiste = true;
  }
  const lidos = parseCSV(txt).map(mapear).filter(r => r.nome);
  const grupos = {}; lidos.forEach(r => { if (r.marca) (grupos[r.marca] = grupos[r.marca] || []).push(r); });
  let tot = 0; for (const [mk, its] of Object.entries(grupos)) tot += await publicarMarca(mk, its, 'mesclar');
  return { tot };
}

// ---------------------------------------------------------------- fotos em lote → ZIP para o GitHub
async function prepararFotos(slug) {
  const meta = (CAT.marcas || []).find(m => m.id === slug); if (!meta) return;
  const itens = await carregarItens(slug);
  const porChave = new Map();
  itens.forEach(i => { const r = normRef(i.ref); if (r) porChave.set(r, i); const e = soDigitos(i.codigo); if (e) porChave.set(e, i); });
  const arquivos = await new Promise(res => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => res([...inp.files]); inp.click(); });
  if (!arquivos.length) return;
  // reconhece o código no nome do arquivo: tenta cada sequência de letras/números
  const casar = nome => {
    const base = nome.replace(/\.[^.]+$/, '');
    const toks = base.split(/[^A-Za-z0-9]+/).filter(Boolean);
    for (const t of [base, ...toks]) { const k = normRef(t); if (porChave.has(k)) return porChave.get(k); const d = soDigitos(t); if (d && porChave.has(d)) return porChave.get(d); }
    return null;
  };
  const linhas = arquivos.map(a => ({ a, item: casar(a.name) }));
  const ok = linhas.filter(l => l.item), sem = linhas.filter(l => !l.item);
  const semFoto = itens.filter(i => !i.foto && !linhas.some(l => l.item === i)).length;
  const m = modal({
    titulo: `Fotos para ${meta.nome}`, largo: true,
    corpo: `<p><b>${ok.length}</b> imagem(ns) reconhecida(s) pelo código${sem.length ? ` · <b class="t-perigo">${sem.length}</b> sem código reconhecido` : ''}. ${semFoto} produto(s) desta marca seguem sem foto gravada (fotos já enviadas ao GitHub também contam como "sem foto gravada").</p>
      ${sem.length ? `<details style="margin-bottom:10px"><summary class="pq">Ver arquivos não reconhecidos (renomeie com o código do produto)</summary><p class="mudo pq">${sem.map(l => esc(l.a.name)).join(', ')}</p></details>` : ''}
      <div class="tabela-w" style="max-height:300px;overflow:auto"><table class="tabela mini"><tbody>${ok.slice(0, 200).map(l => `<tr><td>${esc(l.a.name)}</td><td>→ <b>${esc(chaveFoto(l.item))}.jpg</b></td><td>${esc(l.item.nome)}</td></tr>`).join('')}</tbody></table></div>
      <div class="card" style="margin-top:12px"><b>Como enviar ao GitHub</b><ol class="pq" style="margin:6px 0 0;padding-left:18px">
        <li>Clique em <b>Baixar ZIP</b> e descompacte no computador.</li>
        <li>No repositório do sistema no GitHub: <b>Add file → Upload files</b>.</li>
        <li>Arraste a pasta <code>catalogo-img</code> que veio no ZIP (até 100 arquivos por envio) e clique em <b>Commit changes</b>.</li>
        <li>Em 1 a 2 minutos as fotos aparecem no catálogo para todas as revendedoras.</li></ol></div>`,
    rodape: `<span class="grow mudo pq" id="prog"></span><button class="btn" data-fechar>Fechar</button><button class="btn" id="direto" ${ok.length ? '' : 'disabled'} title="Grava as fotos no banco de dados (use para poucas fotos)">Salvar direto no catálogo</button><button class="btn pri" id="zip" ${ok.length ? '' : 'disabled'}>${icon('down')}Baixar ZIP</button>`
  });
  m.$('#zip').onclick = async () => {
    if (!window.JSZip) return toast('Biblioteca de ZIP indisponível agora. Verifique a internet e recarregue.', 'erro');
    const zip = new JSZip(); const pasta = zip.folder('catalogo-img').folder(slug);
    m.$('#zip').disabled = true;
    for (let k = 0; k < ok.length; k++) {
      m.$('#prog').textContent = `Preparando ${k + 1}/${ok.length}…`;
      const d = await reduzirImagem(ok[k].a, 600, 0.82);
      pasta.file(`${chaveFoto(ok[k].item)}.jpg`, d.split(',')[1], { base64: true });
    }
    m.$('#prog').textContent = 'Compactando…';
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fotos-${slug}-${hoje()}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    m.$('#prog').textContent = 'ZIP baixado. Envie a pasta catalogo-img ao GitHub.'; m.$('#zip').disabled = false;
  };
  m.$('#direto').onclick = async () => {
    if (ok.length > 60 && !await ask(`Gravar ${ok.length} fotos direto no banco deixa o catálogo mais pesado para carregar. Para muitas fotos, o ZIP no GitHub é melhor. Continuar mesmo assim?`, { ok: 'Continuar' })) return;
    m.$('#direto').disabled = true; const novos = [];
    for (let k = 0; k < ok.length; k++) { m.$('#prog').textContent = `Reduzindo ${k + 1}/${ok.length}…`; novos.push({ ...ok[k].item, foto: await reduzirImagem(ok[k].a, 300, 0.75) }); }
    m.$('#prog').textContent = 'Publicando…';
    if (await publicarMarca(meta.nome, novos, 'mesclar')) { toast(`${novos.length} foto(s) salvas no catálogo.`); m.fechar(); redesenhar(); }
    else m.$('#direto').disabled = false;
  };
}
