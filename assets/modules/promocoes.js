// Promoções: desconto por produto, categoria, marca ou loja inteira, por canal e período,
// aplicadas automaticamente na venda e na loja virtual + central de divulgação por WhatsApp
import { $, $$, esc, brl, nfmt, parseNum, uid, norm, fmtData, hoje, addDias, waLink, soDigitos } from '../utils.js';
import { S, pode, icon, modal, ask, toast, commit, badge, vazio, datalist, qtdProduto, promoAtiva, prodPorId, selecionarVarios } from '../core.js';
import { opsItemLoja } from './loja-sync.js';

const CANAL = { todos: 'Balcão e loja virtual', balcao: 'Só balcão (vendas no sistema)', loja: 'Só loja virtual' };
const ALVO = { produtos: 'Produtos escolhidos', categoria: 'Uma categoria', marca: 'Uma marca', todos: 'Todos os produtos' };

const status = pr => pr.ativa === false ? ['Pausada', 'mudo'] : pr.fim && pr.fim < hoje() ? ['Encerrada', 'mudo'] : pr.inicio && pr.inicio > hoje() ? ['Agendada', 'info'] : ['Ativa', 'ok'];
export const produtosDaPromo = pr => S.d.produtos.filter(p => p.ativo !== false && (
  pr.alvo === 'todos' || (pr.alvo === 'produtos' && (pr.ids || []).includes(p.id)) || (pr.alvo === 'categoria' && norm(p.categoria) === norm(pr.categoria)) || (pr.alvo === 'marca' && norm(p.marca) === norm(pr.marca))));

// Reenvia para a loja os produtos afetados (preço promocional)
const opsLoja = prods => prods.flatMap(p => opsItemLoja(p));

export function render(el) {
  const ed = pode('promocoes', 'editar');
  const l = [...S.d.promocoes].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const ativas = l.filter(p => status(p)[0] === 'Ativa');
  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Promoções ativas</span><b>${ativas.length}</b></div>
    <div class="kpi"><span>Produtos em promoção hoje</span><b>${S.d.produtos.filter(p => p.ativo !== false && promoAtiva(p)).length}</b><small>no balcão</small></div>
    <div class="kpi"><span>Vendido com promoção no mês</span><b>${brl(S.d.vendas.filter(v => !v.cancelada && (v.data || '').startsWith(hoje().slice(0, 7))).flatMap(v => v.itens).filter(i => i.promo).reduce((s, i) => s + i.qtd * i.preco, 0))}</b></div>
  </div>
  <div class="barra">${ed ? `<button class="btn pri" id="nova">${icon('plus')}Nova promoção</button>` : ''}<span class="grow"></span>
    <button class="btn wa" id="div">${icon('wa')}Divulgar promoções</button></div>
  ${l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Promoção</th><th>Desconto</th><th>Vale para</th><th>Canal</th><th>Período</th><th>Status</th><th></th></tr></thead><tbody>
  ${l.map(pr => `<tr data-id="${pr.id}" class="clicavel"><td><b>${esc(pr.nome)}</b></td>
    <td>${pr.tipo === 'preco' ? brl(pr.valor) : nfmt(pr.valor, 0) + '% off'}</td>
    <td>${pr.alvo === 'produtos' ? `${(pr.ids || []).length} produto(s)` : pr.alvo === 'categoria' ? 'Categoria ' + esc(pr.categoria) : pr.alvo === 'marca' ? 'Marca ' + esc(pr.marca) : 'Todos os produtos'}</td>
    <td>${CANAL[pr.canal || 'todos'].split(' (')[0]}</td><td>${pr.inicio ? fmtData(pr.inicio) : 'Já'} → ${pr.fim ? fmtData(pr.fim) : 'sem fim'}</td>
    <td>${badge(...status(pr))}</td><td class="acoes"><button class="btn-ic wa" data-div="${pr.id}" title="Divulgar">${icon('wa')}</button></td></tr>`).join('')}
  </tbody></table></div>` : vazio('Crie promoções por produto, categoria ou marca. O preço promocional entra sozinho na venda e na loja virtual durante o período.')}`;
  if (ed) $('#nova', el).onclick = () => formPromo();
  $('#div', el).onclick = () => divulgar(ativas);
  $$('[data-div]', el).forEach(b => b.onclick = e => { e.stopPropagation(); divulgar([S.d.promocoes.find(x => x.id === b.dataset.div)]); });
  $$('tr[data-id]', el).forEach(tr => tr.onclick = () => ed && formPromo(S.d.promocoes.find(x => x.id === tr.dataset.id)));
}

function formPromo(pr) {
  const novo = !pr;
  pr = pr ? structuredClone(pr) : { id: uid(), tipo: 'percentual', valor: 10, alvo: 'produtos', ids: [], canal: 'todos', inicio: hoje(), fim: addDias(hoje(), 7), ativa: true };
  let ids = new Set(pr.ids || []);
  const m = modal({
    titulo: novo ? 'Nova promoção' : 'Editar promoção', largo: true,
    corpo: `<form class="form grid2" id="fp">
      <label class="span2">Nome da promoção *<input name="nome" required value="${esc(pr.nome || '')}" placeholder="Ex.: Semana do Perfume"></label>
      <label>Vale para<select name="alvo">${Object.entries(ALVO).map(([k, t]) => `<option value="${k}" ${pr.alvo === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Canal<select name="canal">${Object.entries(CANAL).map(([k, t]) => `<option value="${k}" ${pr.canal === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label id="lcat">Categoria<input name="categoria" list="dl-pc" value="${esc(pr.categoria || '')}"></label>
      <label id="lmar">Marca<input name="marca" list="dl-pm" value="${esc(pr.marca || '')}"></label>
      <label>Tipo de desconto<select name="tipo"><option value="percentual" ${pr.tipo !== 'preco' ? 'selected' : ''}>Percentual (% de desconto)</option><option value="preco" ${pr.tipo === 'preco' ? 'selected' : ''}>Preço fixo promocional</option></select></label>
      <label><span id="rotv">Desconto (%)</span><input name="valor" inputmode="decimal" required value="${nfmt(pr.valor, 2)}"></label>
      <label>Início<input type="date" name="inicio" value="${pr.inicio || ''}"></label>
      <label>Fim<input type="date" name="fim" value="${pr.fim || ''}"></label>
      <label class="chk span2"><input type="checkbox" name="ativa" ${pr.ativa !== false ? 'checked' : ''}> Promoção ativa</label>
      <div class="span2" id="prods"></div>
      ${datalist('dl-pc', S.d.produtos.map(p => p.categoria))}${datalist('dl-pm', S.d.produtos.map(p => p.marca))}
    </form>`,
    rodape: `${!novo ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fp');
  const vis = () => {
    const a = f.alvo.value;
    m.$('#lcat').hidden = a !== 'categoria'; m.$('#lmar').hidden = a !== 'marca';
    if (a !== 'produtos' && f.tipo.value === 'preco') f.tipo.value = 'percentual';
    f.tipo.querySelector('[value=preco]').disabled = a !== 'produtos';
    m.$('#rotv').textContent = f.tipo.value === 'preco' ? 'Preço promocional (R$)' : 'Desconto (%)';
    const tmp = { ...pr, alvo: a, categoria: f.categoria.value, marca: f.marca.value, ids: [...ids] };
    const lista = produtosDaPromo(tmp);
    const val = parseNum(f.valor.value);
    m.$('#prods').innerHTML = `<div class="sub-h"><h4>${lista.length} produto(s) na promoção</h4>${a === 'produtos' ? `<button type="button" class="btn sm" id="escolher">${icon('plus')}Escolher produtos</button>` : ''}</div>
      ${lista.length ? `<div class="tabela-w" style="max-height:240px;overflow:auto"><table class="tabela mini"><tbody>${lista.slice(0, 200).map(p => { const novoP = f.tipo.value === 'preco' ? val : p.preco * (1 - val / 100); return `<tr><td>${esc(p.nome)}<small class="bl mudo">${p.sku ? 'cód. ' + esc(p.sku) + ' · ' : ''}${esc(p.marca || '')} · ${qtdProduto(p)} un.</small></td><td class="n"><s class="mudo">${brl(p.preco)}</s> → <b>${brl(novoP)}</b></td>${a === 'produtos' ? `<td><button type="button" class="btn-ic" data-rm="${p.id}">${icon('x')}</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>` : ''}`;
    const e = m.$('#escolher'); if (e) e.onclick = () => selecionarVarios(l => { l.forEach(x => ids.add(x.p.id)); vis(); }, { titulo: 'Produtos da promoção' });
    m.$$('[data-rm]').forEach(b => b.onclick = () => { ids.delete(b.dataset.rm); vis(); });
  };
  f.addEventListener('change', vis); f.valor.oninput = vis; vis();
  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    const d = { nome: f.nome.value.trim(), alvo: f.alvo.value, canal: f.canal.value, categoria: f.categoria.value.trim(), marca: f.marca.value.trim(), tipo: f.tipo.value, valor: parseNum(f.valor.value), inicio: f.inicio.value, fim: f.fim.value, ativa: f.ativa.checked, ids: [...ids], criadoEm: pr.criadoEm || Date.now() };
    if (d.alvo === 'produtos' && !d.ids.length) return toast('Escolha os produtos da promoção.', 'aviso');
    if (d.tipo === 'percentual' && (d.valor <= 0 || d.valor >= 100)) return toast('Desconto deve ficar entre 1% e 99%.', 'aviso');
    const antes = produtosDaPromo(pr);
    S.d.promocoes = [...S.d.promocoes.filter(x => x.id !== pr.id), { ...d, id: pr.id }]; // aplica já para recalcular a loja
    const afetados = [...new Map([...antes, ...produtosDaPromo({ ...d, id: pr.id })].map(p => [p.id, p])).values()];
    if (await commit([{ op: 'set', col: 'promocoes', id: pr.id, data: d }, ...opsLoja(afetados)], `${novo ? 'Criou' : 'Editou'} a promoção ${d.nome}`)) { toast('Promoção salva.'); m.fechar(); }
  };
  const del = m.$('#del');
  if (del) del.onclick = async () => {
    if (!await ask(`Excluir a promoção ${pr.nome}?`, { perigo: true, ok: 'Excluir' })) return;
    const afetados = produtosDaPromo(pr);
    S.d.promocoes = S.d.promocoes.filter(x => x.id !== pr.id);
    if (await commit([{ op: 'del', col: 'promocoes', id: pr.id }, ...opsLoja(afetados)], `Excluiu a promoção ${pr.nome}`)) { toast('Promoção excluída.'); m.fechar(); }
  };
}

// ---------------- central de divulgação ----------------
function divulgar(promos) {
  promos = promos.filter(Boolean);
  if (!promos.length) return toast('Nenhuma promoção ativa para divulgar.', 'aviso');
  const lj = S.conta.loja || {};
  const link = lj.slug && lj.ativa ? location.origin + location.pathname.replace(/[^/]*$/, '') + 'loja.html?l=' + lj.slug : '';
  const linhas = promos.flatMap(pr => produtosDaPromo(pr).filter(p => qtdProduto(p) > 0).slice(0, 15).map(p => { const x = promoAtiva(p, pr.canal === 'loja' ? 'loja' : 'balcao'); return `• ${p.nome}: de ${brl(x ? x.base : p.preco)} por *${brl(x ? x.preco : p.preco)}*`; }));
  const fim = promos.map(p => p.fim).filter(Boolean).sort()[0];
  const tpl = `Oi {cliente}! 💖\nPromoção especial na ${S.conta.nome || 'minha revenda'}${promos.length === 1 ? ` — *${promos[0].nome}*` : ''}:\n\n${linhas.join('\n')}${fim ? `\n\nVálido até ${fmtData(fim)} ou enquanto durar o estoque.` : ''}${link ? `\n\nVeja tudo e peça pelo link: ${link}` : ''}\n\nQuer reservar? É só responder aqui 😊`;
  const tags = [...new Set(S.d.clientes.flatMap(c => c.tags || []))].sort();
  const m = modal({
    titulo: 'Divulgar promoções no WhatsApp', largo: true,
    corpo: `<div class="grid2">
      <div class="form"><label>Mensagem<textarea id="msg" rows="14">${esc(tpl)}</textarea><small class="mudo">{cliente} vira o primeiro nome de cada cliente.</small></label>
        <button type="button" class="btn" id="copiar">${icon('copy')}Copiar mensagem (para status ou grupos)</button></div>
      <div><div class="barra"><select id="filtro"><option value="">Todos os clientes com WhatsApp</option><option value="compraram">Compraram nos últimos 90 dias</option><option value="inativos">Sem comprar há 90 dias</option><option value="aniv">Aniversariantes do mês</option>${tags.map(t => `<option value="tag:${esc(t)}">Etiqueta: ${esc(t)}</option>`).join('')}</select></div>
        <div id="lista" class="tabela-w" style="max-height:330px;overflow:auto"></div>
        <p class="mudo pq">O WhatsApp não permite envio em massa automático: clique em "Enviar" em cada cliente. A mensagem já vai pronta e o cliente é marcado como enviado.</p></div>
    </div>`
  });
  const enviados = new Set();
  const limite = addDias(hoje(), -90);
  const ultima = {}; S.d.vendas.forEach(v => { if (!v.cancelada && v.clienteId && (!ultima[v.clienteId] || v.data > ultima[v.clienteId])) ultima[v.clienteId] = v.data; });
  const desenhar = () => {
    const fl = m.$('#filtro').value;
    const l = S.d.clientes.filter(c => soDigitos(c.whatsapp).length >= 10 && (
      !fl || (fl === 'compraram' && ultima[c.id] >= limite) || (fl === 'inativos' && !(ultima[c.id] >= limite)) || (fl === 'aniv' && (c.aniversario || '').slice(5, 7) === hoje().slice(5, 7)) || (fl.startsWith('tag:') && (c.tags || []).includes(fl.slice(4)))
    )).sort((a, b) => a.nome.localeCompare(b.nome));
    m.$('#lista').innerHTML = l.length ? `<table class="tabela mini"><tbody>${l.map(c => `<tr><td><b>${esc(c.nome)}</b></td><td class="acoes">${enviados.has(c.id) ? badge('Enviado', 'ok') : `<button class="btn sm wa" data-c="${c.id}">${icon('wa')}Enviar</button>`}</td></tr>`).join('')}</tbody></table>` : '<p class="mudo pq" style="padding:12px">Nenhum cliente com WhatsApp neste filtro.</p>';
    m.$$('[data-c]').forEach(b => b.onclick = () => {
      const c = S.d.clientes.find(x => x.id === b.dataset.c);
      window.open(waLink(c.whatsapp, m.$('#msg').value.replace(/\{cliente\}/g, c.nome.split(' ')[0])), '_blank');
      enviados.add(c.id); desenhar();
    });
  };
  m.$('#filtro').onchange = desenhar; desenhar();
  m.$('#copiar').onclick = async () => { const { copiar } = await import('../utils.js'); await copiar(m.$('#msg').value.replace(/\{cliente\}/g, '').replace('Oi !', 'Oi!')); toast('Mensagem copiada.'); };
}
