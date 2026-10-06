// Financeiro: lançamentos, contas a pagar/receber, fluxo de caixa e comissões
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtData, hoje, addMeses, mesAtual, nomeMes, toCSV, baixar } from '../utils.js';
import { S, pode, icon, modal, ask, toast, commit, saldoRec, badge, vazio, datalist, FORMAS } from '../core.js';

let F = { mes: mesAtual(), aba: 'lanc', tipo: '', st: '' };
const CATS_D = ['Compra de mercadoria', 'Embalagens', 'Frete / entregas', 'Comissões', 'Marketing', 'Taxas de cartão', 'Transporte', 'Pró-labore', 'Outras despesas'];
const CATS_R = ['Vendas', 'Outras receitas', 'Bonificação da marca'];
let grafico;

const dataRef = l => l.pago ? (l.dataPagamento || l.vencimento) : l.vencimento;

export function render(el) {
  const ed = pode('financeiro', 'editar');
  const ym = F.mes;
  const ls = S.d.lancamentos;
  const doMes = ls.filter(l => (dataRef(l) || '').startsWith(ym));
  const ent = doMes.filter(l => l.tipo === 'receita' && l.pago).reduce((s, l) => s + l.valor, 0);
  const sai = doMes.filter(l => l.tipo === 'despesa' && l.pago).reduce((s, l) => s + l.valor, 0);
  const aPagar = ls.filter(l => l.tipo === 'despesa' && !l.pago && l.vencimento <= ym + '-31');
  const aPagarV = aPagar.reduce((s, l) => s + l.valor, 0);
  const aRec = S.d.recebiveis.filter(r => !r.cancelado && saldoRec(r) > 0 && r.vencimento <= ym + '-31').reduce((s, r) => s + saldoRec(r), 0)
    + ls.filter(l => l.tipo === 'receita' && !l.pago && l.vencimento <= ym + '-31').reduce((s, l) => s + l.valor, 0);
  const meses = [...new Set([mesAtual(), ...ls.map(l => (dataRef(l) || '').slice(0, 7))])].filter(Boolean).sort().reverse();

  el.innerHTML = `
  <div class="barra">
    <select id="mes">${meses.map(m => `<option value="${m}" ${F.mes === m ? 'selected' : ''}>${nomeMes(m)}</option>`).join('')}</select>
    <span class="grow"></span>
    ${ed ? `<button class="btn" id="desp">${icon('plus')}Despesa</button><button class="btn pri" id="rec">${icon('plus')}Receita</button>` : ''}
  </div>
  <div class="kpis">
    <div class="kpi"><span>Entradas do mês</span><b class="t-ok">${brl(ent)}</b></div>
    <div class="kpi"><span>Saídas do mês</span><b class="t-perigo">${brl(sai)}</b></div>
    <div class="kpi"><span>Saldo do mês</span><b>${brl(ent - sai)}</b></div>
    <div class="kpi"><span>A receber até o fim do mês</span><b>${brl(aRec)}</b></div>
    <div class="kpi ${aPagar.some(l => l.vencimento < hoje()) ? 'alerta' : ''}"><span>A pagar até o fim do mês</span><b>${brl(aPagarV)}</b><small>${aPagar.filter(l => l.vencimento < hoje()).length} vencida(s)</small></div>
  </div>
  <div class="abas">${[['lanc', 'Lançamentos'], ['pagar', 'Contas a pagar'], ['fluxo', 'Fluxo de caixa'], ['comissoes', 'Comissões']].map(([k, t]) => `<button data-aba="${k}" class="${F.aba === k ? 'ativo' : ''}">${t}</button>`).join('')}</div>
  <div id="aba"></div>`;

  const re = () => render(el);
  $('#mes', el).onchange = e => { F.mes = e.target.value; re(); };
  $$('[data-aba]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.aba; re(); });
  if (ed) { $('#desp', el).onclick = () => formLanc({ tipo: 'despesa' }); $('#rec', el).onclick = () => formLanc({ tipo: 'receita' }); }
  const a = $('#aba', el);
  if (F.aba === 'lanc') abaLanc(a, doMes, ed, re);
  if (F.aba === 'pagar') abaLanc(a, ls.filter(l => l.tipo === 'despesa' && !l.pago).sort((x, y) => x.vencimento > y.vencimento ? 1 : -1), ed, re, true);
  if (F.aba === 'fluxo') abaFluxo(a);
  if (F.aba === 'comissoes') abaComissoes(a, ed);
}

function abaLanc(a, lista, ed, re, soPagar = false) {
  let l = lista;
  if (!soPagar) {
    if (F.tipo) l = l.filter(x => x.tipo === F.tipo);
    if (F.st) l = l.filter(x => F.st === 'pago' ? x.pago : !x.pago);
    l = [...l].sort((x, y) => dataRef(y) > dataRef(x) ? 1 : -1);
  }
  a.innerHTML = `${!soPagar ? `<div class="barra"><select id="tipo"><option value="">Receitas e despesas</option><option value="receita" ${F.tipo === 'receita' ? 'selected' : ''}>Só receitas</option><option value="despesa" ${F.tipo === 'despesa' ? 'selected' : ''}>Só despesas</option></select>
    <select id="st"><option value="">Pagos e pendentes</option><option value="pago" ${F.st === 'pago' ? 'selected' : ''}>Pagos</option><option value="pend" ${F.st === 'pend' ? 'selected' : ''}>Pendentes</option></select>
    <span class="grow"></span><button class="btn" id="csv">${icon('down')}Exportar</button></div>` : ''}
  ${l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="n">Valor</th><th>Status</th><th></th></tr></thead><tbody>
  ${l.map(x => `<tr data-id="${x.id}" class="clicavel"><td>${fmtData(dataRef(x))}${!x.pago ? `<small class="bl mudo">vence ${fmtData(x.vencimento)}</small>` : ''}</td><td><b>${esc(x.descricao)}</b>${x.forma ? `<small class="bl mudo">${esc(x.forma)}</small>` : ''}</td><td>${esc(x.categoria || '')}</td>
    <td class="n"><b class="${x.tipo === 'receita' ? 't-ok' : 't-perigo'}">${x.tipo === 'receita' ? '+' : '−'} ${brl(x.valor)}</b></td>
    <td>${x.pago ? badge('Pago', 'ok') : x.vencimento < hoje() ? badge('Vencido', 'perigo') : badge('Pendente', 'aviso')}</td>
    <td class="acoes">${ed && !x.pago ? `<button class="btn sm" data-pg="${x.id}">${x.tipo === 'receita' ? 'Recebido' : 'Pagar'}</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>` : vazio(soPagar ? 'Nenhuma conta a pagar. 🎉' : 'Nenhum lançamento neste mês.')}`;
  const t = $('#tipo', a); if (t) t.onchange = e => { F.tipo = e.target.value; re(); };
  const s = $('#st', a); if (s) s.onchange = e => { F.st = e.target.value; re(); };
  const c = $('#csv', a); if (c) c.onclick = () => baixar(`financeiro-${F.mes}.csv`, toCSV(l, [{ label: 'data', val: dataRef }, { label: 'tipo', key: 'tipo' }, { label: 'descricao', key: 'descricao' }, { label: 'categoria', key: 'categoria' }, { label: 'valor', val: x => nfmt(x.valor, 2) }, { label: 'pago', val: x => x.pago ? 'sim' : 'não' }, { label: 'vencimento', key: 'vencimento' }]));
  $$('[data-pg]', a).forEach(b => b.onclick = async e => {
    e.stopPropagation(); const x = S.d.lancamentos.find(y => y.id === b.dataset.pg);
    if (await commit([{ op: 'upd', col: 'lancamentos', id: x.id, data: { pago: true, dataPagamento: hoje() } }], `Baixou lançamento "${x.descricao}"`)) toast('Lançamento baixado.');
  });
  $$('tr[data-id]', a).forEach(tr => tr.onclick = () => ed && formLanc(S.d.lancamentos.find(y => y.id === tr.dataset.id)));
}

function formLanc(x) {
  const novo = !x.id; x = { vencimento: hoje(), pago: x.tipo === 'despesa' ? false : true, ...x };
  const cats = x.tipo === 'despesa' ? CATS_D : CATS_R;
  const m = modal({
    titulo: (novo ? 'Nova ' : 'Editar ') + (x.tipo === 'despesa' ? 'despesa' : 'receita'),
    corpo: `<form class="form grid2" id="fl">
      <label class="span2">Descrição *<input name="descricao" required value="${esc(x.descricao || '')}"></label>
      <label>Categoria<input name="categoria" list="dl-cat-f" value="${esc(x.categoria || '')}"></label>
      <label>Valor (R$) *<input name="valor" inputmode="decimal" required value="${x.valor ? nfmt(x.valor, 2) : ''}"></label>
      <label>Vencimento<input type="date" name="vencimento" value="${x.vencimento}"></label>
      <label>Forma<select name="forma"><option value="">—</option>${FORMAS.map(f => `<option ${x.forma === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" name="pago" ${x.pago ? 'checked' : ''}> ${x.tipo === 'despesa' ? 'Já paguei' : 'Já recebi'}</label>
      <label id="ldp">Data do pagamento<input type="date" name="dataPagamento" value="${x.dataPagamento || hoje()}"></label>
      ${novo ? `<label>Repetir por<select name="rep">${[1, 2, 3, 4, 5, 6, 12].map(n => `<option value="${n}">${n === 1 ? 'Não repetir' : n + ' meses'}</option>`).join('')}</select></label>` : ''}
      ${x.origem && x.origem !== 'manual' ? `<p class="span2 mudo pq">Lançamento gerado automaticamente (${esc(x.origem)}).</p>` : ''}
      ${datalist('dl-cat-f', [...cats, ...S.d.lancamentos.filter(l => l.tipo === x.tipo).map(l => l.categoria)])}
    </form>`,
    rodape: `${!novo ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fl');
  const vis = () => m.$('#ldp').hidden = !f.pago.checked; f.pago.onchange = vis; vis();
  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    const base = { tipo: x.tipo, descricao: f.descricao.value.trim(), categoria: f.categoria.value.trim(), valor: parseNum(f.valor.value), forma: f.forma.value, origem: x.origem || 'manual', refId: x.refId || '', criadoEm: x.criadoEm || Date.now() };
    const ops = [];
    const n = novo ? +f.rep.value : 1;
    for (let k = 0; k < n; k++) {
      const pago = k === 0 && f.pago.checked;
      ops.push({ op: 'set', col: 'lancamentos', id: k === 0 && !novo ? x.id : uid(), data: { ...base, descricao: base.descricao + (n > 1 ? ` (${k + 1}/${n})` : ''), vencimento: addMeses(f.vencimento.value || hoje(), k), pago, dataPagamento: pago ? f.dataPagamento.value : '' } });
    }
    if (await commit(ops, `${novo ? 'Lançou' : 'Editou'} ${x.tipo} "${base.descricao}" ${brl(base.valor)}`)) { toast('Lançamento salvo.'); m.fechar(); }
  };
  const d = m.$('#del');
  if (d) d.onclick = async () => {
    if (!await ask('Excluir este lançamento?' + (x.origem === 'venda' || x.origem === 'recebimento' ? ' Atenção: ele foi gerado por uma venda/recebimento; o status da parcela não será alterado.' : ''), { ok: 'Excluir', perigo: true })) return;
    if (await commit([{ op: 'del', col: 'lancamentos', id: x.id }], `Excluiu lançamento "${x.descricao}"`)) { toast('Excluído.'); m.fechar(); }
  };
}

function abaFluxo(a) {
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(F.mes + '-15', i - 5).slice(0, 7));
  const dados = meses.map(m => {
    const l = S.d.lancamentos.filter(x => x.pago && (dataRef(x) || '').startsWith(m));
    return { m, ent: r2(l.filter(x => x.tipo === 'receita').reduce((s, x) => s + x.valor, 0)), sai: r2(l.filter(x => x.tipo === 'despesa').reduce((s, x) => s + x.valor, 0)) };
  });
  const prox = Array.from({ length: 3 }, (_, i) => addMeses(mesAtual() + '-15', i).slice(0, 7)).map(m => ({
    m, rec: r2(S.d.recebiveis.filter(r => !r.cancelado && saldoRec(r) > 0 && r.vencimento.startsWith(m)).reduce((s, r) => s + saldoRec(r), 0)),
    pag: r2(S.d.lancamentos.filter(l => l.tipo === 'despesa' && !l.pago && l.vencimento.startsWith(m)).reduce((s, l) => s + l.valor, 0))
  }));
  const cats = {}; S.d.lancamentos.filter(x => x.tipo === 'despesa' && x.pago && (dataRef(x) || '').startsWith(F.mes)).forEach(x => cats[x.categoria || 'Sem categoria'] = (cats[x.categoria || 'Sem categoria'] || 0) + x.valor);
  a.innerHTML = `<div class="grid-2c">
    <div class="card"><h4>Entradas × saídas (6 meses)</h4><div class="graf"><canvas id="g"></canvas></div>
      <table class="tabela mini">${dados.map(d => `<tr><td>${d.m.split('-').reverse().join('/')}</td><td class="n t-ok">${brl(d.ent)}</td><td class="n t-perigo">${brl(d.sai)}</td><td class="n"><b>${brl(d.ent - d.sai)}</b></td></tr>`).join('')}</table></div>
    <div class="card"><h4>Previsão (próximos 3 meses)</h4><table class="tabela mini"><thead><tr><th>Mês</th><th class="n">A receber</th><th class="n">A pagar</th><th class="n">Saldo previsto</th></tr></thead>
      <tbody>${prox.map(p => `<tr><td>${nomeMes(p.m)}</td><td class="n t-ok">${brl(p.rec)}</td><td class="n t-perigo">${brl(p.pag)}</td><td class="n"><b>${brl(p.rec - p.pag)}</b></td></tr>`).join('')}</tbody></table>
      <h4 style="margin-top:18px">Despesas por categoria (${nomeMes(F.mes)})</h4>
      ${Object.keys(cats).length ? `<table class="tabela mini">${Object.entries(cats).sort((x, y) => y[1] - x[1]).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="n">${brl(v)}</td></tr>`).join('')}</table>` : '<p class="mudo">Sem despesas pagas.</p>'}
    </div></div>`;
  if (!window.Chart) $('#g', a).parentElement.innerHTML = '<p class="mudo pq" style="padding:20px 0">Gráfico indisponível agora (sem conexão com a biblioteca de gráficos).</p>';
  else {
    grafico && grafico.destroy();
    const cs = getComputedStyle(document.documentElement);
    grafico = new Chart($('#g', a), {
      type: 'bar', data: { labels: dados.map(d => d.m.split('-').reverse().join('/')), datasets: [{ label: 'Entradas', data: dados.map(d => d.ent), backgroundColor: cs.getPropertyValue('--ok').trim() || '#2e7d32' }, { label: 'Saídas', data: dados.map(d => d.sai), backgroundColor: cs.getPropertyValue('--perigo').trim() || '#c62828' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: cs.getPropertyValue('--txt2').trim() } } }, scales: { x: { ticks: { color: cs.getPropertyValue('--txt2').trim() }, grid: { display: false } }, y: { ticks: { color: cs.getPropertyValue('--txt2').trim() } } } }
    });
  }
}

function abaComissoes(a, ed) {
  const vs = S.d.vendas.filter(v => !v.cancelada && (v.data || '').startsWith(F.mes));
  const g = {};
  vs.forEach(v => { const k = v.vendedorUid || '_'; const x = g[k] = g[k] || { nome: v.vendedorNome || '—', n: 0, tot: 0, com: 0 }; x.n++; x.tot += v.total; x.com += v.comissaoValor || 0; });
  const pagos = S.d.lancamentos.filter(l => l.categoria === 'Comissões' && l.refId && l.refId.startsWith('com:' + F.mes));
  a.innerHTML = Object.keys(g).length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Vendedor(a)</th><th class="n">Vendas</th><th class="n">Total vendido</th><th class="n">Meta</th><th class="n">Comissão</th><th></th></tr></thead><tbody>
    ${Object.entries(g).map(([uidV, x]) => { const mb = S.d.membros.find(mm => mm.id === uidV) || {}; const pg = pagos.find(p => p.refId === `com:${F.mes}:${uidV}`); return `<tr><td><b>${esc(x.nome)}</b></td><td class="n">${x.n}</td><td class="n">${brl(x.tot)}</td>
    <td class="n">${mb.meta ? `${nfmt(x.tot / mb.meta * 100)}% de ${brl(mb.meta)}` : '—'}</td><td class="n"><b>${brl(x.com)}</b></td>
    <td class="acoes">${x.com > 0 ? (pg ? badge(pg.pago ? 'Paga' : 'Lançada', pg.pago ? 'ok' : 'aviso') : ed ? `<button class="btn sm" data-com="${uidV}">Lançar pagamento</button>` : '') : ''}</td></tr>`; }).join('')}
  </tbody></table></div><p class="mudo pq">A comissão é calculada sobre o valor da venda sem o frete, com o percentual definido em cada venda.</p>` : vazio('Nenhuma venda neste mês.');
  $$('[data-com]', a).forEach(b => b.onclick = async () => {
    const x = g[b.dataset.com];
    if (await commit([{ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: `Comissão ${x.nome} — ${nomeMes(F.mes)}`, categoria: 'Comissões', valor: r2(x.com), vencimento: hoje(), pago: false, origem: 'comissao', refId: `com:${F.mes}:${b.dataset.com}`, criadoEm: Date.now() } }], `Lançou comissão de ${x.nome}`)) toast('Comissão lançada em contas a pagar.');
  });
}
