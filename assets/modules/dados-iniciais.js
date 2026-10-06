// Carga automática dos dados trazidos do Revendi (pasta dados-iniciais/ do repositório).
// Roda sozinha no primeiro acesso da administradora, quando a conta ainda está vazia.
import { S, isAdmin, commit, toast } from '../core.js';
import { parseCSV, parseNum, uid, r2 } from '../utils.js';
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
const CORRECOES = [
  {
    id: 'jose-raimundo-15-09-2026', // venda com os itens e o crediário em 3x, como no Revendi
    run: () => {
      const v = S.d.vendas.find(x => x.importado && x.data === '2026-09-15' && /jos[eé] raimundo/i.test(x.clienteNome || '') && Math.abs(x.total - 238.9) < 0.01);
      if (!v) return null;
      const custo = Number(v.custoTotal) || 0, c1 = r2(custo * 58.9 / 238.9);
      const ops = [{ op: 'upd', col: 'vendas', id: v.id, data: {
        itens: [
          { prodId: '', nome: 'Refil creme desodorante nutritivo para o corpo cereja negra e praliné', marca: 'Natura', categoria: 'Corpo e banho', qtd: 1, preco: 58.9, custo: c1, baixas: [] },
          { prodId: '', nome: 'Desodorante colônia Kaiak Oceano masculino - 100 ml', marca: 'Natura', categoria: 'Perfumaria', qtd: 1, preco: 180, custo: r2(custo - c1), baixas: [] }
        ], forma: 'Crediário', parcelas: 3 } }];
      S.d.recebiveis.filter(r => r.vendaId === v.id).forEach(r => ops.push({ op: 'del', col: 'recebiveis', id: r.id }));
      const base = { vendaId: v.id, numeroVenda: v.numero, clienteId: v.clienteId, clienteNome: v.clienteNome, clienteFone: v.clienteFone || '', criadoEm: Date.now() };
      [[79.64, '2026-10-15'], [79.63, '2026-11-14'], [79.63, '2026-12-14']].forEach(([valor, venc], i) =>
        ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: i + 1, totalParcelas: 3, valor, pago: 0, vencimento: venc, forma: 'Crediário', pagamentos: [] } }));
      return ops;
    }
  }
];
export async function correcoes() {
  if (!isAdmin() || !S.conta) return;
  const feitas = S.conta.correcoes || [];
  for (const c of CORRECOES) {
    if (feitas.includes(c.id)) continue;
    const ops = c.run();
    if (!ops) continue; // dados ainda não estão aqui
    ops.push({ op: 'upd', col: '@conta', data: { correcoes: [...feitas, c.id] } });
    if (await commit(ops)) feitas.push(c.id);
  }
}
