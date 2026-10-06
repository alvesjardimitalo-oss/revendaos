// Vendas: lista, nova venda (PDV), detalhes, recibo e cancelamento
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtData, hoje, addMeses, addDias, mesAtual, waLink, preencher, fmtFone } from '../utils.js';
import { creditosCliente, opsResgate } from './consorcios.js';
import { S, cfg, pode, icon, modal, ask, toast, commit, qtdProduto, prodPorId, cliPorId, buscaProduto, selectClientes, saldoRec, statusRec, STATUS_REC, badge, vazio, FORMAS, ENTREGA, baixarLotes, devolverLotes, proxNumero, abertoCliente, ehKit, precoVenda, promoAtiva, taxaCartao, selecionarVarios, avatar } from '../core.js';
import { opsItemLoja } from './loja-sync.js';
import { formCliente } from './clientes.js';
import { receber, enviarPix } from './cobrancas.js';

let F = { mes: mesAtual(), de: '', ate: '', q: '', entrega: '', pag: '' };
const IMEDIATAS = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];

export const lucroVenda = v => r2(v.total - (v.frete || 0) - (v.custoTotal || 0) - (v.taxaCartaoValor || 0));
export const recsDaVenda = id => S.d.recebiveis.filter(r => r.vendaId === id).sort((a, b) => a.parcela - b.parcela);
export const pagoVenda = id => r2(recsDaVenda(id).reduce((s, r) => s + (Number(r.pago) || 0), 0));

function periodo() {
  if (F.mes === 'custom') return [F.de || '0000', F.ate || '9999'];
  if (F.mes === 'todos') return ['0000', '9999'];
  return [F.mes + '-01', F.mes + '-31'];
}

export function render(el) {
  const ed = pode('vendas', 'editar');
  const [de, ate] = periodo();
  const meses = [...new Set([mesAtual(), ...S.d.vendas.map(v => (v.data || '').slice(0, 7))])].filter(Boolean).sort().reverse();
  let l = S.d.vendas.filter(v => v.data >= de && v.data <= ate);
  if (F.q) { const n = norm(F.q); l = l.filter(v => norm(v.clienteNome).includes(n) || String(v.numero) === F.q.replace('#', '') || (v.itens || []).some(i => norm(i.nome).includes(n))); }
  if (F.entrega) l = l.filter(v => !v.cancelada && v.statusEntrega === F.entrega);
  if (F.pag === 'aberto') l = l.filter(v => !v.cancelada && pagoVenda(v.id) < v.total - 0.004);
  if (F.pag === 'quitado') l = l.filter(v => !v.cancelada && pagoVenda(v.id) >= v.total - 0.004);
  if (F.pag === 'cancelada') l = l.filter(v => v.cancelada);
  l.sort((a, b) => (b.data + String(b.numero).padStart(8, '0')).localeCompare(a.data + String(a.numero).padStart(8, '0')));
  const val = l.filter(v => !v.cancelada);
  const tot = val.reduce((s, v) => s + v.total, 0), lucro = val.reduce((s, v) => s + lucroVenda(v), 0);

  const stVenda = v => { if (v.cancelada) return ['Cancelada', 'mudo']; const pg = pagoVenda(v.id); return pg >= v.total - 0.004 ? ['Pago', 'ok'] : pg > 0.004 ? ['Pago parcialmente', 'info'] : ['Pendente', 'aviso']; };
  const mob = `<div class="so-mob">
    <div class="mchips"><select id="mmes" class="chip-sel">${meses.map(m => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${m === mesAtual() ? 'Mês atual' : m.split('-').reverse().join('/')}</option>`).join('')}<option value="todos" ${F.mes === 'todos' ? 'selected' : ''}>Todo o período</option></select>
      <select id="mpag" class="chip-sel"><option value="">Todas</option><option value="aberto" ${F.pag === 'aberto' ? 'selected' : ''}>Com saldo em aberto</option><option value="quitado" ${F.pag === 'quitado' ? 'selected' : ''}>Pagas</option></select></div>
    <div class="mkpis"><div class="mkpi"><i>${icon('seta_cima')}</i><div><span>Vendas realizadas</span><b>${val.length}</b></div></div>
      <div class="mkpi"><i>${icon('cifrao')}</i><div><span>Valor em vendas</span><b class="valor">${brl(tot)}</b></div></div>
      ${pode('relatorios') ? `<div class="mkpi"><i>${icon('porc')}</i><div><span>Lucro</span><b class="valor">${brl(lucro)}</b></div></div>` : ''}</div>
    <div class="campo-ic mbusca">${icon('search')}<input type="search" id="qm" placeholder="Buscar por cliente ou produto" value="${esc(F.q)}"></div>
    ${l.length ? `<div class="mlista">${l.map(v => { const [st, c] = stVenda(v); return `<div class="mrow" data-id="${v.id}">${avatar(v.clienteNome || 'C F')}<div class="mrow-m"><b>${esc(v.clienteNome || 'Consumidor final')}</b><small>${fmtData(v.data)} · ${(v.itens || []).reduce((a, i) => a + i.qtd, 0)} un.${v.statusEntrega !== 'entregue' && !v.cancelada ? ' · <span class="t-aviso">a entregar</span>' : ''}</small></div><div class="mrow-d"><b class="valor">${brl(v.total)}</b><span class="pill ${c}">${st}</span></div></div>`; }).join('')}</div>`
      : `<div class="mvazio">${icon('cart')}<p>Nenhuma venda encontrada</p></div>`}
    ${ed ? `<button class="fab" id="fabv">${icon('plus')}Adicionar venda</button>` : ''}
  </div>`;
  el.innerHTML = mob + `<div class="so-desk">
  <div class="kpis">
    <div class="kpi"><span>Vendido no período</span><b>${brl(tot)}</b><small>${val.length} venda(s)</small></div>
    <div class="kpi"><span>Ticket médio</span><b>${brl(val.length ? tot / val.length : 0)}</b></div>
    <div class="kpi"><span>Lucro bruto</span><b>${brl(lucro)}</b><small>${tot ? nfmt(lucro / tot * 100, 1) + '% de margem' : ''}</small></div>
    <div class="kpi"><span>A entregar</span><b>${S.d.vendas.filter(v => !v.cancelada && v.statusEntrega !== 'entregue').length}</b><small>todas as datas</small></div>
  </div>
  <div class="barra">
    ${ed ? `<button class="btn pri" id="nova">${icon('plus')}Nova venda</button><button class="btn" id="imphist" title="Importar vendas antigas (planilha)">${icon('up')}Importar histórico</button>` : ''}
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Cliente, nº da venda ou produto" value="${esc(F.q)}"></div>
    <select id="mes">${meses.map(m => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${m.split('-').reverse().join('/')}</option>`).join('')}<option value="todos" ${F.mes === 'todos' ? 'selected' : ''}>Todo o período</option><option value="custom" ${F.mes === 'custom' ? 'selected' : ''}>Personalizado…</option></select>
    ${F.mes === 'custom' ? `<input type="date" id="de" value="${F.de}"><input type="date" id="ate" value="${F.ate}">` : ''}
    <select id="entrega"><option value="">Entrega: todas</option>${Object.entries(ENTREGA).map(([k, v]) => `<option value="${k}" ${F.entrega === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <select id="pag"><option value="">Pagamento: todas</option><option value="aberto" ${F.pag === 'aberto' ? 'selected' : ''}>Com saldo em aberto</option><option value="quitado" ${F.pag === 'quitado' ? 'selected' : ''}>Quitadas</option><option value="cancelada" ${F.pag === 'cancelada' ? 'selected' : ''}>Canceladas</option></select>
  </div>
  ${l.length ? `<div class="tabela-w"><table class="tabela">
  <thead><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th class="n">Total</th><th>Pagamento</th><th>Entrega</th><th></th></tr></thead>
  <tbody>${l.map(v => {
    const pago = pagoVenda(v.id), q = (v.itens || []).reduce((s, i) => s + i.qtd, 0);
    const st = v.cancelada ? badge('Cancelada', 'mudo') : pago >= v.total - 0.004 ? badge('Quitada', 'ok') : recsDaVenda(v.id).some(r => statusRec(r) === 'vencido') ? badge('Vencida · falta ' + brl(v.total - pago), 'perigo') : badge('Falta ' + brl(v.total - pago), 'info');
    return `<tr data-id="${v.id}" class="clicavel ${v.cancelada ? 'riscado' : ''}">
      <td>#${v.numero}${v.origem === 'loja' ? ' ' + icon('store', 'mini') : ''}${v.consorcio ? ` <span class="chip-mini" title="Pago com crédito do consórcio">G${v.consorcio.grupo}</span>` : ''}${v.importado ? ' <small class="mudo">Revendi</small>' : ''}</td><td>${fmtData(v.data)}</td>
      <td>${esc(v.clienteNome || 'Consumidor final')}<small class="bl mudo">${esc(v.vendedorNome || '')}</small></td>
      <td>${nfmt(q)} un.</td><td class="n"><b>${brl(v.total)}</b></td><td>${st}</td>
      <td>${v.cancelada ? '—' : ed ? `<select class="sel-mini" data-ent="${v.id}">${Object.entries(ENTREGA).map(([k, t]) => `<option value="${k}" ${v.statusEntrega === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ENTREGA[v.statusEntrega] || ''}</td>
      <td class="acoes"><button class="btn-ic" title="Detalhes">${icon('eye')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`
      : vazio('Nenhuma venda no período.', ed ? `<button class="btn pri" id="nova2">${icon('plus')}Registrar venda</button>` : '')}</div>`;

  const re = () => render(el);
  ['q', 'qm'].forEach(k => $('#' + k, el).oninput = e => { F.q = e.target.value; re(); const i = $('#' + k, el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
  $('#mmes', el).onchange = e => { F.mes = e.target.value; re(); }; $('#mpag', el).onchange = e => { F.pag = e.target.value; re(); };
  const fv = $('#fabv', el); if (fv) fv.onclick = () => novaVenda();
  $$('.mrow[data-id]', el).forEach(r => r.onclick = () => verVenda(r.dataset.id));
  ['mes', 'entrega', 'pag', 'de', 'ate'].forEach(k => { const x = $('#' + k, el); if (x) x.onchange = e => { F[k] = e.target.value; re(); }; });
  const ih = $('#imphist', el); if (ih) ih.onclick = async () => (await import('./importar-vendas.js')).importarHistorico();
  [$('#nova', el), $('#nova2', el)].forEach(b => b && (b.onclick = () => novaVenda()));
  $$('select[data-ent]', el).forEach(s => { s.onclick = e => e.stopPropagation(); s.onchange = () => mudarEntrega(s.dataset.ent, s.value); });
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => verVenda(tr.dataset.id));
}

async function mudarEntrega(id, st) {
  const v = S.d.vendas.find(x => x.id === id);
  if (await commit([{ op: 'upd', col: 'vendas', id, data: { statusEntrega: st } }], `Venda #${v.numero}: entrega ${ENTREGA[st]}`)) toast('Entrega: ' + ENTREGA[st]);
}

// ======================================================= NOVA VENDA
export function novaVenda(pre = {}) {
  const itens = (pre.itens || []).map(i => ({ ...i }));
  const me = S.membro;
  const membros = S.d.membros.length ? S.d.membros : [{ id: S.user.uid, nome: me.nome }];
  const m = modal({
    titulo: pre.pedido ? `Converter pedido da loja em venda` : 'Nova venda', largo: true,
    corpo: `<div class="pdv">
      <div class="pdv-itens">
        <div class="barra" style="margin:0"><div id="busca" class="grow"></div><button type="button" class="btn" id="varios" title="Selecionar vários produtos">${icon('layers')}Vários</button></div>
        <div class="tabela-w"><table class="tabela mini"><thead><tr><th>Produto</th><th class="n">Qtd.</th><th class="n">Preço un.</th><th class="n">Subtotal</th><th></th></tr></thead><tbody id="itens"></tbody></table></div>
        <div id="avisos"></div>
      </div>
      <form class="pdv-lado form" id="fv">
        <label>Cliente<div class="campo-bt"><select name="cliente">${selectClientes(pre.clienteId)}</select><button type="button" class="btn" id="novocli" title="Cadastrar cliente">${icon('plus')}</button></div><small id="infocli" class="mudo"></small></label>
        <div class="grid2">
          <label>Data<input type="date" name="data" value="${hoje()}"></label>
          <label>Vendedor(a)<select name="vendedor">${membros.map(x => `<option value="${x.id}" ${x.id === S.user.uid ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
          <label>Desconto (R$)<input name="desconto" inputmode="decimal" placeholder="0,00" value="${pre.desconto ? nfmt(pre.desconto, 2) : ''}"></label>
          <label>Desconto (%)<input name="descpct" inputmode="decimal" placeholder="0"></label>
          <label>Frete / entrega (R$)<input name="frete" inputmode="decimal" placeholder="0,00" value="${pre.frete ? nfmt(pre.frete, 2) : ''}"></label>
          <label>Comissão (%)<input name="comissao" inputmode="decimal"></label>
        </div>
        <div class="total-box"><span>Total</span><b id="total">R$ 0,00</b><small id="lucro" class="mudo"></small></div>
        <div class="cons-box" id="consbox" hidden>
          <label class="chk"><input type="checkbox" name="usacons"> Pagar com crédito do consórcio</label>
          <div class="grid2"><select name="consg"></select><input name="consval" inputmode="decimal" placeholder="Valor do crédito usado"></div>
          <small id="consinfo" class="mudo"></small>
        </div>
        <div class="grid2">
          <label>Forma de pagamento<select name="forma">${FORMAS.map(x => `<option>${x}</option>`).join('')}</select></label>
          <label>Parcelas<select name="parcelas">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label>
          <label id="lent">Entrada recebida agora (R$)<input name="entrada" inputmode="decimal" placeholder="0,00"></label>
          <label id="lvenc">1º vencimento<input type="date" name="venc" value="${addDias(hoje(), 30)}"></label>
          <label id="lint">Intervalo<select name="intervalo"><option value="mes">Mensal</option><option value="15">A cada 15 dias</option><option value="7">Semanal</option></select></label>
          <label class="chk" id="lrec"><input type="checkbox" name="recebido" checked> Pagamento recebido agora</label>
          <label class="chk span2" id="lrep"><input type="checkbox" name="repassar"> Repassar a taxa da maquininha ao cliente</label>
          <small class="mudo span2" id="taxainfo"></small>
        </div>
        <div id="parc" class="parc-prev"></div>
        <label>Status da entrega<select name="entrega">${Object.entries(ENTREGA).map(([k, v]) => `<option value="${k}" ${k === (pre.pedido ? 'pendente' : 'entregue') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>Observações<textarea name="obs" rows="2">${esc(pre.obs || '')}</textarea></label>
      </form>
    </div>`,
    rodape: `<span class="grow mudo pq">Dica: leia o código de barras e pressione Enter para adicionar.</span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="fin">${icon('check')}Finalizar venda</button>`
  });
  m.el.classList.add('cheia');
  const f = m.$('#fv');
  const comPad = () => { const vm = S.d.membros.find(x => x.id === f.vendedor.value); return vm && vm.comissao ? vm.comissao : (cfg().comissaoPadrao || 0); };
  f.comissao.value = comPad() ? nfmt(comPad(), 1) : '';
  f.vendedor.onchange = () => { f.comissao.value = comPad() ? nfmt(comPad(), 1) : ''; calc(); };

  const add = (p, qtd = 1) => {
    if (!p) return;
    const ex = itens.find(i => i.prodId === p.id);
    const pr = promoAtiva(p, 'balcao');
    if (ex) ex.qtd = r2(ex.qtd + qtd); else itens.push({ prodId: p.id, nome: p.nome, marca: p.marca || '', qtd, preco: pr ? pr.preco : (p.preco || 0), promo: pr ? pr.promo.nome : '' });
    desenhar();
  };
  buscaProduto(m.$('#busca'), p => add(p));
  m.$('#varios').onclick = () => selecionarVarios(l => l.forEach(x => add(x.p, x.qtd)), { titulo: 'Adicionar vários produtos à venda' });

  const desenhar = () => {
    m.$('#itens').innerHTML = itens.length ? itens.map((i, k) => `<tr data-k="${k}">
      <td><b>${esc(i.nome)}</b><small class="bl mudo">${esc(i.marca)} · estoque ${prodPorId(i.prodId) ? qtdProduto(prodPorId(i.prodId)) : '—'}${i.promo ? ' · ' + icon('tag', 'mini') + ' ' + esc(i.promo) : ''}${ehKit(prodPorId(i.prodId)) ? ' · kit' : ''}</small></td>
      <td class="n"><div class="qtd"><button type="button" data-m>−</button><input name="q" inputmode="decimal" value="${i.qtd}"><button type="button" data-p>+</button></div></td>
      <td class="n"><input class="n w90" name="pr" inputmode="decimal" value="${nfmt(i.preco, 2)}"></td>
      <td class="n" data-sub>${brl(i.qtd * i.preco)}</td>
      <td><button type="button" class="btn-ic" data-x>${icon('trash')}</button></td></tr>`).join('')
      : `<tr><td colspan="5" class="mudo ta-c" style="padding:22px">Adicione produtos pela busca acima.</td></tr>`;
    calc();
  };
  m.$('#itens').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return; const i = itens[+tr.dataset.k];
    if (e.target.closest('[data-x]')) { itens.splice(+tr.dataset.k, 1); return desenhar(); }
    if (e.target.closest('[data-p]')) { i.qtd = r2(i.qtd + 1); return desenhar(); }
    if (e.target.closest('[data-m]')) { i.qtd = Math.max(1, r2(i.qtd - 1)); return desenhar(); }
  });
  m.$('#itens').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return; const i = itens[+tr.dataset.k];
    if (e.target.name === 'q') i.qtd = parseNum(e.target.value);
    if (e.target.name === 'pr') i.preco = parseNum(e.target.value);
    $('[data-sub]', tr).textContent = brl(i.qtd * i.preco); calc();
  });

  let totalAtual = 0, jurosAtual = 0, taxaAtual = 0, creditoAtual = 0, receberAtual = 0, cliCons = null, consManual = false;
  f.consval.addEventListener('input', () => consManual = true);
  f.consg.addEventListener('change', () => consManual = false);
  const calc = () => {
    const sub = r2(itens.reduce((s, i) => s + i.qtd * i.preco, 0));
    let desc = parseNum(f.desconto.value);
    if (document.activeElement === f.descpct) { desc = r2(sub * parseNum(f.descpct.value) / 100); f.desconto.value = desc ? nfmt(desc, 2) : ''; }
    else if (document.activeElement === f.desconto) f.descpct.value = sub && desc ? nfmt(desc / sub * 100, 1) : '';
    const frete = parseNum(f.frete.value);
    const base = r2(Math.max(0, sub - desc + frete));
    // crédito de consórcio da cliente
    const cliC = cliPorId(f.cliente.value), creds = cliC ? creditosCliente(cliC.id) : [];
    if ((cliC || {}).id !== cliCons) {
      cliCons = (cliC || {}).id; consManual = false; f.usacons.checked = false;
      f.consg.innerHTML = creds.map(c => `<option value="${c.g.id}">Consórcio G${c.g.grupo} · crédito ${brl(c.credito)}</option>`).join('');
    }
    m.$('#consbox').hidden = !creds.length;
    const cr = creds.find(c => c.g.id === f.consg.value);
    if (cr && !consManual) f.consval.value = nfmt(Math.min(cr.credito, base), 2);
    creditoAtual = cr && f.usacons.checked ? r2(Math.min(parseNum(f.consval.value), base)) : 0;
    m.$('#consinfo').innerHTML = cr ? (f.usacons.checked ? `Crédito usado: <b>${brl(creditoAtual)}</b>${cr.credito > creditoAtual ? ` (o crédito é de ${brl(cr.credito)})` : ''} · ${(() => { const s = cr.g.pagamentos && cr.g.pagamentos[cliC.id] ? Object.keys(cr.g.pagamentos[cliC.id]).length : 0; return `${s} parcela(s) paga(s)`; })()}. A diferença é paga na forma abaixo.` : `${esc(cliC.nome.split(' ')[0])} tem crédito de consórcio disponível.`) : '';
    const baseRec = r2(base - creditoAtual);
    const fm = f.forma.value, np = +f.parcelas.value, cartao = fm.startsWith('Cartão'), tx = taxaCartao(fm, np);
    jurosAtual = cartao && tx && f.repassar.checked ? r2(baseRec / (1 - tx / 100) - baseRec) : 0;
    totalAtual = r2(base + jurosAtual);
    receberAtual = r2(totalAtual - creditoAtual);
    taxaAtual = cartao ? r2(receberAtual * tx / 100) : 0;
    m.$('#lrep').hidden = !cartao || !tx;
    m.$('#taxainfo').innerHTML = cartao ? (tx ? `Taxa da maquininha: ${nfmt(tx, 2)}% = <b>${brl(taxaAtual)}</b>${jurosAtual ? ` · juros cobrados do cliente: ${brl(jurosAtual)}` : ' (sai do seu lucro)'}` : `Cadastre as taxas da sua maquininha em <a href="#/config">Configurações</a> para calcular automaticamente.`) : '';
    const custo = itens.reduce((s, i) => s + i.qtd * ((prodPorId(i.prodId) || {}).custo || 0), 0);
    m.$('#total').textContent = brl(totalAtual) + (creditoAtual ? ` · a pagar ${brl(receberAtual)}` : '');
    m.$('#lucro').textContent = itens.length ? `Subtotal ${brl(sub)} · lucro estimado ${brl(totalAtual - frete - custo - taxaAtual)}` : '';
    // pagamento
    const forma = f.forma.value, n = +f.parcelas.value, imediata = cartao || (IMEDIATAS.includes(forma) && n === 1);
    m.$('#lrec').hidden = !imediata || cartao;
    const aPrazo = !imediata || (!cartao && !f.recebido.checked);
    m.$('#lent').hidden = m.$('#lvenc').hidden = !aPrazo;
    m.$('#lint').hidden = !aPrazo || n === 1;
    const ent = aPrazo ? Math.min(parseNum(f.entrada.value), receberAtual) : receberAtual;
    const parcs = gerarParcelas(receberAtual - ent, n, f.venc.value, f.intervalo.value);
    m.$('#parc').innerHTML = !aPrazo || !receberAtual ? '' : `<b>Parcelas</b>${ent > 0 ? `<div><span>Entrada (hoje)</span><span>${brl(ent)}</span></div>` : ''}${parcs.map((p, i) => `<div><span>${i + 1}/${n} · ${fmtData(p.venc)}</span><span>${brl(p.valor)}</span></div>`).join('')}`;
    // avisos
    const av = [];
    const porProd = {}; itens.forEach(i => porProd[i.prodId] = (porProd[i.prodId] || 0) + i.qtd);
    Object.entries(porProd).forEach(([id, q]) => { const p = prodPorId(id); if (p && q > qtdProduto(p)) av.push(`Estoque insuficiente de <b>${esc(p.nome)}</b> (tem ${qtdProduto(p)}).`); });
    const cli = cliPorId(f.cliente.value);
    if (cli) {
      const ab = abertoCliente(cli.id);
      m.$('#infocli').innerHTML = `${cli.whatsapp ? fmtFone(cli.whatsapp) + ' · ' : ''}${ab ? `<span class="t-perigo">em aberto ${brl(ab)}</span>` : 'sem pendências'}${cli.limite ? ' · limite ' + brl(cli.limite) : ''}`;
      if (cli.limite && aPrazo && ab + receberAtual - ent > cli.limite) av.push(`Esta venda ultrapassa o limite de crédito de <b>${esc(cli.nome)}</b>.`);
    } else { m.$('#infocli').textContent = ''; if (aPrazo && receberAtual - ent > 0) av.push('Venda a prazo sem cliente: selecione um cliente para controlar a cobrança.'); }
    m.$('#avisos').innerHTML = av.map(a => `<div class="aviso-box">${icon('alert')}<span>${a}</span></div>`).join('');
  };
  f.addEventListener('input', calc); f.addEventListener('change', calc);
  f.forma.addEventListener('change', () => { if (f.forma.value === 'Crediário') f.recebido.checked = false; calc(); });
  m.$('#novocli').onclick = () => formCliente(null, c => { f.cliente.innerHTML = selectClientes(c.id); calc(); });
  desenhar();

  m.$('#fin').onclick = async () => {
    const its = itens.filter(i => i.qtd > 0);
    if (!its.length) return toast('Adicione ao menos um produto.', 'aviso');
    const forma = f.forma.value, n = +f.parcelas.value, cartao = forma.startsWith('Cartão'), imediata = cartao || (IMEDIATAS.includes(forma) && n === 1);
    const aPrazo = receberAtual > 0 && (!imediata || (!cartao && !f.recebido.checked));
    const cli = cliPorId(f.cliente.value);
    if (aPrazo && !cli && !await ask('Venda a prazo sem cliente selecionado. Deseja continuar mesmo assim?', { ok: 'Continuar' })) return;
    const falta = its.some(i => { const p = prodPorId(i.prodId); return p && its.filter(x => x.prodId === i.prodId).reduce((s, x) => s + x.qtd, 0) > qtdProduto(p); });
    if (falta && !await ask('Há itens com estoque insuficiente. O estoque ficará zerado para esses itens. Continuar?', { ok: 'Finalizar assim mesmo' })) return;
    m.$('#fin').disabled = true;
    const ok = await salvarVenda({
      itens: its, cli, data: f.data.value || hoje(), vendedorUid: f.vendedor.value, desconto: parseNum(f.desconto.value), frete: parseNum(f.frete.value),
      comissaoPct: parseNum(f.comissao.value), forma, n, aPrazo, entrada: aPrazo ? parseNum(f.entrada.value) : null, venc: f.venc.value, intervalo: f.intervalo.value,
      entrega: f.entrega.value, obs: f.obs.value.trim(), pedido: pre.pedido, juros: jurosAtual, taxaPct: taxaCartao(forma, n), taxaValor: taxaAtual, cupom: pre.cupom || '',
      cons: creditoAtual > 0 && cli ? { gid: f.consg.value, valor: creditoAtual } : null
    });
    m.$('#fin').disabled = false;
    if (ok) { m.fechar(); verVenda(ok); }
  };
}

function gerarParcelas(valor, n, venc, intervalo) {
  valor = r2(valor); if (valor <= 0) return [];
  const base = Math.floor(valor / n * 100) / 100; const out = [];
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? r2(valor - base * (n - 1)) : base;
    const d = intervalo === 'mes' ? addMeses(venc, i) : addDias(venc, i * Number(intervalo));
    out.push({ valor: v, venc: d });
  }
  return out;
}

async function salvarVenda(o) {
  const id = uid(), numero = proxNumero('vendas');
  const ops = [];
  const lotesAtuais = {};
  const itens = o.itens.map(i => {
    const p = prodPorId(i.prodId);
    if (!p) return { ...i, custo: 0, baixas: [] };
    if (ehKit(p)) {
      const baixasKit = []; let custo = 0;
      for (const c of p.kit) {
        const cp = prodPorId(c.prodId); if (!cp) continue;
        const { lotes, baixas } = baixarLotes(lotesAtuais[cp.id] || cp.lotes || [], r2((Number(c.qtd) || 1) * i.qtd));
        lotesAtuais[cp.id] = lotes;
        custo += baixas.reduce((s, b) => s + b.qtd * (b.semEstoque ? (cp.custo || 0) : (b.custo || cp.custo || 0)), 0);
        baixasKit.push({ prodId: cp.id, baixas });
      }
      return { prodId: p.id, nome: p.nome, marca: p.marca || '', categoria: p.categoria || '', qtd: i.qtd, preco: i.preco, custo: r2(custo), baixas: [], baixasKit, kit: true, promo: i.promo || '' };
    }
    const atual = lotesAtuais[p.id] || p.lotes || [];
    const { lotes, baixas } = baixarLotes(atual, i.qtd);
    lotesAtuais[p.id] = lotes;
    const custo = r2(baixas.reduce((s, b) => s + b.qtd * (b.semEstoque ? (p.custo || 0) : (b.custo || p.custo || 0)), 0));
    return { prodId: p.id, nome: p.nome, marca: p.marca || '', categoria: p.categoria || '', qtd: i.qtd, preco: i.preco, custo, baixas, promo: i.promo || '' };
  });
  Object.entries(lotesAtuais).forEach(([pid, lotes]) => {
    ops.push({ op: 'upd', col: 'produtos', id: pid, data: { lotes, atualizadoEm: Date.now() } });
    ops.push(...opsItemLoja({ ...prodPorId(pid), lotes }));
  });
  // atualiza a disponibilidade na loja dos kits que usam os componentes vendidos
  const qtdCom = id => (lotesAtuais[id] || (prodPorId(id) || {}).lotes || []).reduce((s, x) => s + (Number(x.qtd) || 0), 0);
  S.d.produtos.filter(k => ehKit(k) && k.kit.some(c => lotesAtuais[c.prodId])).forEach(k => ops.push(...opsItemLoja(k, false, Math.max(0, Math.min(...k.kit.map(c => Math.floor(qtdCom(c.prodId) / (Number(c.qtd) || 1))))))));
  const subtotal = r2(itens.reduce((s, i) => s + i.qtd * i.preco, 0));
  const total = r2(Math.max(0, subtotal - o.desconto + o.frete) + (o.juros || 0));
  const vend = S.d.membros.find(x => x.id === o.vendedorUid) || { nome: S.membro.nome };
  const venda = {
    numero, data: o.data, clienteId: o.cli ? o.cli.id : '', clienteNome: o.cli ? o.cli.nome : '', clienteFone: o.cli ? o.cli.whatsapp || '' : '',
    itens, subtotal, desconto: o.desconto, frete: o.frete, total, custoTotal: r2(itens.reduce((s, i) => s + i.custo, 0)),
    forma: o.forma, parcelas: o.n, vendedorUid: o.vendedorUid, vendedorNome: vend.nome, comissaoPct: o.comissaoPct,
    comissaoValor: r2((total - o.frete - (o.juros || 0)) * o.comissaoPct / 100), statusEntrega: o.entrega, obs: o.obs,
    juros: o.juros || 0, taxaCartaoPct: o.taxaPct || 0, taxaCartaoValor: o.taxaValor || 0, cupom: o.cupom || '',
    origem: o.pedido ? 'loja' : 'balcao', pedidoId: o.pedido ? o.pedido.id : '', cancelada: false, criadoEm: Date.now(), criadoPor: S.user.uid
  };
  const cred = o.cons ? r2(Math.min(o.cons.valor, total)) : 0;
  const gCons = o.cons && S.d.consorcios.find(g => g.id === o.cons.gid);
  if (cred && gCons) { venda.consorcio = { grupo: gCons.grupo, grupoId: gCons.id, credito: cred }; venda.forma = `Crédito consórcio G${gCons.grupo}` + (total - cred > 0 ? ' + ' + o.forma : ''); }
  ops.push({ op: 'set', col: 'vendas', id, data: venda });
  if (venda.taxaCartaoValor > 0) ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: `Taxa da maquininha — venda #${numero}`, categoria: 'Taxas de cartão', valor: venda.taxaCartaoValor, vencimento: o.data, pago: true, dataPagamento: o.data, forma: o.forma, origem: 'taxa', refId: id, criadoEm: Date.now() } });

  const baseRec = { vendaId: id, numeroVenda: numero, clienteId: venda.clienteId, clienteNome: venda.clienteNome, clienteFone: venda.clienteFone, criadoEm: Date.now() };
  const pagamentoAgora = (valor, desc) => {
    ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'receita', descricao: desc, categoria: 'Vendas', valor, vencimento: o.data, pago: true, dataPagamento: o.data, forma: o.forma, origem: 'venda', refId: id, criadoEm: Date.now() } });
  };
  if (cred && gCons) {
    ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...baseRec, parcela: 0, totalParcelas: 1, valor: cred, pago: cred, vencimento: o.data, forma: 'Crédito de consórcio', consorcio: true, pagamentos: [{ data: o.data, valor: cred, forma: 'Crédito de consórcio' }] } });
    ops.push(opsResgate(gCons, o.cli.id, { vendaId: id, numero, valor: cred, data: o.data }));
  }
  const aRec = r2(total - (cred && gCons ? cred : 0));
  if (aRec > 0) {
    if (!o.aPrazo) {
      ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...baseRec, parcela: 1, totalParcelas: 1, valor: aRec, pago: aRec, vencimento: o.data, forma: o.forma, pagamentos: [{ data: o.data, valor: aRec, forma: o.forma }] } });
      pagamentoAgora(aRec, `Venda #${numero}${venda.clienteNome ? ' — ' + venda.clienteNome : ''}`);
    } else {
      const ent = Math.min(o.entrada || 0, aRec);
      if (ent > 0) {
        ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...baseRec, parcela: 0, totalParcelas: o.n, valor: ent, pago: ent, vencimento: o.data, forma: o.forma, pagamentos: [{ data: o.data, valor: ent, forma: o.forma }] } });
        pagamentoAgora(ent, `Entrada venda #${numero}${venda.clienteNome ? ' — ' + venda.clienteNome : ''}`);
      }
      gerarParcelas(aRec - ent, o.n, o.venc, o.intervalo).forEach((p, i) => ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...baseRec, parcela: i + 1, totalParcelas: o.n, valor: p.valor, pago: 0, vencimento: p.venc, forma: o.forma, pagamentos: [] } }));
    }
  }
  if (o.pedido) ops.push({ op: 'upd', path: `lojas/${S.conta.loja.slug}/pedidos/${o.pedido.id}`, data: { status: 'convertido', vendaId: id, numeroVenda: numero } });
  const ok = await commit(ops, `Registrou venda #${numero} de ${brl(total)}${venda.clienteNome ? ' para ' + venda.clienteNome : ''}`);
  if (ok) toast(`Venda #${numero} registrada!`);
  return ok ? id : null;
}

// ======================================================= DETALHES
export function verVenda(id) {
  const v = S.d.vendas.find(x => x.id === id); if (!v) return;
  const ed = pode('vendas', 'editar'), edc = pode('cobrancas', 'editar');
  const recs = recsDaVenda(id), pago = r2(pagoVenda(id)), resta = r2(Math.max(0, v.total - pago));
  const lucro = lucroVenda(v), entregue = v.statusEntrega === 'entregue';
  const foto = i => { const p = prodPorId(i.prodId) || S.d.produtos.find(x => norm(x.nome) === norm(i.nome)); return p && p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<span>${icon('box')}</span>`; };
  const nomeRec = r => r.consorcio ? 'Crédito do consórcio' : r.forma === 'Crediário' || !r.forma ? 'Crediário' : r.forma;
  const m = modal({
    titulo: 'Detalhes da venda', largo: true,
    corpo: `<div class="vd">
      <div class="vd-cli">${avatar(v.clienteNome || 'C F')}<b>${esc(v.clienteNome || 'Consumidor final')}</b><span class="vd-data">${icon('cal')}${fmtData(v.data)}</span></div>
      <div class="vd-tot"><b>${brl(v.total)}</b>${v.cancelada ? '<span class="pill mudo">Cancelada</span>' : `<button class="pill-ent ${entregue ? 'ok' : 'aviso'}" id="ent" ${ed ? '' : 'disabled'}>${icon(entregue ? 'check' : 'truck')}${entregue ? 'Já entregue' : 'A entregar'}</button>`}</div>
      ${v.obs ? `<div class="vd-obs"><div><small>Observações</small><p>${esc(v.obs)}</p></div>${ed ? `<button class="btn-ic" id="obs">${icon('edit')}</button>` : ''}</div>` : ed ? `<a href="#" class="vd-addobs" id="obs">${icon('nota')}Adicionar observações</a>` : ''}
      <div class="vd-abas"><button data-aba="itens" class="ativo">Itens</button><button data-aba="pag">Pagamento</button><button data-aba="det">Detalhes</button></div>
      <div data-painel="itens"><div class="vd-itens">${v.itens.map(i => `<div class="vd-item"><div class="vd-foto">${foto(i)}</div><div><b>${esc(i.nome)}</b><small>${i.preco ? brl(i.preco) + ' - ' : ''}${nfmt(i.qtd)} unidade${i.qtd > 1 ? 's' : ''}</small></div></div>`).join('')}</div></div>
      <div data-painel="pag" hidden>
        <div class="vd-prog"><div><small>Total pago</small><b>${brl(pago)}</b></div><div class="ta-d"><small>Restante</small><b>${brl(resta)}</b></div></div>
        <div class="prog grossa"><i style="width:${v.total ? Math.min(100, pago / v.total * 100) : 0}%"></i></div>
        ${recs.length ? recs.map(r => { const s = statusRec(r), ultimo = (r.pagamentos || []).slice(-1)[0];
          return `<div class="vd-parc"><span class="vd-ic">${icon('cal')}</span><div><small>${esc(nomeRec(r))}${r.totalParcelas > 1 && r.parcela ? ` · ${r.parcela}/${r.totalParcelas}` : ''}</small><b>${brl(r.valor)}</b></div>
            <div class="ta-d"><small>Vencimento</small><b>${fmtData(r.vencimento)}</b>${s === 'pago' ? `<span class="pill ok">Pago${ultimo ? ' em ' + fmtData(ultimo.data).slice(0, 5) : ''}</span>` : s === 'vencido' ? '<span class="pill perigo">Vencida</span>' : (Number(r.pago) || 0) > 0 ? `<span class="pill info">Pago ${brl(r.pago)}</span>` : '<span class="pill mudo">Pendente</span>'}</div>
            <div class="vd-acoes">${edc && (s === 'aberto' || s === 'vencido') ? `<button class="btn sm pri" data-rec="${r.id}">Receber</button><button class="btn-ic" data-pix="${r.id}" title="Cobrar no Pix">${icon('pix')}</button>` : ''}${(r.pagamentos || []).some(p => p.comprovante) ? `<button class="btn-ic" data-vcomp="${r.id}" title="Ver comprovante">${icon('eye')}</button>` : ''}</div></div>`; }).join('') : '<p class="mudo">Sem valores a receber.</p>'}
      </div>
      <div data-painel="det" hidden><div class="vd-det">
        <div><span>Total em produtos</span><span>${brl(v.subtotal)}</span></div>
        ${v.desconto ? `<div><span>Desconto</span><span>− ${brl(v.desconto)}</span></div>` : ''}
        ${v.frete ? `<div><span>Frete</span><span>${brl(v.frete)}</span></div>` : ''}
        ${v.juros ? `<div><span>Juros do cartão</span><span>${brl(v.juros)}</span></div>` : ''}
        <div class="forte"><span>Valor Total</span><span>${brl(v.total)}</span></div>
        ${v.consorcio ? `<div><span>Crédito do consórcio G${v.consorcio.grupo}</span><span>${brl(v.consorcio.credito)}</span></div>` : ''}
        <div><span>Valor Pago</span><span class="t-ok">${brl(pago)}</span></div>
        <div><span>Valor Restante</span><span class="t-perigo">${brl(resta)}</span></div>
        ${v.taxaCartaoValor ? `<div><span>Taxa da maquininha</span><span>− ${brl(v.taxaCartaoValor)}</span></div>` : ''}
        ${pode('relatorios') ? `<div><span>${lucro < 0 ? 'Prejuízo' : 'Lucro'}</span><button class="btn sm" id="verlucro">Toque para ver</button></div>` : ''}
        <div><span>Forma de pagamento</span><span>${esc(v.forma || '')}</span></div>
        <div><span>Vendedor(a)</span><span>${esc(v.vendedorNome || '—')}</span></div>
        <div><span>Nº da venda</span><span>#${v.numero}${v.importado ? ' · trazida do Revendi' : ''}</span></div>
      </div></div>
    </div>`,
    rodape: `${ed && !v.cancelada ? `<button class="btn perigo-txt" id="canc">${icon('undo')}Cancelar</button>` : ''}<span class="grow"></span>
      <button class="btn" id="imp">${icon('print')}<span class="so-desk-i">Imprimir</span></button>
      <button class="btn wa" id="wa">${icon('wa')}Enviar recibo</button>`
  });
  m.el.classList.add('cheia');
  m.$$('[data-aba]').forEach(b => b.onclick = () => { m.$$('[data-aba]').forEach(x => x.classList.toggle('ativo', x === b)); m.$$('[data-painel]').forEach(p => p.hidden = p.dataset.painel !== b.dataset.aba); });
  const vl = m.$('#verlucro'); if (vl) vl.onclick = () => { vl.outerHTML = `<b class="${lucro < 0 ? 't-perigo' : 't-ok'}">${brl(Math.abs(lucro))}</b>`; };
  const en = m.$('#ent'); if (en && ed) en.onclick = async () => { await mudarEntrega(v.id, entregue ? 'pendente' : 'entregue'); m.fechar(); verVenda(id); };
  const ob = m.$('#obs'); if (ob) ob.onclick = e => {
    e.preventDefault();
    const mm = modal({ titulo: 'Observações', corpo: `<textarea id="tx" rows="4" style="width:100%">${esc(v.obs || '')}</textarea>`, rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>` });
    mm.$('#ok').onclick = async () => { if (await commit([{ op: 'upd', col: 'vendas', id: v.id, data: { obs: mm.$('#tx').value.trim() } }])) { mm.fechar(); m.fechar(); verVenda(id); } };
  };
  m.$$('[data-rec]').forEach(b => b.onclick = () => { m.fechar(); receber(S.d.recebiveis.find(r => r.id === b.dataset.rec)); });
  m.$$('[data-pix]').forEach(b => b.onclick = () => enviarPix(S.d.recebiveis.find(r => r.id === b.dataset.pix)));
  m.$$('[data-vcomp]').forEach(b => b.onclick = async () => { const r = S.d.recebiveis.find(x => x.id === b.dataset.vcomp); (await import('./cobrancas.js')).verComprovante(r.pagamentos.find(p => p.comprovante).comprovante); });
  m.$('#wa').onclick = () => {
    const cli = cliPorId(v.clienteId);
    window.open(waLink(cli ? cli.whatsapp : v.clienteFone, textoRecibo(v)), '_blank');
  };
  m.$('#imp').onclick = () => imprimir(v);
  const c = m.$('#canc'); if (c) c.onclick = () => { m.fechar(); cancelar(v); };
}

export function textoRecibo(v) {
  const recs = recsDaVenda(v.id), pago = pagoVenda(v.id);
  const itens = v.itens.map(i => `• ${nfmt(i.qtd)}x ${i.nome} — ${brl(i.qtd * i.preco)}`).join('\n');
  const abertas = recs.filter(r => saldoRec(r) > 0.004 && !r.cancelado);
  const pag = pago >= v.total - 0.004 ? `Pagamento: ${v.forma} ✅ quitado` :
    `Pago: ${brl(pago)}\nEm aberto:\n` + abertas.map(r => `  ${r.parcela}/${r.totalParcelas} — ${brl(saldoRec(r))} vence ${fmtData(r.vencimento)}`).join('\n');
  const tpl = cfg().msgRecibo || 'Olá {cliente}! Obrigada pela sua compra 💖\n\n*Pedido nº {numero}* — {data}\n{itens}\n\n*Total: {total}*\n{pagamento}\n\n{loja}';
  return preencher(tpl, { cliente: (v.clienteNome || '').split(' ')[0] || '', numero: v.numero, data: fmtData(v.data), itens, total: brl(v.total), pagamento: pag, loja: S.conta.nome || '' });
}

function imprimir(v) {
  const recs = recsDaVenda(v.id);
  const w = window.open('', '_blank', 'width=420,height=700'); if (!w) return toast('Permita pop-ups para imprimir.', 'aviso');
  const c = cfg();
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Venda ${v.numero}</title>
  <style>body{font:13px/1.45 system-ui,sans-serif;max-width:340px;margin:16px auto;color:#111}h1{font-size:17px;margin:0}table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}.n{text-align:right}.t{border-top:1px dashed #999;margin-top:8px;padding-top:8px}.c{text-align:center}img{max-height:60px}small{color:#555}</style>
  <div class="c">${c.logo ? `<img src="${c.logo}"><br>` : ''}<h1>${esc(S.conta.nome || '')}</h1>${c.telefone ? `<small>${esc(c.telefone)}</small>` : ''}</div>
  <div class="t">Venda <b>#${v.numero}</b> — ${fmtData(v.data)}<br>Cliente: ${esc(v.clienteNome || 'Consumidor final')}<br>Vendedor(a): ${esc(v.vendedorNome || '')}</div>
  <table class="t">${v.itens.map(i => `<tr><td>${nfmt(i.qtd)}x ${esc(i.nome)}</td><td class="n">${brl(i.qtd * i.preco)}</td></tr>`).join('')}</table>
  <table class="t">${v.desconto ? `<tr><td>Desconto</td><td class="n">− ${brl(v.desconto)}</td></tr>` : ''}${v.frete ? `<tr><td>Frete</td><td class="n">${brl(v.frete)}</td></tr>` : ''}<tr><td><b>TOTAL</b></td><td class="n"><b>${brl(v.total)}</b></td></tr><tr><td>Forma</td><td class="n">${esc(v.forma)}</td></tr></table>
  ${recs.filter(r => r.parcela > 0 && saldoRec(r) > 0).length ? `<table class="t"><tr><td colspan="2"><b>Parcelas</b></td></tr>${recs.filter(r => r.parcela > 0).map(r => `<tr><td>${r.parcela}/${r.totalParcelas} · ${fmtData(r.vencimento)}</td><td class="n">${brl(r.valor)}${saldoRec(r) <= 0 ? ' ✓' : ''}</td></tr>`).join('')}</table>` : ''}
  <p class="c t"><small>Obrigada pela preferência!</small></p><script>onload=()=>{print()}<\/script>`);
  w.document.close();
}

async function cancelar(v) {
  const credC = r2(recsDaVenda(v.id).filter(r => r.consorcio).reduce((s, r) => s + (Number(r.pago) || 0), 0));
  const pago = r2(pagoVenda(v.id) - credC);
  const m = modal({
    titulo: `Cancelar venda #${v.numero}`,
    corpo: `<p>Os produtos voltam para o estoque e as parcelas em aberto são canceladas.</p>
    ${pago > 0 ? `<label class="chk"><input type="checkbox" id="est" checked> Registrar devolução de ${brl(pago)} ao cliente no financeiro</label>` : ''}
    ${credC ? `<p class="mudo pq">O crédito de consórcio usado (${brl(credC)}) volta a ficar disponível para a cliente.</p>` : ''}
    <label class="form">Motivo<input id="mot" placeholder="Opcional"></label>`,
    rodape: `<button class="btn" data-fechar>Voltar</button><button class="btn perigo" id="ok">Cancelar venda</button>`
  });
  m.$('#ok').onclick = async () => {
    const ops = [];
    const porProd = {};
    v.itens.forEach(i => {
      if (i.prodId && (i.baixas || []).length) (porProd[i.prodId] = porProd[i.prodId] || []).push(...i.baixas);
      (i.baixasKit || []).forEach(k => (porProd[k.prodId] = porProd[k.prodId] || []).push(...(k.baixas || [])));
    });
    Object.entries(porProd).forEach(([pid, bx]) => {
      const p = prodPorId(pid); if (!p) return;
      const lotes = devolverLotes(p.lotes, bx);
      ops.push({ op: 'upd', col: 'produtos', id: pid, data: { lotes } }, ...opsItemLoja({ ...p, lotes }));
    });
    recsDaVenda(v.id).forEach(r => ops.push({ op: 'upd', col: 'recebiveis', id: r.id, data: { cancelado: true } }));
    const est = m.$('#est');
    if (est && est.checked) ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: `Devolução — venda #${v.numero} cancelada`, categoria: 'Devoluções', valor: pago, vencimento: hoje(), pago: true, dataPagamento: hoje(), origem: 'cancelamento', refId: v.id, criadoEm: Date.now() } });
    S.d.consorcios.forEach(g => { if ((g.participantes || []).some(p => p.resgate && p.resgate.vendaId === v.id)) ops.push({ op: 'upd', col: 'consorcios', id: g.id, data: { participantes: g.participantes.map(p => p.resgate && p.resgate.vendaId === v.id ? { ...p, resgate: null } : p) } }); });
    ops.push({ op: 'upd', col: 'vendas', id: v.id, data: { cancelada: true, canceladaEm: Date.now(), motivoCancelamento: m.$('#mot').value } });
    if (await commit(ops, `Cancelou venda #${v.numero}`)) { toast('Venda cancelada e estoque devolvido.'); m.fechar(); }
  };
}
