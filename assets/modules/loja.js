// Loja virtual: configuração, vitrine e pedidos online
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtDataHora, slugify, soDigitos, waLink, copiar, fmtFone } from '../utils.js';
import { S, cfg, pode, isAdmin, icon, modal, ask, toast, commit, qtdProduto, prodPorId, badge, vazio } from '../core.js';
import { opsItemLoja } from './loja-sync.js';

let F = { aba: 'pedidos', q: '' };
export const linkLoja = slug => location.origin + location.pathname.replace(/[^/]*$/, '') + 'loja.html?l=' + encodeURIComponent(slug);

export function render(el) {
  const lj = S.conta.loja || {};
  const ed = pode('loja', 'editar');
  const novos = S.d.pedidos.filter(p => p.status === 'novo').length;
  el.innerHTML = `
  ${lj.slug ? `<div class="card loja-link">
    <div><small class="mudo">Endereço da sua loja ${lj.ativa ? badge('No ar', 'ok') : badge('Desativada', 'mudo')}</small><b class="quebra">${esc(linkLoja(lj.slug))}</b></div>
    <div class="acoes"><button class="btn" id="cp">${icon('copy')}Copiar</button><a class="btn" target="_blank" href="${esc(linkLoja(lj.slug))}">${icon('eye')}Abrir</a><a class="btn wa" target="_blank" href="${waLink('', `Confira meus produtos e faça seu pedido pelo catálogo online: ${linkLoja(lj.slug)}`)}">${icon('wa')}Divulgar</a><button class="btn" id="qr">QR Code</button></div>
  </div>` : `<div class="aviso-box">${icon('store')}<span>Configure sua loja virtual: escolha um endereço, as cores e quais produtos aparecem. Suas clientes fazem o pedido pelo link e ele chega aqui e no seu WhatsApp.</span></div>`}
  <div class="abas">${[['pedidos', 'Pedidos', novos], ['produtos', 'Produtos na loja'], ['config', 'Aparência e configurações']].map(([k, t, n]) => `<button data-aba="${k}" class="${F.aba === k ? 'ativo' : ''}">${t}${n ? ` <i>${n}</i>` : ''}</button>`).join('')}</div>
  <div id="aba"></div>`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.aba; delete el.dataset.sujo; render(el); });
  const cp = $('#cp', el); if (cp) cp.onclick = async () => { await copiar(linkLoja(lj.slug)); toast('Link copiado!'); };
  const qr = $('#qr', el); if (qr) qr.onclick = () => { const m = modal({ titulo: 'QR Code da loja', corpo: `<div class="qr" id="q"></div><p class="mudo pq ta-c">Imprima e cole no seu material de divulgação.</p>` }); if (window.QRCode) new QRCode(m.$('#q'), { text: linkLoja(lj.slug), width: 240, height: 240 }); };
  const a = $('#aba', el);
  if (F.aba === 'pedidos') abaPedidos(a, ed);
  if (F.aba === 'produtos') abaProdutos(a, ed, el);
  if (F.aba === 'config') abaConfig(a, ed && isAdmin(), el);
}

// ---------------- pedidos ----------------
function abaPedidos(a, ed) {
  const l = [...S.d.pedidos].sort((x, y) => (y.criadoEm || 0) - (x.criadoEm || 0));
  const ST = { novo: ['Novo', 'info'], convertido: ['Virou venda', 'ok'], cancelado: ['Cancelado', 'mudo'] };
  a.innerHTML = l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Recebido</th><th>Cliente</th><th>Itens</th><th class="n">Total</th><th>Status</th><th></th></tr></thead><tbody>
    ${l.map(p => `<tr data-id="${p.id}" class="clicavel"><td>${fmtDataHora(p.criadoEm)}</td><td><b>${esc(p.cliente.nome)}</b><small class="bl mudo">${fmtFone(p.cliente.whatsapp)}</small></td>
      <td>${p.itens.reduce((s, i) => s + i.qtd, 0)} un.</td><td class="n"><b>${brl(p.total)}</b></td><td>${badge(...(ST[p.status] || ['?', '']))}${p.numeroVenda ? ` <small class="mudo">#${p.numeroVenda}</small>` : ''}</td>
      <td class="acoes"><button class="btn-ic">${icon('eye')}</button></td></tr>`).join('')}
  </tbody></table></div>` : vazio((S.conta.loja || {}).ativa ? 'Nenhum pedido ainda. Divulgue o link da sua loja!' : 'Ative a loja na aba "Aparência e configurações" para começar a receber pedidos.');
  $$('tr[data-id]', a).forEach(tr => tr.onclick = () => verPedido(S.d.pedidos.find(p => p.id === tr.dataset.id), ed));
}

function verPedido(p, ed) {
  const slug = S.conta.loja.slug;
  const m = modal({
    titulo: 'Pedido da loja virtual', largo: true,
    corpo: `<div class="det-topo"><div><small class="mudo">Cliente</small><b>${esc(p.cliente.nome)}</b></div><div><small class="mudo">WhatsApp</small><b>${fmtFone(p.cliente.whatsapp)}</b></div>
      <div><small class="mudo">Recebido</small><b>${fmtDataHora(p.criadoEm)}</b></div><div><small class="mudo">Entrega</small><b>${esc(p.entrega || '—')}</b></div></div>
      ${p.cupom ? `<p><b>Cupom:</b> ${esc(p.cupom)} (− ${brl(p.desconto)})</p>` : ''}${p.cliente.endereco ? `<p><b>Endereço:</b> ${esc(p.cliente.endereco)}</p>` : ''}${p.obs ? `<p><b>Obs.:</b> ${esc(p.obs)}</p>` : ''}
      <table class="tabela mini"><thead><tr><th>Produto</th><th class="n">Qtd.</th><th class="n">Preço</th><th class="n">Subtotal</th><th>Estoque</th></tr></thead><tbody>
      ${p.itens.map(i => { const pr = prodPorId(i.id); return `<tr><td>${esc(i.nome)}</td><td class="n">${i.qtd}</td><td class="n">${brl(i.preco)}</td><td class="n">${brl(i.qtd * i.preco)}</td><td>${pr ? (qtdProduto(pr) >= i.qtd ? badge(qtdProduto(pr) + ' un.', 'ok') : badge(qtdProduto(pr) + ' un.', 'perigo')) : badge('removido', 'mudo')}</td></tr>`; }).join('')}
      </tbody><tfoot>${p.desconto ? `<tr><td colspan="3">Desconto (cupom)</td><td class="n">− ${brl(p.desconto)}</td><td></td></tr>` : ''}${p.frete ? `<tr><td colspan="3">Entrega</td><td class="n">${brl(p.frete)}</td><td></td></tr>` : ''}<tr class="forte"><td colspan="3">Total</td><td class="n">${brl(p.total)}</td><td></td></tr></tfoot></table>`,
    rodape: `${ed && p.status === 'novo' ? `<button class="btn perigo-txt" id="canc">Cancelar pedido</button>` : ''}${ed && p.status !== 'novo' ? `<button class="btn perigo-txt" id="del">${icon('trash')}Apagar</button>` : ''}<span class="grow"></span>
      <a class="btn wa" target="_blank" href="${waLink(p.cliente.whatsapp, `Olá ${p.cliente.nome.split(' ')[0]}! Recebi seu pedido de ${brl(p.total)} na loja 💖 `)}">${icon('wa')}Falar com cliente</a>
      ${ed && p.status === 'novo' && pode('vendas', 'editar') ? `<button class="btn pri" id="conv">${icon('cart')}Transformar em venda</button>` : ''}`
  });
  const on = (s, f) => { const b = m.$(s); if (b) b.onclick = f; };
  on('#canc', async () => { if (await commit([{ op: 'upd', path: `lojas/${slug}/pedidos/${p.id}`, data: { status: 'cancelado' } }], `Cancelou pedido da loja de ${p.cliente.nome}`)) { toast('Pedido cancelado.'); m.fechar(); } });
  on('#del', async () => { if (await ask('Apagar este pedido da lista?', { perigo: true, ok: 'Apagar' }) && await commit([{ op: 'del', path: `lojas/${slug}/pedidos/${p.id}` }])) m.fechar(); });
  on('#conv', async () => {
    let cli = S.d.clientes.find(c => c.whatsapp && soDigitos(c.whatsapp).slice(-9) === soDigitos(p.cliente.whatsapp).slice(-9));
    if (!cli) {
      cli = { id: uid(), nome: p.cliente.nome, whatsapp: soDigitos(p.cliente.whatsapp), endereco: p.cliente.endereco || '', tags: ['Loja virtual'], criadoEm: Date.now() };
      const { id, ...d } = cli;
      if (!await commit([{ op: 'set', col: 'clientes', id, data: d }], 'Cadastrou cliente via loja: ' + cli.nome)) return;
      S.d.clientes.push(cli);
    }
    m.fechar();
    (await import('./vendas.js')).novaVenda({ clienteId: cli.id, pedido: p, frete: p.frete || 0, desconto: p.desconto || 0, cupom: p.cupom || '', obs: [p.obs, p.entrega && 'Entrega: ' + p.entrega, p.cliente.endereco].filter(Boolean).join(' · '), itens: p.itens.filter(i => prodPorId(i.id)).map(i => ({ prodId: i.id, nome: i.nome, marca: (prodPorId(i.id) || {}).marca || '', qtd: i.qtd, preco: i.preco })) });
  });
}

// ---------------- produtos na loja ----------------
function abaProdutos(a, ed, raiz) {
  const ps = S.d.produtos.filter(p => p.ativo !== false && (!F.q || norm(p.nome + ' ' + p.marca).includes(norm(F.q)))).sort((x, y) => x.nome.localeCompare(y.nome));
  const lj = S.conta.loja || {};
  a.innerHTML = `${!lj.ativa ? `<div class="aviso-box">${icon('alert')}<span>A loja está desativada. Os produtos marcados aparecerão quando você ativá-la.</span></div>` : ''}
  <div class="barra"><div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Buscar" value="${esc(F.q)}"></div>
    ${ed ? `<button class="btn" id="todos">Mostrar todos com estoque</button><button class="btn" id="sync" title="Reenviar todos os produtos para a loja">${icon('up')}Sincronizar</button>` : ''}</div>
  ${ps.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Na loja</th><th></th><th>Produto</th><th class="n">Estoque</th><th class="n">Preço normal</th><th class="n">Preço na loja</th></tr></thead><tbody>
  ${ps.map(p => `<tr data-id="${p.id}"><td><label class="switch"><input type="checkbox" data-na ${p.naLoja ? 'checked' : ''} ${ed ? '' : 'disabled'}><i></i></label></td>
    <td class="foto-c">${p.foto ? `<img src="${p.foto}">` : `<span class="mini-ph">${icon('box')}</span>`}</td><td><b>${esc(p.nome)}</b><small class="bl mudo">${esc(p.marca || '')}${!p.foto ? ' · sem foto' : ''}</small></td>
    <td class="n">${qtdProduto(p) > 0 ? qtdProduto(p) : badge('esgotado', 'perigo')}</td><td class="n">${brl(p.preco)}</td>
    <td class="n"><input class="n w90" data-pl inputmode="decimal" value="${p.precoLoja ? nfmt(p.precoLoja, 2) : ''}" placeholder="${nfmt(p.preco || 0, 2)}" ${ed ? '' : 'disabled'}></td></tr>`).join('')}
  </tbody></table></div>` : vazio('Cadastre produtos no Estoque.')}`;
  $('#q', a).oninput = e => { F.q = e.target.value; abaProdutos(a, ed, raiz); const i = $('#q', a); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  const salvar = async (p, mud) => { const np = { ...p, ...mud }; await commit([{ op: 'upd', col: 'produtos', id: p.id, data: mud }, ...opsItemLoja(np)]); };
  $$('[data-na]', a).forEach(c => c.onchange = () => salvar(prodPorId(c.closest('tr').dataset.id), { naLoja: c.checked }));
  $$('[data-pl]', a).forEach(c => c.onchange = () => salvar(prodPorId(c.closest('tr').dataset.id), { precoLoja: parseNum(c.value) }));
  const t = $('#todos', a); if (t) t.onclick = async () => {
    const ops = S.d.produtos.filter(p => p.ativo !== false && qtdProduto(p) > 0 && !p.naLoja).flatMap(p => [{ op: 'upd', col: 'produtos', id: p.id, data: { naLoja: true } }, ...opsItemLoja({ ...p, naLoja: true })]);
    if (!ops.length) return toast('Todos os produtos com estoque já estão na loja.');
    if (await commit(ops, 'Colocou produtos com estoque na loja')) toast('Produtos adicionados à loja.');
  };
  const s = $('#sync', a); if (s) s.onclick = () => sincronizarTudo();
}

export async function sincronizarTudo() {
  const lj = S.conta.loja || {};
  if (!lj.slug || !lj.ativa) return toast('Ative a loja primeiro.', 'aviso');
  const ops = S.d.produtos.flatMap(p => opsItemLoja(p));
  if (await commit(ops)) toast(`Loja sincronizada (${S.d.produtos.filter(p => p.naLoja && p.ativo !== false).length} produtos).`);
}

// ---------------- configuração ----------------
function abaConfig(a, ed, raiz) {
  const lj = S.conta.loja || {};
  const sugest = slugify(S.conta.nome || 'minha-loja');
  a.innerHTML = `<form class="form card" id="fl" data-form>
    <label class="chk forte"><input type="checkbox" name="ativa" ${lj.ativa ? 'checked' : ''}> Loja virtual ativa (visível para quem tiver o link)</label>
    <div class="grid2">
      <label>Endereço (identificador) *<input name="slug" required pattern="[a-z0-9\\-]{3,40}" value="${esc(lj.slug || sugest)}"><small class="mudo">Somente letras minúsculas, números e hífen. Ex.: ${esc(sugest)}</small></label>
      <label>Nome exibido na loja<input name="titulo" value="${esc(lj.titulo || S.conta.nome || '')}"></label>
      <label>WhatsApp que recebe os pedidos *<input name="whatsapp" inputmode="tel" required value="${esc(fmtFone(lj.whatsapp || cfg().telefone || ''))}"></label>
      <label>Cor principal<input type="color" name="cor" value="${lj.cor || cfg().cor || '#7209b7'}"></label>
      <label class="span2">Mensagem de boas-vindas<textarea name="descricao" rows="2" placeholder="Ex.: Produtos originais com entrega rápida na sua casa 💖">${esc(lj.descricao || '')}</textarea></label>
      <label>Opções de entrega<input name="entregas" value="${esc(lj.entregas || 'Retirar comigo; Entrega na minha região')}"><small class="mudo">Separe por ponto e vírgula.</small></label>
      <label>Taxa de entrega (R$)<input name="taxa" inputmode="decimal" value="${lj.taxa ? nfmt(lj.taxa, 2) : ''}" placeholder="0,00 = grátis / a combinar"></label>
      <label>Pedido mínimo (R$)<input name="minimo" inputmode="decimal" value="${lj.minimo ? nfmt(lj.minimo, 2) : ''}"></label>
      <label>Formas de pagamento aceitas<input name="pagamentos" value="${esc(lj.pagamentos || 'Pix; Dinheiro; Cartão')}"></label>
    </div>
    <div class="checks">
      <label class="chk"><input type="checkbox" name="mostrarEstoque" ${lj.mostrarEstoque ? 'checked' : ''}> Mostrar quantidade em estoque</label>
      <label class="chk"><input type="checkbox" name="mostrarEsgotados" ${lj.mostrarEsgotados !== false ? 'checked' : ''}> Exibir produtos esgotados (sem permitir compra)</label>
    </div>
    <div class="sub-h"><h4>${icon('tag')} Cupons de desconto</h4><button type="button" class="btn sm" id="addcup">${icon('plus')}Novo cupom</button></div>
    <div id="cupons"></div>
    <p class="mudo pq">O logotipo da loja é o mesmo cadastrado em Configurações. Para promoções com preço riscado, use o menu Promoções.</p>
    ${ed ? `<div class="barra"><span class="grow"></span><button class="btn pri" id="ok">Salvar e publicar</button></div>` : '<p class="mudo">Somente administradores alteram estas configurações.</p>'}
  </form>`;
  let cupons = (lj.cupons || []).map(c => ({ ...c }));
  const desenharCupons = () => {
    $('#cupons', a).innerHTML = cupons.length ? `<table class="tabela mini"><thead><tr><th>Código</th><th>Desconto</th><th class="n">Pedido mínimo</th><th>Validade</th><th>Ativo</th><th></th></tr></thead><tbody>${cupons.map((c, k) => `<tr data-k="${k}">
      <td><input name="cc" value="${esc(c.codigo)}" style="text-transform:uppercase;max-width:140px"></td>
      <td><div class="campo-bt"><input name="cv" class="n w70" inputmode="decimal" value="${nfmt(c.valor, 2)}"><select name="ct" style="width:auto"><option value="pct" ${c.tipo !== 'valor' ? 'selected' : ''}>%</option><option value="valor" ${c.tipo === 'valor' ? 'selected' : ''}>R$</option></select></div></td>
      <td class="n"><input name="cm" class="n w90" inputmode="decimal" value="${c.minimo ? nfmt(c.minimo, 2) : ''}"></td><td><input type="date" name="cf" value="${c.validade || ''}"></td>
      <td><input type="checkbox" name="ca" ${c.ativo !== false ? 'checked' : ''}></td><td><button type="button" class="btn-ic" data-rc>${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<p class="mudo pq">Nenhum cupom. Ex.: PRIMEIRACOMPRA com 10% de desconto.</p>';
    $$('[data-rc]', a).forEach(b => b.onclick = () => { lerCupons(); cupons.splice(+b.closest('tr').dataset.k, 1); desenharCupons(); });
  };
  const lerCupons = () => { cupons = $$('#cupons tr[data-k]', a).map(tr => ({ codigo: $('[name=cc]', tr).value.trim().toUpperCase().replace(/\s/g, ''), valor: parseNum($('[name=cv]', tr).value), tipo: $('[name=ct]', tr).value, minimo: parseNum($('[name=cm]', tr).value), validade: $('[name=cf]', tr).value, ativo: $('[name=ca]', tr).checked })); };
  desenharCupons();
  const ac = $('#addcup', a); if (ac) ac.onclick = () => { lerCupons(); cupons.push({ codigo: '', valor: 10, tipo: 'pct', ativo: true }); desenharCupons(); };
  if (!ed) { $$('input,textarea,select,button', a).forEach(i => i.disabled = true); return; }
  const f = $('#fl', a);
  $('#ok', a).onclick = async e => {
    e.preventDefault();
    f.slug.value = slugify(f.slug.value);
    if (!f.reportValidity()) return;
    const nova = {
      ativa: f.ativa.checked, slug: f.slug.value, titulo: f.titulo.value.trim(), whatsapp: soDigitos(f.whatsapp.value), cor: f.cor.value, descricao: f.descricao.value.trim(),
      entregas: f.entregas.value.trim(), taxa: parseNum(f.taxa.value), minimo: parseNum(f.minimo.value), pagamentos: f.pagamentos.value.trim(),
      mostrarEstoque: f.mostrarEstoque.checked, mostrarEsgotados: f.mostrarEsgotados.checked
    };
    lerCupons(); nova.cupons = cupons.filter(c => c.codigo && c.valor > 0);
    const pub = { ...nova, contaId: S.contaId, logo: cfg().logo || '', nomeConta: S.conta.nome || '', pix: pixPublico(cfg()), atualizadoEm: Date.now() };
    const ops = [];
    if (lj.slug && lj.slug !== nova.slug) ops.push({ op: 'upd', path: `lojas/${lj.slug}`, data: { ativa: false } });
    ops.push({ op: 'set', path: `lojas/${nova.slug}`, data: pub });
    ops.push({ op: 'upd', col: '@conta', data: { loja: nova } });
    const ok = await commit(ops, 'Atualizou configurações da loja virtual');
    if (!ok) return toast('Esse endereço pode já estar em uso por outra loja. Tente outro.', 'erro');
    S.conta.loja = nova; delete raiz.dataset.sujo; delete document.getElementById('main').dataset.sujo;
    toast('Loja salva!');
    if (nova.ativa) await sincronizarTudo();
  };
}

const pixPublico = c => c.pixChave ? { chave: c.pixChave, nome: c.pixNome || S.conta.nome || '', cidade: c.pixCidade || '' } : null;
// chamado pelas Configurações quando logo/nome mudam
export function opsPublicarLoja(conta) {
  const lj = conta.loja || {};
  if (!lj.slug) return [];
  return [{ op: 'upd', path: `lojas/${lj.slug}`, data: { logo: (conta.config || {}).logo || '', nomeConta: conta.nome || '', pix: pixPublico(conta.config || {}), atualizadoEm: Date.now() } }];
}
