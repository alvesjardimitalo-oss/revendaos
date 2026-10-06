// Compras / entradas de mercadoria (pedidos à fornecedora) com contas a pagar
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtData, hoje, addMeses, parseCSV, lerArquivo } from '../utils.js';
import { S, pode, icon, modal, ask, toast, commit, prodPorId, buscaProduto, vazio, badge, datalist, proxNumero, qtdProduto, ehKit, selecionarVarios } from '../core.js';
import { opsItemLoja } from './loja-sync.js';
import { formProduto } from './produtos.js';

let F = { q: '' };
const lancs = id => S.d.lancamentos.filter(l => l.origem === 'compra' && l.refId === id);

export function render(el) {
  const ed = pode('compras', 'editar');
  let l = [...S.d.compras];
  if (F.q) { const n = norm(F.q); l = l.filter(c => norm(c.fornecedor).includes(n) || norm(c.ref).includes(n) || (c.itens || []).some(i => norm(i.nome).includes(n))); }
  l.sort((a, b) => b.data > a.data ? 1 : -1);
  const mes = hoje().slice(0, 7);
  const totMes = S.d.compras.filter(c => (c.data || '').startsWith(mes)).reduce((s, c) => s + c.total, 0);
  const aPagar = S.d.lancamentos.filter(x => x.origem === 'compra' && !x.pago).reduce((s, x) => s + x.valor, 0);

  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Compras no mês</span><b>${brl(totMes)}</b></div>
    <div class="kpi"><span>Compras a pagar</span><b>${brl(aPagar)}</b><small>boletos / parcelas</small></div>
    <div class="kpi"><span>Pedidos registrados</span><b>${S.d.compras.length}</b></div>
  </div>
  <div class="barra">
    ${ed ? `<button class="btn pri" id="nova">${icon('plus')}Registrar compra</button><button class="btn" id="imph">${icon('up')}Importar histórico</button>` : ''}
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Fornecedor, ciclo ou produto" value="${esc(F.q)}"></div>
  </div>
  ${l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Nº</th><th>Data</th><th>Fornecedor / marca</th><th>Itens</th><th class="n">Total</th><th>Pagamento</th></tr></thead><tbody>
    ${l.map(c => { const ls = lancs(c.id), pago = ls.length && ls.every(x => x.pago); return `<tr data-id="${c.id}" class="clicavel"><td>#${c.numero}</td><td>${fmtData(c.data)}</td><td><b>${esc(c.fornecedor || '—')}</b>${c.ref ? `<small class="bl mudo">${esc(c.ref)}</small>` : ''}</td>
      <td>${(c.itens || []).reduce((s, i) => s + i.qtd, 0)} un.</td><td class="n">${brl(c.total)}</td><td>${!ls.length ? '—' : pago ? badge('Pago', 'ok') : ls.some(x => !x.pago && x.estimado) ? badge('Conferir parcelas', 'perigo') : badge(ls.filter(x => !x.pago).length + ' a pagar', 'aviso')}</td></tr>`; }).join('')}
  </tbody></table></div>` : vazio('Registre os pedidos que você faz às marcas: o estoque é atualizado com custo e validade, e as parcelas vão para o contas a pagar.')}`;
  $('#q', el).oninput = e => { F.q = e.target.value; render(el); const i = $('#q', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  if (ed) { $('#nova', el).onclick = () => novaCompra(); $('#imph', el).onclick = importarHistorico; }
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => verCompra(tr.dataset.id));
}

function novaCompra() {
  const itens = [];
  const m = modal({
    titulo: 'Registrar compra / entrada de mercadoria', largo: true,
    corpo: `<form class="form" id="fc"><div class="grid3">
      <label>Fornecedor / marca<input name="forn" list="dl-forn" required></label>
      <label>Data<input type="date" name="data" value="${hoje()}"></label>
      <label>Ciclo / nº do pedido<input name="ref" placeholder="Ex.: Ciclo 14"></label></div>
      ${datalist('dl-forn', [...S.d.compras.map(c => c.fornecedor), ...S.d.produtos.map(p => p.marca)])}
    </form>
    <div class="barra"><div id="busca" class="grow"></div><button class="btn" id="varios">${icon('layers')}Vários</button><button class="btn" id="np">${icon('plus')}Produto novo</button></div>
    <div class="tabela-w"><table class="tabela mini"><thead><tr><th>Produto</th><th class="n">Qtd.</th><th class="n">Custo un.</th><th>Validade</th><th class="n">Novo preço venda</th><th class="n">Subtotal</th><th></th></tr></thead><tbody id="itens"></tbody></table></div>
    <form class="form" id="fp"><div class="grid3">
      <label>Frete / taxas (R$)<input name="frete" inputmode="decimal" placeholder="0,00"></label>
      <label>Descontos / créditos (R$)<input name="desc" inputmode="decimal" placeholder="0,00"></label>
      <label>Total<input name="total" readonly class="forte"></label>
      <label>Parcelas<select name="n">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label>
      <label>1º vencimento<input type="date" name="venc" value="${hoje()}"></label>
      <label class="chk" style="align-self:end"><input type="checkbox" name="pago"> Já está pago</label>
    </div></form>`,
    rodape: `<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Lançar compra</button>`
  });
  const f = m.$('#fc'), fp = m.$('#fp');
  const add = (p, qtd = 1) => { if (!p) return; if (ehKit(p)) return toast('Kits não são comprados: compre os componentes.', 'aviso'); const ex = itens.find(i => i.prodId === p.id); if (ex) ex.qtd += qtd; else itens.push({ prodId: p.id, nome: p.nome, qtd, custo: p.custo || 0, validade: '', preco: '' }); desenhar(); };
  m.$('#varios').onclick = () => selecionarVarios(l => l.forEach(x => add(x.p, x.qtd)), { titulo: 'Adicionar vários produtos à compra' });
  buscaProduto(m.$('#busca'), p => add(p));
  m.$('#np').onclick = () => formProduto(null, p => add(p));
  const tot = () => r2(itens.reduce((s, i) => s + i.qtd * i.custo, 0) + parseNum(fp.frete.value) - parseNum(fp.desc.value));
  const desenhar = () => {
    m.$('#itens').innerHTML = itens.length ? itens.map((i, k) => `<tr data-k="${k}"><td>${esc(i.nome)}<small class="bl mudo">atual: ${qtdProduto(prodPorId(i.prodId) || {})} un. · venda ${brl((prodPorId(i.prodId) || {}).preco)}</small></td>
      <td class="n"><input class="n w70" name="qtd" inputmode="decimal" value="${i.qtd}"></td><td class="n"><input class="n w90" name="custo" inputmode="decimal" value="${nfmt(i.custo, 2)}"></td>
      <td><input type="date" name="validade" value="${i.validade}"></td><td class="n"><input class="n w90" name="preco" inputmode="decimal" value="${i.preco}" placeholder="manter"></td>
      <td class="n" data-sub>${brl(i.qtd * i.custo)}</td><td><button type="button" class="btn-ic" data-x>${icon('trash')}</button></td></tr>`).join('')
      : `<tr><td colspan="7" class="mudo ta-c" style="padding:20px">Busque os produtos recebidos (ou leia o código de barras).</td></tr>`;
    fp.total.value = brl(tot());
  };
  m.$('#itens').addEventListener('input', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return; const i = itens[+tr.dataset.k];
    const n = e.target.name; i[n] = n === 'validade' || n === 'preco' ? e.target.value : parseNum(e.target.value);
    $('[data-sub]', tr).textContent = brl(i.qtd * i.custo); fp.total.value = brl(tot());
  });
  m.$('#itens').addEventListener('click', e => { if (e.target.closest('[data-x]')) { itens.splice(+e.target.closest('tr').dataset.k, 1); desenhar(); } });
  fp.addEventListener('input', () => fp.total.value = brl(tot()));
  desenhar();

  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    const its = itens.filter(i => i.qtd > 0); if (!its.length) return toast('Adicione os produtos da compra.', 'aviso');
    const id = uid(), numero = proxNumero('compras'), ops = [], total = tot();
    const lotesPorProd = {};
    const itensSalvos = its.map(i => {
      const p = prodPorId(i.prodId); const loteId = uid();
      const lotes = [...(lotesPorProd[i.prodId] || p.lotes || []), { id: loteId, qtd: i.qtd, validade: i.validade, custo: i.custo }];
      lotesPorProd[i.prodId] = lotes;
      const upd = { lotes, custo: i.custo, atualizadoEm: Date.now() }; if (parseNum(i.preco) > 0) upd.preco = parseNum(i.preco);
      ops.push({ op: 'upd', col: 'produtos', id: i.prodId, data: upd });
      ops.push(...opsItemLoja({ ...p, ...upd }));
      return { prodId: i.prodId, nome: i.nome, qtd: i.qtd, custo: i.custo, validade: i.validade, loteId };
    });
    // apenas o último 'upd' de cada produto vale (lotes acumulados)
    const n = +fp.n.value, base = Math.floor(total / n * 100) / 100;
    for (let k = 0; k < n && total > 0; k++) {
      const v = k === n - 1 ? r2(total - base * (n - 1)) : base;
      ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: `Compra #${numero} — ${f.forn.value}${n > 1 ? ` (${k + 1}/${n})` : ''}`, categoria: 'Compra de mercadoria', valor: v, vencimento: addMeses(fp.venc.value || hoje(), k), pago: fp.pago.checked, dataPagamento: fp.pago.checked ? hoje() : '', origem: 'compra', refId: id, criadoEm: Date.now() } });
    }
    ops.push({ op: 'set', col: 'compras', id, data: { numero, data: f.data.value, fornecedor: f.forn.value.trim(), ref: f.ref.value.trim(), itens: itensSalvos, frete: parseNum(fp.frete.value), desconto: parseNum(fp.desc.value), total, parcelas: n, criadoEm: Date.now() } });
    if (await commit(ops, `Registrou compra #${numero} (${f.forn.value}) de ${brl(total)}`)) { toast('Compra lançada e estoque atualizado.'); m.fechar(); }
  };
}

function verCompra(id) {
  const c = S.d.compras.find(x => x.id === id); if (!c) return;
  const ls = lancs(id);
  const m = modal({
    titulo: `Compra #${c.numero} — ${c.fornecedor}`, largo: true,
    corpo: `<p>${fmtData(c.data)}${c.ref ? ' · ' + esc(c.ref) : ''}</p>
    <table class="tabela mini"><thead><tr><th>Produto</th><th class="n">Qtd.</th><th class="n">Custo</th><th>Validade</th><th class="n">Subtotal</th></tr></thead>
    <tbody>${c.itens.map(i => `<tr><td>${esc(i.nome)}</td><td class="n">${nfmt(i.qtd)}</td><td class="n">${brl(i.custo)}</td><td>${fmtData(i.validade)}</td><td class="n">${brl(i.qtd * i.custo)}</td></tr>`).join('')}</tbody>
    <tfoot>${c.frete ? `<tr><td colspan="4">Frete / taxas</td><td class="n">${brl(c.frete)}</td></tr>` : ''}${c.desconto ? `<tr><td colspan="4">Descontos</td><td class="n">− ${brl(c.desconto)}</td></tr>` : ''}<tr class="forte"><td colspan="4">Total</td><td class="n">${brl(c.total)}</td></tr></tfoot></table>
    <div class="sub-h"><h4>Pagamento</h4></div>
    <table class="tabela mini"><tbody>${ls.sort((a, b) => a.vencimento > b.vencimento ? 1 : -1).map(x => `<tr><td>${esc(x.descricao)}</td><td>${fmtData(x.vencimento)}</td><td class="n">${brl(x.valor)}</td><td>${x.pago ? badge('Pago', 'ok') : x.estimado ? badge('Estimada · conferir', 'perigo') : badge('A pagar', 'aviso')}</td></tr>`).join('')}</tbody></table>
    ${ls.some(x => !x.pago && x.estimado) ? '<p class="mudo pq">Parcelas estimadas na importação (o sistema antigo não mostrava os vencimentos). Ajuste os valores e as datas em Financeiro → Contas a pagar, ou marque como pagas.</p>' : ''}
    ${c.importado ? '<p class="mudo pq">Compra importada do sistema antigo: não alterou o estoque.</p>' : ''}`,
    rodape: pode('compras', 'editar') ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir compra</button><span class="grow"></span><button class="btn" data-fechar>Fechar</button>` : ''
  });
  const d = m.$('#del');
  if (d) d.onclick = async () => {
    if (!await ask('Excluir esta compra? As quantidades ainda não vendidas desses lotes saem do estoque e os lançamentos financeiros são removidos.', { ok: 'Excluir', perigo: true })) return;
    const ops = []; const porProd = {};
    c.itens.forEach(i => (porProd[i.prodId] = porProd[i.prodId] || []).push(i));
    Object.entries(porProd).forEach(([pid, its]) => {
      const p = prodPorId(pid); if (!p) return;
      const lotes = (p.lotes || []).filter(l => !its.some(i => i.loteId === l.id));
      ops.push({ op: 'upd', col: 'produtos', id: pid, data: { lotes } }, ...opsItemLoja({ ...p, lotes }));
    });
    ls.forEach(x => ops.push({ op: 'del', col: 'lancamentos', id: x.id }));
    ops.push({ op: 'del', col: 'compras', id });
    if (await commit(ops, `Excluiu compra #${c.numero}`)) { toast('Compra excluída.'); m.fechar(); }
  };
}

// ---------------- importar histórico (CSV: pedido;data;marcas;total;frete;forma;parcela;valor;vencimento;situacao;itens) ----------------
const iso = d => { const m = String(d || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : d; };
async function importarHistorico() {
  const txt = await lerArquivo('.csv,text/csv'); if (!txt) return;
  const rows = parseCSV(txt).filter(r => r.pedido && r.data);
  if (!rows.length) return toast('Nenhuma linha válida. Colunas: pedido; data; marcas; total; frete; forma; parcela; valor; vencimento; situacao; itens', 'erro');
  const ja = new Set(S.d.compras.map(c => c.importKey).filter(Boolean));
  const ped = new Map(); rows.forEach(r => { if (!ped.has(r.pedido)) ped.set(r.pedido, []); ped.get(r.pedido).push(r); });
  const novos = [...ped.entries()].filter(([k]) => !ja.has('ped:' + k));
  const sit = r => { const n = norm(r.situacao); return n.startsWith('pag') ? 'pago' : n.startsWith('conf') || n.includes('estim') ? 'conferir' : 'apagar'; };
  const somar = t => r2(novos.flatMap(([, l]) => l).filter(r => sit(r) === t).reduce((s, r) => s + parseNum(r.valor), 0));
  const m = modal({
    titulo: 'Importar histórico de compras',
    corpo: `<p><b>${novos.length}</b> pedido(s) para importar${ped.size - novos.length ? ` (${ped.size - novos.length} já importados)` : ''}.</p>
      <ul><li>Parcelas já pagas: <b>${brl(somar('pago'))}</b></li><li>Parcelas a pagar (com vencimento conhecido): <b>${brl(somar('apagar'))}</b></li><li>Parcelas estimadas para conferir: <b>${brl(somar('conferir'))}</b></li></ul>
      <p class="mudo pq">As compras entram só no histórico e no contas a pagar — o estoque não é alterado.</p>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok" ${novos.length ? '' : 'disabled'}>${icon('check')}Importar</button>`
  });
  m.$('#ok').onclick = async () => {
    const ops = []; let numero = proxNumero('compras');
    novos.sort((a, b) => iso(a[1][0].data).localeCompare(iso(b[1][0].data)));
    for (const [pedido, l] of novos) {
      const r0 = l[0], id = uid(), num = numero++, forn = r0.marcas || 'Fornecedor';
      const itens = (l.find(r => r.itens) || {}).itens ? l.find(r => r.itens).itens.split('|').map(x => { const [nome, q, c] = x.split('='); return { prodId: '', nome: nome.trim(), qtd: parseNum(q) || 1, custo: parseNum(c), validade: '' }; })
        : [{ prodId: '', nome: 'Itens do pedido (importado)', qtd: 1, custo: r2(parseNum(r0.total) - parseNum(r0.frete)), validade: '' }];
      l.forEach(r => {
        const st = sit(r), venc = iso(r.vencimento || r.data);
        ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: `Compra #${num} — ${forn} · pedido ${pedido}${l.length > 1 ? ` (${r.parcela})` : ''}${st === 'conferir' ? ' · estimada' : ''}`, categoria: 'Compra de mercadoria', valor: parseNum(r.valor), vencimento: venc, pago: st === 'pago', dataPagamento: st === 'pago' ? iso(r.pagoem || venc) : '', forma: r.forma || '', origem: 'compra', refId: id, ...(st === 'conferir' ? { estimado: true } : {}), criadoEm: Date.now() } });
      });
      ops.push({ op: 'set', col: 'compras', id, data: { numero: num, data: iso(r0.data), fornecedor: forn, ref: 'Pedido ' + pedido, itens, frete: parseNum(r0.frete), desconto: 0, total: parseNum(r0.total), parcelas: l.length, importado: true, importKey: 'ped:' + pedido, criadoEm: Date.now() } });
    }
    if (await commit(ops, `Importou ${novos.length} compras do histórico`)) { toast(`${novos.length} compra(s) importada(s).`); m.fechar(); }
  };
}
