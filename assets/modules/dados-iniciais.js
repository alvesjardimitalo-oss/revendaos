// Carga automática dos dados trazidos do Revendi (pasta dados-iniciais/ do repositório).
// Roda sozinha no primeiro acesso da administradora, quando a conta ainda está vazia.
import { S, isAdmin, commit, toast } from '../core.js';

const ARQ = {
  clientes: 'dados-iniciais/clientes-revendaos.csv',
  vendas: 'dados-iniciais/vendas-revendi.csv',
  compras: 'dados-iniciais/compras-revendi.csv',
  catalogo: ['dados-iniciais/catalogo-boticario.csv', 'dados-iniciais/catalogo-eudora.csv', 'dados-iniciais/catalogo-oui.csv']
};
const ler = async u => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error('arquivo ' + u + ' não encontrado'); return r.text(); };
const esperar = async (cond, ms = 8000) => { const t = Date.now(); while (!cond() && Date.now() - t < ms) await new Promise(r => setTimeout(r, 200)); };

export function precisaCarga() {
  return isAdmin() && !(S.conta && S.conta.dadosIniciais) && !S.d.clientes.length && !S.d.vendas.length && !S.d.compras.length;
}

export async function carregarTudo() {
  const box = document.createElement('div');
  box.className = 'modal-bg';
  box.innerHTML = `<div class="modal" style="max-width:460px"><div class="modal-h"><h3>Trazendo seus dados do Revendi…</h3></div><div class="modal-b"><ul class="lista" id="passos"></ul><p class="mudo pq">Não feche esta página. Leva menos de um minuto.</p></div></div>`;
  document.body.appendChild(box);
  const ul = box.querySelector('#passos');
  const passo = t => { const li = document.createElement('li'); li.innerHTML = `<span>${t}</span><b>…</b>`; ul.appendChild(li); return v => li.querySelector('b').textContent = v; };
  const resumo = {};
  try {
    let fim = passo('Clientes');
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
