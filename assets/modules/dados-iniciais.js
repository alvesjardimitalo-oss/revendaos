// Carga automática dos dados trazidos do Revendi (pasta dados-iniciais/ do repositório).
// Roda sozinha no primeiro acesso da administradora, quando a conta ainda está vazia.
import { S, isAdmin, commit, toast } from '../core.js';
import { parseCSV, parseNum, uid, r2, norm, addDias } from '../utils.js';
import { mesesEntre } from './consorcios.js';
import { opsItemLoja } from './loja-sync.js';

const ARQ = {
  clientes: 'dados-iniciais/clientes-revendaos.csv',
  vendas: 'dados-iniciais/vendas-revendi.csv',
  compras: 'dados-iniciais/compras-revendi.csv',
  estoque: 'dados-iniciais/estoque-revendi.csv',
  catalogo: ['dados-iniciais/catalogo-boticario.csv', 'dados-iniciais/catalogo-eudora.csv', 'dados-iniciais/catalogo-oui.csv']
};
const ler = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('arquivo ' + u + ' não encontrado'); return r.text(); };
const esperar = async (cond, ms = 8000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await new Promise(r => setTimeout(r, 200)); };

const faltaBase = () => !(S.conta && S.conta.dadosIniciais) && !S.d.clientes.length && !S.d.vendas.length && !S.d.compras.length;
const faltaEstoque = () => !(S.conta && S.conta.estoqueInicial) && !S.d.produtos.length;
export function precisaCarga() { return isAdmin() && (faltaBase() || faltaEstoque()); }

// estoque: produtos com quantidade, preço, custo (quando conhecido) e foto; descontos viram promoções
async function importarEstoque(txt) {
  const rows = parseCSV(txt).filter(r => r.nome);
  const ops = [], promo = {};
  for (const r of rows) {
    const id = uid(), preco = parseNum(r.preco), pp = parseNum(r.preco_promocional), custo = parseNum(r.custo), qtd = parseNum(r.quantidade) || 0;
    ops.push({ op: 'set', col: 'produtos', id, data: { nome: r.nome, marca: r.marca || '', categoria: r.categoria || '', sku: r.codigo_revista || '', codigo: '', preco, precoLoja: 0, custo, estoqueMin: null, descricao: '', naLoja: preco > 0, ativo: true, foto: r.foto || '', fotos: [], kit: [], lotes: qtd ? [{ id: uid(), qtd, validade: '', custo }] : [], criadoEm: Date.now(), atualizadoEm: Date.now() } });
    ops.push(...opsItemLoja({ id, ...ops[ops.length - 1].data }));
    if (pp && preco && pp < preco) { const pct = Math.round((1 - pp / preco) * 100); (promo[pct] = promo[pct] || []).push(id); }
  }
  Object.entries(promo).forEach(([pct, ids]) => ops.push({ op: 'set', col: 'promocoes', id: uid(), data: { nome: `Promoção ${pct}% (trazida do Revendi)`, alvo: 'produtos', canal: 'todos', categoria: '', marca: '', tipo: 'percentual', valor: +pct, inicio: '', fim: '', ativa: true, ids, criadoEm: Date.now() } }));
  return (await commit(ops, `Cadastrou ${rows.length} produtos do estoque do Revendi`)) ? rows.length : 0;
}

export async function carregarTudo() {
  const box = document.createElement('div');
  box.className = 'modal-bg';
  box.innerHTML = `<div class="modal" style="max-width:460px"><div class="modal-h"><h3>Trazendo seus dados do Revendi…</h3></div><div class="modal-b"><ul class="lista" id="passos"></ul><p class="mudo pq">Não feche esta página. Leva menos de um minuto.</p></div></div>`;
  document.body.appendChild(box);
  const ul = box.querySelector('#passos');
  const passo = t => { const li = document.createElement('li'); li.innerHTML = `<span>${t}</span><b>…</b>`; ul.appendChild(li); return v => li.querySelector('b').textContent = v; };
  const resumo = {};
  const base = faltaBase(), est = faltaEstoque();
  try {
    let fim;
    if (est) {
      fim = passo('Estoque');
      resumo.estoque = await importarEstoque(await ler(ARQ.estoque));
      await commit([{ op: 'upd', col: '@conta', data: { estoqueInicial: Date.now() } }]);
      fim(resumo.estoque + ' produtos ✓');
    }
    if (base) {
    fim = passo('Clientes');
    const { importarClientesTexto } = await import('./clientes.js');
    resumo.clientes = await importarClientesTexto(await ler(ARQ.clientes), true);
    await esperar(() => S.d.clientes.length >= resumo.clientes);
    fim(resumo.clientes + ' ✓');

    fim = passo('Grupos de consórcio');
    const cons = await import('./consorcios.js');
    const lista = cons.semGrupo();
    resumo.grupos = lista.length ? await cons.importarEtiquetas(lista, true) : 0;
    await esperar(() => S.d.consorcios.length >= resumo.grupos);
    fim(resumo.grupos + ' ✓');

    fim = passo('Vendas e uso dos consórcios');
    const { importarVendasTexto } = await import('./importar-vendas.js');
    const rv = await importarVendasTexto(await ler(ARQ.vendas));
    resumo.vendas = rv ? rv.vendas + rv.resgates : 0;
    await esperar(() => S.d.vendas.length >= resumo.vendas);
    fim(resumo.vendas + ' ✓');

    fim = passo('Compras e contas a pagar');
    const { importarComprasTexto } = await import('./compras.js');
    resumo.compras = await importarComprasTexto(await ler(ARQ.compras));
    fim(resumo.compras + ' ✓');

    fim = passo('Catálogo (Boticário, Eudora, Oui)');
    const { importarCatalogoTexto } = await import('./catalogo.js');
    let tot = 0;
    for (const u of ARQ.catalogo) { const r = await importarCatalogoTexto(await ler(u)); if (r.erro) { fim(r.erro); tot = -1; break; } tot += r.tot; }
    if (tot >= 0) fim(tot + ' produtos ✓');

    await commit([{ op: 'upd', col: '@conta', data: { dadosIniciais: Date.now() } }]);
    }
    await new Promise(r => setTimeout(r, 800)); await correcoes();
    box.querySelector('h3').textContent = 'Pronto! Seus dados estão no sistema.';
    box.querySelector('.modal-b p').innerHTML = 'Confira em Consórcios os grupos e use <b>Marcar pagos até…</b> para as parcelas que estavam "pagas parcialmente".';
    const b = document.createElement('div'); b.className = "modal-f"; b.innerHTML = '<span class="grow"></span><button class="btn pri">Começar</button>';
    box.querySelector('.modal').appendChild(b); b.querySelector('button').onclick = () => { box.remove(); location.hash = '#/dashboard'; };
  } catch (e) {
    console.error(e);
    box.querySelector('h3').textContent = 'Não consegui terminar';
    box.querySelector('.modal-b p').textContent = 'Erro: ' + (e.code || e.message) + '. Recarregue a página para tentar de novo (o que já entrou não é duplicado).';
    toast('Erro ao trazer os dados: ' + (e.code || e.message), 'erro');
  }
}

// ---------------- correções pontuais nos dados trazidos (rodam uma vez por conta) ----------------
// acha a venda importada e devolve as operações para colocar os itens reais e as parcelas do crediário
function corrigirVenda({ data, nome, total, itens, parcelas, obs, marca }) {
  const v = S.d.vendas.find(x => x.importado && x.data === data && nome.test(x.clienteNome || '') && Math.abs(x.total - total) < 0.01);
  if (!v) return null;
  const custo = Number(v.custoTotal) || 0, soma = itens.reduce((a, i) => a + i[1] * (i[2] || 1), 0) || 1;
  let resto = custo;
  const its = itens.map(([n, preco, qtd = 1, mk = marca], k) => {
    const c = k === itens.length - 1 ? r2(resto) : r2(custo * preco * qtd / soma); resto -= c;
    return { prodId: '', nome: n, marca: mk || '', categoria: '', qtd, preco, custo: c, baixas: [] };
  });
  const ops = [{ op: 'upd', col: 'vendas', id: v.id, data: { itens: its, ...(parcelas ? { forma: v.consorcio ? `Crédito consórcio G${v.consorcio.grupo} + Crediário` : 'Crediário', parcelas: parcelas.length } : {}), ...(obs ? { obs } : {}) } }];
  if (parcelas) {
    const recs = S.d.recebiveis.filter(r => r.vendaId === v.id && !r.consorcio);
    if (recs.some(r => (Number(r.pago) || 0) > 0)) return ops; // já tem pagamento registrado: não mexe nas parcelas
    recs.forEach(r => ops.push({ op: 'del', col: 'recebiveis', id: r.id }));
    const base = { vendaId: v.id, numeroVenda: v.numero, clienteId: v.clienteId, clienteNome: v.clienteNome, clienteFone: v.clienteFone || '', criadoEm: Date.now() };
    parcelas.forEach(([valor, venc], k) => ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: k + 1, totalParcelas: parcelas.length, valor, pago: 0, vencimento: venc, forma: 'Crediário', pagamentos: [] } }));
  }
  return ops;
}
// ---------- extrato do Revendi (todas as parcelas recebidas, pagas e pendentes) ----------
async function aplicarExtrato() {
  if (!S.d.vendas.some(v => v.importado) || !S.d.consorcios.length) return null;
  let ex; try { ex = await (await fetch('dados-iniciais/extrato-revendi.json', { cache: 'no-store' })).json(); } catch { return null; }
  const N = s => norm(s).replace(/\s+/g, ' ').trim();
  const dif = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const ops = [];
  const lanc = d => { const id = uid(); ops.push({ op: 'set', col: 'lancamentos', id, data: { ...d, origemExtrato: true, criadoEm: Date.now() } }); return id; };
  const curto = m => { const [y, mm] = m.split('-'); return ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][+mm - 1] + '/' + y.slice(2); };
  const R = ex.linhas.filter(o => o.t === 'R' && o.x > 0).sort((a, b) => a.v.localeCompare(b.v));
  const quit = new Set(ex.quitados.map(([g, c]) => g + '|' + N(c)));

  // 1) consórcios: cada parcela mensal vira pagamento (ou fica em aberto)
  const gruposCli = new Map();
  S.d.consorcios.forEach(g => (g.participantes || []).forEach(p => { const k = N(p.nome); if (!gruposCli.has(k)) gruposCli.set(k, []); gruposCli.get(k).push(g); }));
  const ext = new Map(S.d.consorcios.map(g => [g.id, {}])), dias = new Map(S.d.consorcios.map(g => [g.id, {}]));
  const resto = [];
  for (const o of R) {
    let ok = false;
    for (const g of [...(gruposCli.get(N(o.c)) || [])].sort((a, b) => a.grupo - b.grupo)) {
      if (Math.abs(o.x - g.valor) > 0.01) continue;
      const ms = mesesEntre(g.inicio, g.fim), k = o.v.slice(0, 7);
      if (k < ms[0] || k > ms[ms.length - 1]) continue;
      const p = g.participantes.find(x => N(x.nome) === N(o.c)); if (!p) continue;
      const m = ext.get(g.id), reg = m[p.clienteId] = m[p.clienteId] || {};
      const livre = ms.find(x => x >= k && !reg[x]) || ms.find(x => !reg[x]); if (!livre) continue;
      reg[livre] = o.p ? { data: o.p, valor: g.valor, forma: o.f } : 'pend';
      const dd = dias.get(g.id); dd[o.v.slice(8)] = (dd[o.v.slice(8)] || 0) + 1;
      ok = true; break;
    }
    if (!ok) resto.push(o);
  }
  for (const g of S.d.consorcios) {
    const ms = mesesEntre(g.inicio, g.fim), m = ext.get(g.id), pg = structuredClone(g.pagamentos || {});
    const dia = +(Object.entries(dias.get(g.id)).sort((a, b) => b[1] - a[1])[0] || [g.diaVencimento || 10])[0] || 10;
    for (const p of g.participantes || []) {
      const cid = p.clienteId, e = m[cid] || {}, atual = pg[cid] || {}, q = quit.has(g.grupo + '|' + N(p.nome)), novo = {};
      for (const mes of ms) {
        const a = atual[mes], x = e[mes], venc = `${mes}-${String(dia).padStart(2, '0')}`;
        if (a && !a.importado) { novo[mes] = a; continue; }
        if (x && x !== 'pend') {
          const lancId = lanc({ tipo: 'receita', descricao: `Consórcio G${g.grupo} — ${p.nome} (${curto(mes)})`, categoria: 'Consórcio', valor: x.valor, vencimento: venc, pago: true, dataPagamento: x.data, forma: x.forma, origem: 'consorcio', refId: g.id });
          novo[mes] = { data: x.data, valor: x.valor, forma: x.forma, lancId, extrato: true }; continue;
        }
        if (x === 'pend') continue;
        if (q || mes < ex.inicio) novo[mes] = a || { data: venc, valor: g.valor, forma: 'Antes do sistema', importado: true };
      }
      pg[cid] = novo;
    }
    ops.push({ op: 'upd', col: 'consorcios', id: g.id, data: { pagamentos: pg, diaVencimento: dia } });
  }

  // 2) vendas: parcelas de verdade (recebidas e pendentes) no lugar do pagamento único
  const vendas = S.d.vendas.filter(v => v.importado && !v.cancelada).sort((a, b) => a.data.localeCompare(b.data));
  const porCli = new Map(); vendas.forEach(v => { const k = N(v.clienteNome); if (!porCli.has(k)) porCli.set(k, []); porCli.get(k).push(v); });
  const saldo = new Map(vendas.map(v => [v.id, r2(v.total - (v.consorcio ? v.consorcio.credito : 0))]));
  const atrib = new Map();
  for (const o of resto) {
    const vs = porCli.get(N(o.c)) || [], cabe = v => saldo.get(v.id) >= o.x - 0.02;
    const v = vs.find(v => v.data === o.v && cabe(v)) || vs.find(v => v.data <= addDias(o.v, 3) && dif(v.data, o.v) <= 120 && cabe(v)) || vs.find(v => Math.abs(saldo.get(v.id) - o.x) < 0.01 && Math.abs(dif(v.data, o.v)) <= 60);
    if (!v) continue;
    saldo.set(v.id, r2(saldo.get(v.id) - o.x));
    if (!atrib.has(v.id)) atrib.set(v.id, []); atrib.get(v.id).push(o);
  }
  for (const v of vendas) {
    const l = atrib.get(v.id); if (!l) continue;
    const recs = S.d.recebiveis.filter(r => r.vendaId === v.id && !r.consorcio);
    if (recs.some(r => (r.pagamentos || []).some(pg => pg.forma !== 'Importado'))) continue; // já tem recebimento lançado no sistema
    recs.forEach(r => ops.push({ op: 'del', col: 'recebiveis', id: r.id }));
    const falta = saldo.get(v.id);
    const parc = l.map(o => ({ valor: o.x, venc: o.v, pago: o.p, forma: o.f }));
    if (falta > 0.01) parc.push({ valor: falta, venc: addDias(parc[parc.length - 1].venc, 30), pago: '', forma: 'Crediário' });
    const base = { vendaId: v.id, numeroVenda: v.numero, clienteId: v.clienteId, clienteNome: v.clienteNome, clienteFone: v.clienteFone || '', criadoEm: Date.now() };
    parc.forEach((x, i) => {
      ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: parc.length > 1 ? i + 1 : 1, totalParcelas: parc.length, valor: x.valor, pago: x.pago ? x.valor : 0, vencimento: x.venc, forma: x.forma, pagamentos: x.pago ? [{ data: x.pago, valor: x.valor, forma: x.forma }] : [] } });
      if (x.pago) lanc({ tipo: 'receita', descricao: `Venda #${v.numero} — ${v.clienteNome}${parc.length > 1 ? ` (${i + 1}/${parc.length})` : ''}`, categoria: 'Vendas', valor: x.valor, vencimento: x.venc, pago: true, dataPagamento: x.pago, forma: x.forma, origem: 'venda', refId: v.id });
    });
    const formas = [...new Set(parc.map(x => x.forma))];
    ops.push({ op: 'upd', col: 'vendas', id: v.id, data: { parcelas: parc.length, forma: (v.consorcio ? `Crédito consórcio G${v.consorcio.grupo} + ` : '') + (parc.length > 1 ? 'Crediário' : formas[0]) } });
  }

  // 3) compras: parcelas pagas e a pagar com as datas reais
  const D = ex.linhas.filter(o => o.t === 'D');
  const porPed = new Map();
  D.forEach(o => { const m = o.d.match(/#(\w+)\s*\((\d+)\/(\d+)\)/); if (!m) return; if (!porPed.has(m[1])) porPed.set(m[1], []); porPed.get(m[1]).push({ ...o, k: +m[2], n: +m[3] }); });
  for (const c of S.d.compras) {
    const ped = (c.importKey || '').replace('ped:', ''); const l = porPed.get(ped); if (!ped || !l) continue;
    const ls = S.d.lancamentos.filter(x => x.origem === 'compra' && x.refId === c.id);
    if (ls.some(x => x.pago && !x.estimado && x.dataPagamento && !l.length)) continue;
    ls.forEach(x => ops.push({ op: 'del', col: 'lancamentos', id: x.id }));
    const n = l[0].n, tem = new Map(l.map(o => [o.k, o]));
    const somado = r2(l.reduce((a, o) => a + o.x, 0)), faltam = [];
    for (let k = 1; k <= n; k++) if (!tem.has(k)) faltam.push(k);
    const vF = faltam.length ? r2((c.total - somado) / faltam.length) : 0;
    for (let k = 1; k <= n; k++) {
      const o = tem.get(k), ref = l[0];
      const venc = o ? o.v : addDias(ref.v, 30 * (k - ref.k));
      const pago = o ? !!o.p : venc < '2026-02-01';
      lanc({ tipo: 'despesa', descricao: `Compra #${c.numero} — ${c.fornecedor} · pedido ${ped}${n > 1 ? ` (${k}/${n})` : ''}`, categoria: 'Compra de mercadoria', valor: o ? o.x : vF, vencimento: venc, pago, dataPagamento: o ? o.p : (pago ? venc : ''), forma: o ? o.f : ref.f, origem: 'compra', refId: c.id });
    }
    ops.push({ op: 'upd', col: 'compras', id: c.id, data: { parcelas: n } });
  }
  return ops;
}

const CORRECOES = [
  { id: 'jose-raimundo-15-09-2026', run: () => corrigirVenda({ data: '2026-09-15', nome: /jos[eé] raimundo/i, total: 238.9, marca: 'Natura',
      itens: [['Refil creme desodorante nutritivo para o corpo cereja negra e praliné', 58.9], ['Desodorante colônia Kaiak Oceano masculino - 100 ml', 180]],
      parcelas: [[79.64, '2026-10-15'], [79.63, '2026-11-14'], [79.63, '2026-12-14']] }) },
  { id: 'italo-15-09-2026', run: () => corrigirVenda({ data: '2026-09-15', nome: /italo alves/i, total: 459.05,
      itens: [['Club 6 Prestige Eau de Parfum 95ml', 147.92, 1, 'Eudora'], ['Humor desodorante colônia Envolve para Todos 75ml', 125, 1, 'Natura'], ['Homem desodorante parfum Evolução 100ml', 186.13, 1, 'Natura']],
      parcelas: [[153.02, '2026-10-15'], [153.02, '2026-11-14'], [153.01, '2026-12-14']] }) },
  { id: 'karen-15-09-2026', run: () => corrigirVenda({ data: '2026-09-15', nome: /karen cristina/i, total: 353.69,
      itens: [['Refil shampoo cachos e crespos', 21.2, 1, 'Natura'], ['Gelatina cachos e crespos - 240 g', 30.32, 1, 'Natura'], ['Ilía desodorante parfum Ilía Jardim Secreto feminino 50ml', 113.92, 1, 'Natura'],
        ['Kiss Matte Batom Essência de Cranberry', 10.02, 1, 'Avon'], ['Renew Protetor Solar Toque Seco Matte FPS 30 - 40 g', 37.92, 1, 'Avon'], ['Renew Gel de Limpeza 30g', 12.08, 1, 'Avon'],
        ['Body Spray Desodorante Eudora Absolu 100ml', 38.39, 1, 'Eudora'], ['Demais itens da venda (confira no Revendi)', 89.84, 4, '']].map(i => i[0].startsWith('Demais') ? [i[0], r2(89.84 / 4), 4, ''] : i),
      parcelas: [[117.9, '2026-10-15'], [117.9, '2026-11-14'], [117.89, '2026-12-14']] }) },
  { id: 'luzia-15-09-2026', run: () => corrigirVenda({ data: '2026-09-15', nome: /luzia juscelia/i, total: 509.7, marca: 'O Boticário',
      obs: 'Valor da compra 509,70 — desconto do consórcio 500,00',
      itens: [['Floratta Rose Sucrée Eau de Parfum 75ml', 310.1], ['Quasar Classic Desodorante Colônia 100ml', 189.9], ['Loção Hidratante Desodorante Corporal Nativa Spa Ameixa Negra 400ml', 9.7]],
      parcelas: [[9.7, '2026-10-15']] }) },
  { id: 'tia-leninha-17-09-2026', run: () => corrigirVenda({ data: '2026-09-17', nome: /tia leninha/i, total: 229.9, marca: 'O Boticário',
      itens: [["Floratta Fleur d'Éclipse Eau de Parfum 75ml", 229.9]] }) },
  { id: 'extrato-revendi-2026-10', run: aplicarExtrato }
];
export async function correcoes() {
  if (!isAdmin() || !S.conta) return;
  const feitas = S.conta.correcoes || [];
  for (const c of CORRECOES) {
    if (feitas.includes(c.id)) continue;
    const ops = await c.run();
    if (!ops) continue; // dados ainda não estão aqui
    ops.push({ op: 'upd', col: '@conta', data: { correcoes: [...feitas, c.id] } });
    if (await commit(ops)) { feitas.push(c.id); await new Promise(r => setTimeout(r, 1200)); }
  }
}
