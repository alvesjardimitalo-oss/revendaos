// Estado global, componentes de interface e regras compartilhadas
import { $, $$, esc, uid, r2, hoje, norm, brl } from './utils.js';

export const S = {
  curador: false, curadoresExiste: true,
  db: null, user: null, contaId: null, conta: {}, membro: {},
  d: { produtos: [], clientes: [], vendas: [], recebiveis: [], lancamentos: [], compras: [], promocoes: [], consorcios: [], membros: [], logs: [], pedidos: [], convites: [] },
  rota: 'dashboard', params: {}
};

export const MODS = [
  { id: 'dashboard', nome: 'Início', ic: 'home' },
  { id: 'vendas', nome: 'Vendas', ic: 'cart' },
  { id: 'cobrancas', nome: 'Cobranças', ic: 'cash' },
  { id: 'clientes', nome: 'Clientes', ic: 'users' },
  { id: 'consorcios', nome: 'Consórcios', ic: 'layers' },
  { id: 'produtos', nome: 'Estoque', ic: 'box' },
  { id: 'catalogo', nome: 'Catálogo de marcas', ic: 'book' },
  { id: 'compras', nome: 'Compras', ic: 'truck' },
  { id: 'financeiro', nome: 'Financeiro', ic: 'wallet' },
  { id: 'relatorios', nome: 'Relatórios', ic: 'chart' },
  { id: 'promocoes', nome: 'Promoções', ic: 'tag' },
  { id: 'loja', nome: 'Loja virtual', ic: 'store' },
  { id: 'equipe', nome: 'Equipe', ic: 'team' },
  { id: 'config', nome: 'Configurações', ic: 'gear' }
];

export const FORMAS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Fiado / a prazo', 'Boleto', 'Outro'];
export const ENTREGA = { pendente: 'Pendente', separado: 'Separado', enviado: 'Enviado', entregue: 'Entregue' };

export const cfg = () => S.conta.config || {};
export const isAdmin = () => S.membro.papel === 'admin';
export function pode(mod, nivel = 'ver') {
  if (isAdmin()) return true;
  if (mod === 'dashboard' || mod === 'catalogo') return true;
  if (mod === 'equipe' || mod === 'config') return false;
  const p = (S.membro.permissoes || {})[mod] || 'nenhum';
  return nivel === 'ver' ? p !== 'nenhum' : p === 'editar';
}

// ---------------- ícones (traço) ----------------
const IC = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 21c0-3-1.8-5.5-4.5-6.5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  truck: '<path d="M1 5h13v11H1zM14 9h4l3 3v4h-7z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  wallet: '<rect x="2" y="5" width="20" height="15" rx="2"/><path d="M16 13h2M2 9h20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  store: '<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18"/><path d="M9 20v-6h6v6"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  scan: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  wa: '<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9c0 3 3 6 6 6l1.3-1.6-2-1-1 .9c-1-.4-2.2-1.6-2.6-2.6l.9-1-1-2z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  down: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  up: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
  pix: '<path d="M12 2.5 21.5 12 12 21.5 2.5 12z"/><path d="M8 9l4 4 4-4M8 15l4-4 4 4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  print: '<path d="M6 9V3h12v6M6 18H3v-8h18v8h-3M7 14h10v7H7z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  layers: '<path d="M12 3 2 8l10 5 10-5z"/><path d="M2 13l10 5 10-5"/>',
  book: '<path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z"/><path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/>',
  gift: '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'
};
export const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;

// ---------------- toast / modal / confirmação ----------------
export function toast(msg, tipo = 'ok') {
  let w = $('#toasts'); if (!w) { w = document.createElement('div'); w.id = 'toasts'; document.body.appendChild(w); }
  const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg; w.appendChild(t);
  setTimeout(() => t.classList.add('sai'), 3200); setTimeout(() => t.remove(), 3700);
}

export function modal({ titulo, corpo, rodape = '', largo = false, onOpen, onClose }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h3>${esc(titulo)}</h3><button class="btn-ic" data-fechar title="Fechar">${icon('x')}</button></div>
    <div class="modal-b">${corpo}</div>${rodape ? `<div class="modal-f">${rodape}</div>` : ''}</div>`;
  document.body.appendChild(bg);
  const fechar = () => { bg.remove(); document.removeEventListener('keydown', esc_); onClose && onClose(); };
  const esc_ = e => { if (e.key === 'Escape' && bg === $$('.modal-bg').pop()) fechar(); };
  document.addEventListener('keydown', esc_);
  bg.addEventListener('mousedown', e => { if (e.target === bg) bg.dataset.down = 1; });
  bg.addEventListener('click', e => { if (e.target === bg && bg.dataset.down) fechar(); delete bg.dataset.down; });
  $$('[data-fechar]', bg).forEach(b => b.onclick = fechar);
  const m = { el: bg, fechar, $: s => $(s, bg), $$: s => $$(s, bg) };
  onOpen && onOpen(m);
  const f = $('input:not([type=hidden]):not([readonly]),select,textarea', $('.modal-b', bg)); if (f && !matchMedia('(pointer:coarse)').matches) setTimeout(() => f.focus(), 30);
  return m;
}

export function ask(msg, { ok = 'Confirmar', perigo = false, titulo = 'Confirmar' } = {}) {
  return new Promise(res => {
    let r = false;
    const m = modal({
      titulo, corpo: `<p>${esc(msg)}</p>`,
      rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn ${perigo ? 'perigo' : 'pri'}" data-ok>${esc(ok)}</button>`,
      onClose: () => res(r)
    });
    m.$('[data-ok]').onclick = () => { r = true; m.fechar(); };
  });
}

// ---------------- gravação ----------------
export async function commit(ops, acao) {
  if (acao) ops.push({ op: 'set', col: 'logs', id: uid(), data: { quando: Date.now(), uid: S.user.uid, nome: S.membro.nome || S.user.nome, acao } });
  try { await S.db.commit(ops); return true; }
  catch (e) { console.error(e); toast('Erro ao salvar: ' + (e.code || e.message), 'erro'); return false; }
}

export function navegar(rota, params) { S.params = params || {}; location.hash = '#/' + rota; }

// ---------------- cálculos ----------------
export const ehKit = p => !!(p && Array.isArray(p.kit) && p.kit.length);
const qtdLotes = p => r2((p.lotes || []).reduce((s, l) => s + (Number(l.qtd) || 0), 0));
// Kit: quantos kits dá para montar com o estoque dos componentes
export const qtdProduto = p => {
  if (!p) return 0;
  if (!ehKit(p)) return qtdLotes(p);
  return Math.max(0, Math.min(...p.kit.map(c => { const x = S.d.produtos.find(q => q.id === c.prodId); return x && !ehKit(x) ? Math.floor(qtdLotes(x) / (Number(c.qtd) || 1)) : 0; })));
};
export const validadeProxima = p => {
  if (ehKit(p)) return p.kit.map(c => validadeProxima(S.d.produtos.find(q => q.id === c.prodId) || {})).filter(Boolean).sort()[0] || '';
  return (p.lotes || []).filter(l => l.qtd > 0 && l.validade).map(l => l.validade).sort()[0] || '';
};
export const custoKit = p => r2((p.kit || []).reduce((s, c) => s + (Number(c.qtd) || 0) * ((S.d.produtos.find(q => q.id === c.prodId) || {}).custo || 0), 0));

// Promoções: retorna a melhor promoção ativa para o produto no canal ('balcao' ou 'loja')
export function promoAtiva(p, canal = 'balcao', data = hoje()) {
  let melhor = null;
  for (const pr of S.d.promocoes || []) {
    if (pr.ativa === false || (pr.inicio && data < pr.inicio) || (pr.fim && data > pr.fim)) continue;
    if (pr.canal && pr.canal !== 'todos' && pr.canal !== canal) continue;
    const alvo = pr.alvo || 'produtos';
    const ok = alvo === 'todos' || (alvo === 'produtos' && (pr.ids || []).includes(p.id)) || (alvo === 'categoria' && norm(pr.categoria) === norm(p.categoria)) || (alvo === 'marca' && norm(pr.marca) === norm(p.marca));
    if (!ok) continue;
    const base = canal === 'loja' ? (Number(p.precoLoja) || Number(p.preco) || 0) : (Number(p.preco) || 0);
    const preco = pr.tipo === 'preco' && alvo === 'produtos' ? Number(pr.valor) : r2(base * (1 - (Number(pr.valor) || 0) / 100));
    if (preco > 0 && preco < base && (!melhor || preco < melhor.preco)) melhor = { preco, promo: pr, base };
  }
  return melhor;
}
export const precoVenda = (p, canal = 'balcao') => { const m = promoAtiva(p, canal); return m ? m.preco : (canal === 'loja' ? (Number(p.precoLoja) || Number(p.preco) || 0) : (Number(p.preco) || 0)); };

// Taxa da maquininha conforme forma e número de parcelas
export function taxaCartao(forma, n = 1) {
  const t = cfg().taxas || {};
  if (forma === 'Cartão de débito') return Number(t.debito) || 0;
  if (forma === 'Cartão de crédito') return Number((t.credito || [])[Math.max(0, Math.min(11, n - 1))]) || 0;
  return 0;
}
export const saldoRec = r => r2((Number(r.valor) || 0) - (Number(r.pago) || 0));
export function statusRec(r) {
  if (r.cancelado) return 'cancelado';
  if (saldoRec(r) <= 0.004) return 'pago';
  return r.vencimento < hoje() ? 'vencido' : 'aberto';
}
export const abertoCliente = id => r2(S.d.recebiveis.filter(r => r.clienteId === id && !r.cancelado).reduce((s, r) => s + Math.max(0, saldoRec(r)), 0));
export const prodPorId = id => S.d.produtos.find(p => p.id === id);
export const cliPorId = id => S.d.clientes.find(c => c.id === id);
export const vendasValidas = () => S.d.vendas.filter(v => !v.cancelada);
export const proxNumero = col => (S.d[col].reduce((m, x) => Math.max(m, Number(x.numero) || 0), 0) + 1);

// Etiquetas coloridas: consórcios G1, G2… têm cor fixa por grupo; as demais, cor estável pelo texto
const CORES_ETQ = ['#d32f4f', '#1e88e5', '#5f5f5f', '#c026d3', '#c9a227', '#00897b', '#f4511e', '#3949ab', '#6d4c41', '#43a047'];
export function corEtiqueta(t) {
  const g = String(t).match(/cons[oó]rcio\s*g\s*(\d+)/i);
  if (g) return CORES_ETQ[(+g[1] - 1) % CORES_ETQ.length];
  let h = 0; for (const ch of String(t)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_ETQ[(h % (CORES_ETQ.length - 5)) + 5];
}
export const chip = t => `<span class="chip-etq" style="background:${corEtiqueta(t)}">${esc(t)}</span>`;
export const badge = (txt, cls = '') => `<span class="badge ${cls}">${esc(txt)}</span>`;
export const STATUS_REC = { aberto: ['Em aberto', 'info'], vencido: ['Vencido', 'perigo'], pago: ['Pago', 'ok'], cancelado: ['Cancelado', 'mudo'] };
export const vazio = (txt, acao = '') => `<div class="vazio">${icon('box')}<p>${esc(txt)}</p>${acao}</div>`;

// Baixa de estoque por validade (primeiro o que vence antes) — retorna novos lotes e o que foi baixado
export function baixarLotes(lotes, qtd) {
  const ls = (lotes || []).map(l => ({ ...l })).sort((a, b) => (a.validade || '9999') < (b.validade || '9999') ? -1 : 1);
  const baixas = []; let falta = qtd;
  for (const l of ls) {
    if (falta <= 0) break;
    const tira = Math.min(l.qtd, falta);
    if (tira > 0) { l.qtd = r2(l.qtd - tira); falta = r2(falta - tira); baixas.push({ loteId: l.id, qtd: tira, validade: l.validade || '', custo: l.custo || 0 }); }
  }
  if (falta > 0) baixas.push({ loteId: null, qtd: falta, validade: '', custo: 0, semEstoque: true });
  return { lotes: ls.filter(l => l.qtd > 0), baixas };
}
export function devolverLotes(lotes, baixas) {
  const ls = (lotes || []).map(l => ({ ...l }));
  for (const b of baixas || []) {
    if (b.semEstoque) continue;
    const l = ls.find(x => x.id === b.loteId);
    if (l) l.qtd = r2(l.qtd + b.qtd); else ls.push({ id: b.loteId || uid(), qtd: b.qtd, validade: b.validade, custo: b.custo });
  }
  return ls;
}

// ---------------- leitor de código de barras ----------------
export function scanner(onCode) {
  if (!window.Html5Qrcode) { toast('Leitor indisponível (sem internet para carregar a biblioteca).', 'erro'); return; }
  let leitor;
  const m = modal({
    titulo: 'Ler código de barras',
    corpo: `<div id="leitor" class="leitor"></div><p class="mudo pq">Aponte a câmera para o código de barras do produto.</p>`,
    onClose: () => { try { leitor && leitor.stop().catch(() => { }); } catch { } }
  });
  leitor = new Html5Qrcode('leitor');
  leitor.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, txt => {
    if (navigator.vibrate) navigator.vibrate(80);
    m.fechar(); onCode(txt.trim());
  }, () => { }).catch(e => { toast('Não foi possível abrir a câmera: ' + e, 'erro'); m.fechar(); });
}

// ---------------- busca de produto (autocompletar) ----------------
const normRefC = r => { let s = String(r || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0'; return s; };
export function buscaProduto(container, onPick, { placeholder = 'Código do produto ou nome…', soComEstoque = false } = {}) {
  container.innerHTML = `<div class="busca-prod"><div class="campo-ic">${icon('search')}<input type="search" placeholder="${placeholder}" autocomplete="off"></div>
    <button type="button" class="btn" data-scan title="Ler código">${icon('scan')}</button><div class="sugestoes"></div></div>`;
  const inp = $('input', container), sug = $('.sugestoes', container);
  const achar = q => {
    const n = norm(q), nr = normRefC(q);
    return S.d.produtos.filter(p => p.ativo !== false && (!soComEstoque || qtdProduto(p) > 0) &&
      (norm(p.nome).includes(n) || norm(p.marca).includes(n) || String(p.codigo || '') === q.trim() || (nr && normRefC(p.sku) === nr))).slice(0, 12);
  };
  const mostrar = () => {
    const q = inp.value.trim(); if (!q) { sug.innerHTML = ''; sug.hidden = true; return; }
    const l = achar(q);
    sug.hidden = false;
    const pareceCodigo = /^[A-Za-z0-9.\- ]{2,14}$/.test(q) && /\d/.test(q);
    sug.innerHTML = (l.length ? l.map(p => `<button type="button" data-id="${p.id}">${p.foto ? `<img src="${p.foto}" alt="">` : '<span class="mini-ph"></span>'}<span><b>${esc(p.nome)}</b><small>${esc(p.marca || '')} · estoque ${qtdProduto(p)}</small></span><em>${brl(p.preco)}</em></button>`).join('')
      : `<div class="mudo pq" style="padding:10px">Nenhum produto seu com esse nome ou código.</div>`)
      + (pareceCodigo && !l.some(p => normRefC(p.sku) === normRefC(q)) ? `<button type="button" data-global>${icon('book')}<span><b>Buscar o código ${esc(q)} no catálogo global</b><small>Cadastra no seu estoque e adiciona aqui</small></span></button>` : '');
  };
  const doCatalogo = async q => {
    sug.hidden = true;
    const cat = await import('./modules/catalogo.js');
    const l = await cat.buscarRef(q);
    if (!l.length) return toast(`Código ${q} não encontrado no catálogo global.`, 'aviso');
    const seguir = async item => {
      const ids = await cat.adicionar([item]);
      if (!ids.length) return;
      for (let k = 0; k < 30; k++) { const p = prodPorId(ids[0]); if (p) { onPick(p); return; } await new Promise(r => setTimeout(r, 100)); }
    };
    l.length === 1 ? seguir(l[0]) : cat.escolherItem(l, seguir);
  };
  inp.addEventListener('input', mostrar);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = inp.value.trim(); if (!q) return;
      const exato = S.d.produtos.find(p => p.ativo !== false && ((p.codigo && String(p.codigo) === q) || (p.sku && normRefC(p.sku) === normRefC(q))));
      const p = exato || achar(q)[0];
      if (p) { onPick(p); inp.value = ''; mostrar(); }
      else if (/\d/.test(q)) { inp.value = ''; mostrar(); doCatalogo(q); }
    }
  });
  sug.addEventListener('click', e => { if (e.target.closest('[data-global]')) { const q = inp.value.trim(); inp.value = ''; mostrar(); return doCatalogo(q); } const b = e.target.closest('button[data-id]'); if (!b) return; onPick(prodPorId(b.dataset.id)); inp.value = ''; mostrar(); inp.focus(); });
  document.addEventListener('click', e => { if (!container.contains(e.target)) sug.hidden = true; });
  $('[data-scan]', container).onclick = () => scanner(code => {
    const p = S.d.produtos.find(x => String(x.codigo) === code);
    if (p) onPick(p); else { inp.value = code; mostrar(); toast('Código ' + code + ' não cadastrado.', 'aviso'); }
  });
  return inp;
}

// Seleção de vários produtos de uma vez (venda e compra)
export function selecionarVarios(onAdd, { soComEstoque = false, titulo = 'Selecionar produtos' } = {}) {
  const sel = new Map(); let q = '';
  const m = modal({
    titulo, largo: true,
    corpo: `<div class="barra"><div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Filtrar por código, nome, marca ou categoria"></div><label class="chk"><input type="checkbox" id="ce" ${soComEstoque ? 'checked' : ''}> Só com estoque</label></div><div id="lst" class="tabela-w" style="max-height:55vh;overflow:auto"></div>`,
    rodape: `<span class="grow mudo pq" id="cont">Nenhum selecionado</span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('plus')}Adicionar</button>`
  });
  const desenhar = () => {
    const n = norm(q), ce = m.$('#ce').checked;
    const l = S.d.produtos.filter(p => p.ativo !== false && (!ce || qtdProduto(p) > 0) && (!n || norm(`${p.sku || ''} ${p.nome} ${p.marca || ''} ${p.categoria || ''}`).includes(n))).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 300);
    m.$('#lst').innerHTML = l.length ? `<table class="tabela mini"><tbody>${l.map(p => `<tr class="clicavel" data-id="${p.id}"><td style="width:30px"><input type="checkbox" ${sel.has(p.id) ? 'checked' : ''}></td><td><b>${esc(p.nome)}</b><small class="bl mudo">${p.sku ? 'cód. ' + esc(p.sku) + ' · ' : ''}${esc(p.marca || '')}</small></td><td class="n">${qtdProduto(p)} un.</td><td class="n">${brl(precoVenda(p))}</td><td class="n" style="width:110px">${sel.has(p.id) ? `<div class="qtd"><button type="button" data-m>−</button><span>${sel.get(p.id)}</span><button type="button" data-p>+</button></div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="mudo pq" style="padding:14px">Nenhum produto.</p>';
    const tot = [...sel.values()].reduce((s, x) => s + x, 0);
    m.$('#cont').textContent = sel.size ? `${sel.size} produto(s) · ${tot} un.` : 'Nenhum selecionado';
  };
  m.$('#q').oninput = e => { q = e.target.value; desenhar(); };
  m.$('#ce').onchange = desenhar;
  m.$('#lst').onclick = e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = tr.dataset.id;
    if (e.target.closest('[data-p]')) sel.set(id, sel.get(id) + 1);
    else if (e.target.closest('[data-m]')) { const v = sel.get(id) - 1; v > 0 ? sel.set(id, v) : sel.delete(id); }
    else sel.has(id) ? sel.delete(id) : sel.set(id, 1);
    desenhar();
  };
  m.$('#ok').onclick = () => { if (!sel.size) return toast('Selecione ao menos um produto.', 'aviso'); m.fechar(); onAdd([...sel.entries()].map(([id, qtd]) => ({ p: prodPorId(id), qtd }))); };
  desenhar();
}

export function selectClientes(sel, atual = '') {
  return `<option value="">— Sem cliente / consumidor final —</option>` +
    [...S.d.clientes].sort((a, b) => a.nome.localeCompare(b.nome)).map(c => `<option value="${c.id}" ${c.id === (sel || atual) ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
}

// Listas de sugestões (datalist) com valores já usados
export function datalist(id, valores) {
  const u = [...new Set(valores.filter(Boolean).map(v => String(v).trim()))].sort((a, b) => a.localeCompare(b));
  return `<datalist id="${id}">${u.map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
}
