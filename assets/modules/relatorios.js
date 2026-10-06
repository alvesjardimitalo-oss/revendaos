// Relatórios gerenciais
import { $, $$, esc, brl, nfmt, pct, r2, fmtData, hoje, addMeses, mesAtual, toCSV, baixar, categoriaPorNome } from '../utils.js';
import { S, cfg, icon, vendasValidas, vazio, qtdProduto, saldoRec, ehKit, badge, prodPorId } from '../core.js';

let F = { per: 'mes', de: '', ate: '', aba: 'vendas', grupo: 'marca' };
let graf;

function intervalo() {
  const h = hoje(), ym = mesAtual();
  switch (F.per) {
    case 'mes': return [ym + '-01', h];
    case 'mespass': { const m = addMeses(ym + '-15', -1).slice(0, 7); const [y, mm] = m.split('-').map(Number); return [m + '-01', m + '-' + String(new Date(y, mm, 0).getDate()).padStart(2, '0')]; }
    case '3m': return [addMeses(ym + '-01', -2), h];
    case '12m': return [addMeses(ym + '-01', -11), h];
    case 'ano': return [h.slice(0, 4) + '-01-01', h];
    default: return [F.de || '0000', F.ate || '9999'];
  }
}
function agrupar(itens, chave) {
  const g = {};
  itens.forEach(i => { const k = chave(i) || '—'; const x = g[k] = g[k] || { k, qtd: 0, rec: 0, custo: 0, n: 0 }; x.qtd += i.qtd || 0; x.rec += i.rec || 0; x.custo += i.custo || 0; x.n++; });
  return Object.values(g).map(x => ({ ...x, lucro: x.rec - x.custo })).sort((a, b) => b.rec - a.rec);
}
const tab = (titulo, linhas, colunas) => `<div class="card"><h4>${titulo}</h4>${linhas.length ? `<table class="tabela mini"><thead><tr>${colunas.map(c => `<th class="${c.n ? 'n' : ''}">${c.t}</th>`).join('')}</tr></thead><tbody>${linhas.map(l => `<tr>${colunas.map(c => `<td class="${c.n ? 'n' : ''}">${c.v(l)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="mudo pq">Sem dados.</p>'}</div>`;

export function render(el) {
  el.innerHTML = `<div class="abas">${[['vendas', 'Vendas e lucro'], ['estoque', 'Estoque'], ['inad', 'Inadimplência']].map(([k, t]) => `<button data-aba="${k}" class="${F.aba === k ? 'ativo' : ''}">${t}</button>`).join('')}</div><div id="rel"></div>`;
  $$('[data-aba]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.aba; render(el); });
  const a = $('#rel', el);
  if (F.aba === 'estoque') return relEstoque(a);
  if (F.aba === 'inad') return relInad(a);
  relVendas(a);
}

function relEstoque(el) {
  const ps = S.d.produtos.filter(p => p.ativo !== false && !ehKit(p));
  const limite = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const ultimaVenda = {}; vendasValidas().forEach(v => v.itens.forEach(i => { if (!ultimaVenda[i.prodId] || v.data > ultimaVenda[i.prodId]) ultimaVenda[i.prodId] = v.data; }));
  const g = {};
  ps.forEach(p => {
    const k = (F.grupo === 'marca' ? p.marca : p.categoria) || 'Sem ' + (F.grupo === 'marca' ? 'marca' : 'categoria');
    const q = qtdProduto(p), custo = (p.lotes || []).reduce((s, l) => s + l.qtd * (l.custo || p.custo || 0), 0);
    const x = g[k] = g[k] || { k, itens: 0, un: 0, custo: 0, venda: 0, parados: 0 };
    x.itens++; x.un += q; x.custo += custo; x.venda += q * (p.preco || 0); if (q > 0 && !(ultimaVenda[p.id] >= limite)) x.parados++;
  });
  const l = Object.values(g).sort((a, b) => b.custo - a.custo);
  const tot = l.reduce((s, x) => ({ un: s.un + x.un, custo: s.custo + x.custo, venda: s.venda + x.venda }), { un: 0, custo: 0, venda: 0 });
  const parados = ps.filter(p => qtdProduto(p) > 0 && !(ultimaVenda[p.id] >= limite)).sort((a, b) => (a.lotes || []).reduce((s, x) => s + x.qtd * (x.custo || 0), 0) < (b.lotes || []).reduce((s, x) => s + x.qtd * (x.custo || 0), 0) ? 1 : -1);
  el.innerHTML = `<div class="kpis">
    <div class="kpi"><span>Unidades em estoque</span><b>${nfmt(tot.un)}</b><small>${ps.length} produtos</small></div>
    <div class="kpi"><span>Valor a preço de custo</span><b>${brl(tot.custo)}</b></div>
    <div class="kpi"><span>Valor a preço de venda</span><b>${brl(tot.venda)}</b><small>lucro potencial ${brl(tot.venda - tot.custo)}</small></div>
    <div class="kpi ${parados.length ? 'alerta' : ''}"><span>Parados há 90+ dias</span><b>${parados.length}</b><small>com estoque e sem venda</small></div>
  </div>
  <div class="barra"><div class="seg"><button data-g="marca" class="${F.grupo === 'marca' ? 'ativo' : ''}">Por marca</button><button data-g="categoria" class="${F.grupo === 'categoria' ? 'ativo' : ''}">Por categoria</button></div><span class="grow"></span><button class="btn" id="csv">${icon('down')}Exportar</button></div>
  ${l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>${F.grupo === 'marca' ? 'Marca' : 'Categoria'}</th><th class="n">Produtos</th><th class="n">Unidades</th><th class="n">Custo</th><th class="n">Venda</th><th class="n">Margem</th><th class="n">Parados</th></tr></thead><tbody>
    ${l.map(x => `<tr><td><b>${esc(x.k)}</b></td><td class="n">${x.itens}</td><td class="n">${nfmt(x.un)}</td><td class="n">${brl(x.custo)}</td><td class="n">${brl(x.venda)}</td><td class="n">${x.venda ? pct((x.venda - x.custo) / x.venda * 100) : '—'}</td><td class="n">${x.parados || '—'}</td></tr>`).join('')}
  </tbody></table></div>` : vazio('Sem produtos em estoque.')}
  ${parados.length ? `<div class="card" style="margin-top:14px"><h4>Produtos parados (sem venda há 90 dias)</h4><table class="tabela mini"><tbody>${parados.slice(0, 20).map(p => `<tr><td>${esc(p.nome)}<small class="bl mudo">${esc(p.marca || '')}</small></td><td class="n">${qtdProduto(p)} un.</td><td>${ultimaVenda[p.id] ? 'última venda ' + fmtData(ultimaVenda[p.id]) : 'nunca vendido'}</td></tr>`).join('')}</tbody></table><p class="mudo pq">Dica: crie uma promoção para girar esses itens.</p></div>` : ''}`;
  $$('[data-g]', el).forEach(b => b.onclick = () => { F.grupo = b.dataset.g; relEstoque(el); });
  $('#csv', el).onclick = () => baixar(`estoque-por-${F.grupo}-${hoje()}.csv`, toCSV(l, [{ label: F.grupo, key: 'k' }, { label: 'produtos', key: 'itens' }, { label: 'unidades', key: 'un' }, { label: 'custo', val: x => nfmt(x.custo, 2) }, { label: 'venda', val: x => nfmt(x.venda, 2) }, { label: 'parados', key: 'parados' }]));
}

function relInad(el) {
  const ab = S.d.recebiveis.filter(r => !r.cancelado && saldoRec(r) > 0.004);
  const totAb = ab.reduce((s, r) => s + saldoRec(r), 0);
  const h = hoje(), dias = r => Math.round((new Date(h) - new Date(r.vencimento)) / 864e5);
  const venc = ab.filter(r => r.vencimento < h), totV = venc.reduce((s, r) => s + saldoRec(r), 0);
  const faixas = [['1 a 30 dias', 1, 30], ['31 a 60 dias', 31, 60], ['61 a 90 dias', 61, 90], ['Mais de 90 dias', 91, 1e9]].map(([t, a, b]) => { const l = venc.filter(r => dias(r) >= a && dias(r) <= b); return { t, n: l.length, v: l.reduce((s, r) => s + saldoRec(r), 0) }; });
  const porCli = {}; venc.forEach(r => { const k = r.clienteNome || 'Sem cliente'; const x = porCli[k] = porCli[k] || { k, v: 0, n: 0, max: 0 }; x.v += saldoRec(r); x.n++; x.max = Math.max(x.max, dias(r)); });
  const cl = Object.values(porCli).sort((a, b) => b.v - a.v);
  const vendidoPrazo = S.d.recebiveis.filter(r => !r.cancelado && r.parcela > 0 && r.forma && !r.forma.startsWith('Cartão'));
  const recebidoEmDia = vendidoPrazo.filter(r => saldoRec(r) <= 0.004 && (r.pagamentos || []).every(p => p.data <= r.vencimento)).length;
  el.innerHTML = `<div class="kpis">
    <div class="kpi"><span>Total a receber</span><b>${brl(totAb)}</b><small>${ab.length} parcela(s)</small></div>
    <div class="kpi ${totV ? 'alerta' : ''}"><span>Vencido (inadimplência)</span><b>${brl(totV)}</b><small>${totAb ? pct(totV / totAb * 100) : '0%'} do total a receber</small></div>
    <div class="kpi"><span>Clientes inadimplentes</span><b>${cl.length}</b></div>
    <div class="kpi"><span>Parcelas pagas em dia</span><b>${vendidoPrazo.length ? pct(recebidoEmDia / vendidoPrazo.length * 100) : '—'}</b><small>de todas as vendas a prazo</small></div>
  </div>
  <div class="grid-2c">
    <div class="card"><h4>Atraso por faixa</h4><table class="tabela mini"><tbody>${faixas.map(f => `<tr><td>${f.t}</td><td class="n">${f.n} parcela(s)</td><td class="n"><b>${brl(f.v)}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h4>Quem está devendo</h4>${cl.length ? `<table class="tabela mini"><thead><tr><th>Cliente</th><th class="n">Parcelas</th><th class="n">Maior atraso</th><th class="n">Valor</th></tr></thead><tbody>${cl.slice(0, 20).map(x => `<tr><td>${esc(x.k)}</td><td class="n">${x.n}</td><td class="n">${badge(x.max + ' dias', x.max > 60 ? 'perigo' : 'aviso')}</td><td class="n"><b>${brl(x.v)}</b></td></tr>`).join('')}</tbody></table><p class="pq"><a href="#/cobrancas">Ir para a central de cobrança →</a></p>` : '<p class="mudo">Ninguém em atraso. 🎉</p>'}</div>
  </div>`;
}

function relVendas(el) {
  const [de, ate] = intervalo();
  const vs = vendasValidas().filter(v => v.data >= de && v.data <= ate);
  const fat = vs.reduce((s, v) => s + v.total, 0), frete = vs.reduce((s, v) => s + (v.frete || 0), 0);
  const cmv = vs.reduce((s, v) => s + (v.custoTotal || 0), 0), desc = vs.reduce((s, v) => s + (v.desconto || 0), 0);
  const taxas = vs.reduce((s, v) => s + (v.taxaCartaoValor || 0), 0);
  const lucroB = fat - frete - cmv - taxas;
  const desp = S.d.lancamentos.filter(l => l.tipo === 'despesa' && l.pago && l.categoria !== 'Compra de mercadoria' && l.origem !== 'cancelamento' && l.origem !== 'taxa' && (l.dataPagamento || l.vencimento) >= de && (l.dataPagamento || l.vencimento) <= ate).reduce((s, l) => s + l.valor, 0);
  const itens = vs.flatMap(v => v.itens.map(i => {
    const fator = v.subtotal ? (v.subtotal - (v.desconto || 0)) / v.subtotal : 1; // rateia desconto
    return { ...i, rec: i.qtd * i.preco * fator, cliente: v.clienteNome, forma: v.forma, vendedor: v.vendedorNome };
  }));
  const nItens = itens.reduce((s, i) => s + i.qtd, 0);

  const prods = agrupar(itens, i => i.nome).slice(0, 15);
  const cats = agrupar(itens, i => i.categoria || (prodPorId(i.prodId) || {}).categoria || (/importado/i.test(i.nome) ? 'Vendas antigas (sem detalhe)' : categoriaPorNome(i.nome)) || 'Outros');
  const marcas = agrupar(itens, i => i.marca || 'Sem marca');
  const clientes = (() => { const g = {}; vs.forEach(v => { const k = v.clienteNome || 'Consumidor final'; const x = g[k] = g[k] || { k, n: 0, rec: 0 }; x.n++; x.rec += v.total; }); return Object.values(g).sort((a, b) => b.rec - a.rec).slice(0, 10); })();
  const formas = (() => { const g = {}; vs.forEach(v => { const x = g[v.forma] = g[v.forma] || { k: v.forma, n: 0, rec: 0 }; x.n++; x.rec += v.total; }); return Object.values(g).sort((a, b) => b.rec - a.rec); })();
  const vend = (() => { const g = {}; vs.forEach(v => { const k = v.vendedorUid || '_'; const x = g[k] = g[k] || { k: v.vendedorNome || '—', uid: k, n: 0, rec: 0, com: 0 }; x.n++; x.rec += v.total; x.com += v.comissaoValor || 0; }); return Object.values(g).sort((a, b) => b.rec - a.rec); })();
  const semVenda = S.d.produtos.filter(p => p.ativo !== false && !itens.some(i => i.prodId === p.id));

  el.innerHTML = `
  <div class="barra">
    <select id="per">${[['mes', 'Este mês'], ['mespass', 'Mês passado'], ['3m', 'Últimos 3 meses'], ['12m', 'Últimos 12 meses'], ['ano', 'Este ano'], ['custom', 'Personalizado']].map(([k, t]) => `<option value="${k}" ${F.per === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${F.per === 'custom' ? `<input type="date" id="de" value="${F.de}"><input type="date" id="ate" value="${F.ate}">` : `<span class="mudo pq">${fmtData(de)} a ${fmtData(ate)}</span>`}
    <span class="grow"></span><button class="btn" id="csv">${icon('down')}Exportar itens vendidos</button>
  </div>
  <div class="kpis">
    <div class="kpi"><span>Faturamento</span><b>${brl(fat)}</b><small>${vs.length} vendas · ticket ${brl(vs.length ? fat / vs.length : 0)}</small></div>
    <div class="kpi"><span>Custo dos produtos (CMV)</span><b>${brl(cmv)}</b><small>${nfmt(nItens)} itens vendidos${taxas ? ' · taxas de cartão ' + brl(taxas) : ''}</small></div>
    <div class="kpi"><span>Lucro bruto</span><b>${brl(lucroB)}</b><small>margem ${fat ? pct(lucroB / (fat - frete) * 100) : '—'}</small></div>
    <div class="kpi"><span>Despesas operacionais</span><b>${brl(desp)}</b><small>exceto compra de mercadoria</small></div>
    <div class="kpi"><span>Resultado estimado</span><b class="${lucroB - desp >= 0 ? 't-ok' : 't-perigo'}">${brl(lucroB - desp)}</b><small>descontos dados ${brl(desc)}</small></div>
  </div>
  ${vs.length ? `<div class="grid-2c">
    <div class="card"><h4>Vendas por categoria</h4><div class="graf"><canvas id="g"></canvas></div></div>
    ${tab('Por vendedor(a)', vend, [{ t: 'Nome', v: x => esc(x.k) }, { t: 'Vendas', n: 1, v: x => x.n }, { t: 'Total', n: 1, v: x => brl(x.rec) }, { t: 'Meta', n: 1, v: x => { const m = (S.d.membros.find(mm => mm.id === x.uid) || {}).meta; return m ? pct(x.rec / m * 100) : '—'; } }, { t: 'Comissão', n: 1, v: x => brl(x.com) }])}
    ${tab('Produtos mais vendidos', prods, [{ t: 'Produto', v: x => esc(x.k) }, { t: 'Qtd.', n: 1, v: x => nfmt(x.qtd) }, { t: 'Receita', n: 1, v: x => brl(x.rec) }, { t: 'Lucro', n: 1, v: x => brl(x.lucro) }])}
    ${tab('Melhores clientes', clientes, [{ t: 'Cliente', v: x => esc(x.k) }, { t: 'Compras', n: 1, v: x => x.n }, { t: 'Total', n: 1, v: x => brl(x.rec) }])}
    ${tab('Por marca', marcas, [{ t: 'Marca', v: x => esc(x.k) }, { t: 'Qtd.', n: 1, v: x => nfmt(x.qtd) }, { t: 'Receita', n: 1, v: x => brl(x.rec) }, { t: 'Margem', n: 1, v: x => x.rec ? pct(x.lucro / x.rec * 100) : '—' }])}
    ${tab('Por forma de pagamento', formas, [{ t: 'Forma', v: x => esc(x.k) }, { t: 'Vendas', n: 1, v: x => x.n }, { t: 'Total', n: 1, v: x => brl(x.rec) }])}
    ${tab('Por categoria', cats, [{ t: 'Categoria', v: x => esc(x.k) }, { t: 'Qtd.', n: 1, v: x => nfmt(x.qtd) }, { t: 'Receita', n: 1, v: x => brl(x.rec) }, { t: 'Lucro', n: 1, v: x => brl(x.lucro) }])}
    ${tab(`Produtos sem venda no período (${semVenda.length})`, semVenda.slice(0, 15), [{ t: 'Produto', v: p => esc(p.nome) }, { t: 'Marca', v: p => esc(p.marca || '') }])}
  </div>` : vazio('Nenhuma venda no período selecionado.')}`;

  const re = () => relVendas(el);
  $('#per', el).onchange = e => { F.per = e.target.value; re(); };
  ['de', 'ate'].forEach(k => { const x = $('#' + k, el); if (x) x.onchange = e => { F[k] = e.target.value; re(); }; });
  $('#csv', el).onclick = () => baixar(`itens-vendidos-${de}-a-${ate}.csv`, toCSV(vs.flatMap(v => v.itens.map(i => ({ v, i }))), [
    { label: 'venda', val: x => x.v.numero }, { label: 'data', val: x => x.v.data }, { label: 'cliente', val: x => x.v.clienteNome }, { label: 'vendedor', val: x => x.v.vendedorNome },
    { label: 'produto', val: x => x.i.nome }, { label: 'marca', val: x => x.i.marca }, { label: 'categoria', val: x => x.i.categoria }, { label: 'qtd', val: x => x.i.qtd },
    { label: 'preco', val: x => nfmt(x.i.preco, 2) }, { label: 'custo_total', val: x => nfmt(x.i.custo, 2) }, { label: 'forma', val: x => x.v.forma }]));

  const cv = $('#g', el);
  if (cv && !window.Chart) cv.parentElement.innerHTML = '<p class="mudo pq" style="padding:20px 0">Gráfico indisponível agora (sem conexão com a biblioteca de gráficos).</p>';
  if (cv && window.Chart) {
    graf && graf.destroy();
    const cs = getComputedStyle(document.documentElement);
    const cores = ['--pri', '#7c4dff', '#26a69a', '#ffa726', '#42a5f5', '#ef5350', '#8d6e63', '#78909c'].map(c => c.startsWith('--') ? cs.getPropertyValue(c).trim() : c);
    graf = new Chart(cv, { type: 'doughnut', data: { labels: cats.slice(0, 8).map(c => c.k), datasets: [{ data: cats.slice(0, 8).map(c => r2(c.rec)), backgroundColor: cores, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: cs.getPropertyValue('--txt2').trim() } }, tooltip: { callbacks: { label: c => c.label + ': ' + brl(c.raw) } } } } });
  }
}
