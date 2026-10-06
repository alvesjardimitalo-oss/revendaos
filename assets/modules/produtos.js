// Estoque / Produtos
import { $, $$, esc, brl, nfmt, pct, parseNum, uid, r2, norm, slugify, fmtData, diasAte, hoje, toCSV, parseCSV, baixar, lerArquivo, reduzirImagem, fotoProduto, tratarFotoProduto, linkBuscaFoto } from '../utils.js';
import { S, cfg, pode, icon, modal, ask, toast, commit, qtdProduto, validadeProxima, prodPorId, scanner, datalist, vazio, badge, ehKit, custoKit, buscaProduto, promoAtiva } from '../core.js';
import { opsItemLoja } from './loja-sync.js';
import { buscarEAN, buscarRef, normRef, sugerir, escolherItem } from './catalogo.js';

let F = { q: '', filtro: 'todos', marca: '', cat: '', ord: 'nome' };

const diasAlerta = () => Number(cfg().diasValidade) || 30;
function situacao(p) {
  const q = qtdProduto(p), v = validadeProxima(p), min = Number(p.estoqueMin ?? cfg().estoqueMin ?? 0) || 0;
  const d = diasAte(v);
  return { q, v, d, zerado: q <= 0, baixo: q > 0 && q < min, vencido: v && d < 0, vencendo: v && d >= 0 && d <= diasAlerta() };
}

export function render(el) {
  const ed = pode('produtos', 'editar');
  const ps = S.d.produtos;
  const marcas = [...new Set(ps.map(p => p.marca).filter(Boolean))].sort();
  const cats = [...new Set(ps.map(p => p.categoria).filter(Boolean))].sort();
  let l = ps.filter(p => {
    const s = situacao(p);
    if (F.filtro === 'inativos') { if (p.ativo !== false) return false; }
    else if (p.ativo === false) return false;
    if (F.filtro === 'baixo' && !s.baixo) return false;
    if (F.filtro === 'zerado' && !s.zerado) return false;
    if (F.filtro === 'vencendo' && !s.vencendo) return false;
    if (F.filtro === 'vencido' && !s.vencido) return false;
    if (F.filtro === 'loja' && !p.naLoja) return false;
    if (F.marca && p.marca !== F.marca) return false;
    if (F.cat && p.categoria !== F.cat) return false;
    if (F.q) { const n = norm(F.q); if (!(norm(p.nome).includes(n) || norm(p.marca).includes(n) || String(p.codigo || '').includes(F.q) || norm(p.sku).includes(n))) return false; }
    return true;
  });
  const ord = {
    nome: (a, b) => a.nome.localeCompare(b.nome),
    qtd: (a, b) => qtdProduto(a) - qtdProduto(b),
    validade: (a, b) => (validadeProxima(a) || '9999') < (validadeProxima(b) || '9999') ? -1 : 1,
    preco: (a, b) => (b.preco || 0) - (a.preco || 0)
  };
  l.sort(ord[F.ord]);

  const ativos = ps.filter(p => p.ativo !== false);
  const un = ativos.reduce((s, p) => s + qtdProduto(p), 0);
  const vCusto = ativos.reduce((s, p) => s + (p.lotes || []).reduce((a, x) => a + x.qtd * (x.custo || p.custo || 0), 0), 0);
  const vVenda = ativos.reduce((s, p) => s + qtdProduto(p) * (p.preco || 0), 0);
  const nVenc = ativos.filter(p => situacao(p).vencendo).length, nVencido = ativos.filter(p => situacao(p).vencido).length;
  const nBaixo = ativos.filter(p => { const s = situacao(p); return s.baixo || s.zerado; }).length;

  const unid = ps.filter(p => p.ativo !== false && !ehKit(p)).reduce((a, p) => a + qtdProduto(p), 0);
  const mob = `<div class="so-mob">
    <div class="mtopo"><div class="campo-ic mbusca">${icon('search')}<input type="search" id="qm" placeholder="Buscar" value="${esc(F.q)}"><button class="btn-ic" id="scanm" title="Código de barras">${icon('scan')}</button></div>
      <button class="mfiltro ${F.filtro !== 'todos' || F.marca || F.cat ? 'on' : ''}" id="mf">${icon('filtro')}</button></div>
    <div class="mkpis"><div class="mkpi"><i>${icon('box')}</i><div><span>Produtos</span><b>${ps.filter(p => p.ativo !== false).length}</b></div></div><div class="mkpi"><i>${icon('dado')}</i><div><span>Unidades</span><b>${nfmt(unid)}</b></div></div></div>
    ${l.length ? `<div class="mlista">${l.map(p => { const q = qtdProduto(p), pr = promoAtiva(p); return `<div class="mrow prod" data-id="${p.id}"><div class="mfoto ${fotoProduto(p) ? '' : 'sem-foto'}" data-ini="${esc((p.marca || p.nome || '?')[0])}">${fotoProduto(p) ? `<img src="${esc(fotoProduto(p))}" alt="" loading="lazy">` : ''}</div>
      <div class="mrow-m"><b>${esc(p.nome)}</b><small>${esc(p.marca || '')}${p.sku ? ' • ' + esc(p.sku) : ''}</small>
      <div class="mpreco"><b class="valor">${pr ? brl(pr.preco) : p.preco ? brl(p.preco) : 'Sem preço'}</b>${pr ? `<s>${brl(pr.base)}</s>` : ''}<span class="pill ${q > 0 ? 'mudo' : 'cinza'}">${q > 0 ? nfmt(q) + ' un.' : 'Sem estoque'}</span></div></div></div>`; }).join('')}</div>`
      : `<div class="mvazio">${icon('box')}<p>${ps.length ? 'Nenhum produto com esses filtros' : 'Nenhum produto cadastrado'}</p></div>`}
    ${ed ? `<button class="fab" id="fabp">${icon('plus')}Adicionar produto</button>` : ''}
  </div>`;
  el.innerHTML = mob + `<div class="so-desk">
  <div class="kpis">
    <div class="kpi"><span>Produtos ativos</span><b>${ativos.length}</b><small>${nfmt(un)} unidades</small></div>
    <div class="kpi"><span>Estoque a preço de custo</span><b>${brl(vCusto)}</b><small>Venda estimada ${brl(vVenda)}</small></div>
    <div class="kpi ${nVenc + nVencido ? 'alerta' : ''}" data-f="vencendo"><span>Vencendo em ${diasAlerta()} dias</span><b>${nVenc}</b><small>${nVencido} já vencido(s)</small></div>
    <div class="kpi ${nBaixo ? 'alerta' : ''}" data-f="baixo"><span>Estoque baixo ou zerado</span><b>${nBaixo}</b><small>abaixo do mínimo</small></div>
  </div>
  <div class="barra filtros-m">
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Buscar por código do produto, nome ou marca" value="${esc(F.q)}"></div>
    <button class="btn" id="scan" title="Buscar pelo código de barras">${icon('scan')}</button>
    <select id="filtro">
      ${[['todos', 'Todos'], ['baixo', 'Estoque baixo'], ['zerado', 'Zerados'], ['vencendo', 'Vencendo'], ['vencido', 'Vencidos'], ['loja', 'Na loja virtual'], ['inativos', 'Inativos']].map(([v, t]) => `<option value="${v}" ${F.filtro === v ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <select id="marca"><option value="">Todas as marcas</option>${marcas.map(m => `<option ${F.marca === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    <select id="cat"><option value="">Todas as categorias</option>${cats.map(m => `<option ${F.cat === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
    <select id="ord">${[['nome', 'Nome'], ['qtd', 'Menor estoque'], ['validade', 'Validade'], ['preco', 'Maior preço']].map(([v, t]) => `<option value="${v}" ${F.ord === v ? 'selected' : ''}>Ordem: ${t}</option>`).join('')}</select>
  </div>
  <div class="barra">
    ${ed ? `<button class="btn pri" id="novo">${icon('plus')}Novo produto</button>
    <a class="btn" href="#/catalogo">${icon('book')}Adicionar do catálogo de marcas</a>
    <button class="btn" id="imp">${icon('up')}Importar planilha</button>
    <button class="btn" id="cats">${icon('tag')}Categorias</button>` : ''}
    <button class="btn" id="exp">${icon('down')}Exportar</button>
    <span class="mudo pq grow ta-d">${l.length} produto(s)</span>
  </div>
  ${l.length ? `<div class="tabela-w"><table class="tabela">
    <thead><tr><th></th><th>Produto</th><th>Categoria</th><th class="n">Estoque</th><th>Validade</th><th class="n">Custo</th><th class="n">Preço</th><th class="n">Margem</th><th></th></tr></thead>
    <tbody>${l.map(p => {
      const s = situacao(p); const mg = p.preco ? (p.preco - (p.custo || 0)) / p.preco * 100 : 0;
      return `<tr data-id="${p.id}" class="clicavel">
        <td class="foto-c"><div class="mfoto mini ${fotoProduto(p) ? '' : 'sem-foto'}" data-ini="${esc((p.marca || p.nome || '?')[0])}">${fotoProduto(p) ? `<img src="${esc(fotoProduto(p))}" alt="" loading="lazy">` : ''}</div></td>
        <td><b>${esc(p.nome)}</b><small class="bl mudo">${ehKit(p) ? badge('Kit', 'info') + ' ' : ''}${promoAtiva(p) ? badge('Promoção', 'aviso') + ' ' : ''}${p.sku ? 'cód. ' + esc(p.sku) + ' · ' : ''}${esc(p.marca || '')}${p.naLoja ? ' · ' + icon('store', 'mini') : ''}</small></td>
        <td>${esc(p.categoria || '—')}</td>
        <td class="n">${s.zerado ? badge('0', 'perigo') : s.baixo ? badge(nfmt(s.q), 'aviso') : nfmt(s.q)}</td>
        <td>${s.v ? (s.vencido ? badge(fmtData(s.v), 'perigo') : s.vencendo ? badge(fmtData(s.v), 'aviso') : fmtData(s.v)) : '<span class="mudo">—</span>'}</td>
        <td class="n">${brl(p.custo)}</td><td class="n"><b>${brl(p.preco)}</b></td><td class="n">${p.preco && p.custo ? pct(mg) : '<span class="mudo" title="Informe o custo para ver a margem">—</span>'}</td>
        <td class="acoes">${ed && !ehKit(p) ? `<button class="btn-ic" data-aj="${p.id}" title="Entrada/saída de estoque">${icon('box')}</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`
      : vazio(ps.length ? 'Nenhum produto com esses filtros.' : 'Cadastre seus produtos ou importe um catálogo em CSV para começar.', ed && !ps.length ? `<button class="btn pri" onclick="document.getElementById('novo').click()">${icon('plus')}Cadastrar produto</button>` : '')}</div>`;

  const re = () => render(el);
  ['q', 'qm'].forEach(k => $('#' + k, el).oninput = e => { F.q = e.target.value; re(); const i = $('#' + k, el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
  $('#mf', el).onclick = () => el.classList.toggle('mostrar-filtros');
  $('#scanm', el).onclick = () => $('#scan', el).click();
  const fp = $('#fabp', el); if (fp) fp.onclick = () => formProduto();
  $$('.mrow[data-id]', el).forEach(r => r.onclick = () => formProduto(prodPorId(r.dataset.id)));
  ['filtro', 'marca', 'cat', 'ord'].forEach(k => $('#' + k, el).onchange = e => { F[k] = e.target.value; re(); });
  $$('.kpi[data-f]', el).forEach(k => k.onclick = () => { F.filtro = k.dataset.f; re(); });
  $('#scan', el).onclick = () => scanner(c => { const p = S.d.produtos.find(x => String(x.codigo) === c); if (p) formProduto(p); else { F.q = c; re(); toast('Código não cadastrado.', 'aviso'); } });
  $('#exp', el).onclick = () => exportar(l);
  if (ed) { $('#novo', el).onclick = () => formProduto(); $('#imp', el).onclick = importar; $('#cats', el).onclick = gerenciarCategorias; }
  $$('tr[data-id]', el).forEach(tr => tr.onclick = e => {
    const aj = e.target.closest('[data-aj]');
    if (aj) { e.stopPropagation(); ajustar(prodPorId(aj.dataset.aj)); return; }
    formProduto(prodPorId(tr.dataset.id));
  });
}

// ---------------- formulário ----------------
const ultimaMarca = () => { const c = {}; S.d.produtos.forEach(p => p.marca && (c[p.marca] = (c[p.marca] || 0) + 1)); const l = Object.entries(c).sort((a, b) => b[1] - a[1]); return l.length && l[0][1] / S.d.produtos.length > 0.6 ? l[0][0] : ''; };
export function formProduto(p, aoSalvar) {
  const ed = pode('produtos', 'editar');
  const novo = !p;
  p = p ? structuredClone(p) : { id: uid(), nome: '', lotes: [{ id: uid(), qtd: 0, validade: '', custo: 0 }], ativo: true, naLoja: !!(S.conta.loja || {}).ativa, estoqueMin: cfg().estoqueMin ?? 1 };
  let foto = p.foto || '';
  const linhaLote = l => `<tr data-lote="${l.id}"><td><input class="n" name="lq" inputmode="decimal" value="${l.qtd ?? 0}"></td><td><input type="date" name="lv" value="${l.validade || ''}"></td><td><input class="n" name="lc" inputmode="decimal" value="${l.custo ? nfmt(l.custo, 2) : ''}" placeholder="${nfmt(p.custo || 0, 2)}"></td><td><button type="button" class="btn-ic" data-rl>${icon('trash')}</button></td></tr>`;
  const m = modal({
    titulo: novo ? 'Novo produto' : 'Editar produto', largo: true,
    corpo: `<form class="form grid2" id="fp">
      <div class="foto-up span2">
        <div class="foto-prev" id="prev">${foto ? `<img src="${foto}">` : icon('box')}</div>
        <div class="foto-acoes"><label class="btn pri">${icon('up')}Escolher foto<input type="file" accept="image/*" id="arq" hidden></label>
        <button type="button" class="btn" id="buscafoto">${icon('search')}Buscar na internet</button>
        <button type="button" class="btn" id="colarfoto">${icon('copy')}Colar foto</button>
        ${foto ? `<button type="button" class="btn perigo-txt" id="semfoto">Remover</button>` : ''}
        <p class="mudo pq">A foto é ajustada sozinha: o fundo em volta é cortado e o produto fica centralizado em fundo branco. Na busca, toque e segure na imagem, escolha <b>Copiar</b> e volte aqui em <b>Colar foto</b>.</p></div>
      </div>
      <div class="span2"><span class="rot">Mais fotos (até 4, aparecem na loja virtual)</span><div class="fotos-extra" id="fotos"></div></div>
      <div class="span2 grid2 busca-cod">
        <label>Código do produto<div class="campo-bt"><input name="sku" value="${esc(p.sku || '')}" placeholder="Código da revista, ex.: 73852" autocomplete="off"><button type="button" class="btn pri" id="bref">${icon('search')}Buscar</button></div></label>
        <label>Marca<input name="marca" list="dl-marca" value="${esc(p.marca || ultimaMarca())}" placeholder="Ajuda quando o código existe em mais de uma marca"></label>
        <small class="mudo span2" id="achado">${novo ? 'Digite o código do produto e pressione Enter: os dados vêm do catálogo global.' : ''}</small>
      </div>
      <label class="span2">Nome do produto *<input name="nome" required value="${esc(p.nome)}"></label>
      <label>Categoria<input name="categoria" list="dl-cat" value="${esc(p.categoria || '')}"></label>
      <label>Código de barras (opcional)<div class="campo-bt"><input name="codigo" inputmode="numeric" value="${esc(p.codigo || '')}"><button type="button" class="btn" id="lerc">${icon('scan')}</button></div></label>
      <label>Preço de custo (R$)<input name="custo" inputmode="decimal" value="${p.custo ? nfmt(p.custo, 2) : ''}"></label>
      <label>Preço de venda (R$) *<input name="preco" inputmode="decimal" required value="${p.preco ? nfmt(p.preco, 2) : ''}"><small class="mudo" id="mg"></small></label>
      <label>Preço na loja virtual (R$)<input name="precoLoja" inputmode="decimal" placeholder="igual ao preço de venda" value="${p.precoLoja ? nfmt(p.precoLoja, 2) : ''}"></label>
      <label>Estoque mínimo (alerta)<input name="estoqueMin" inputmode="numeric" value="${p.estoqueMin ?? ''}"></label>
      <label class="span2">Descrição<textarea name="descricao" rows="2">${esc(p.descricao || '')}</textarea></label>
      <div class="span2 checks">
        <label class="chk"><input type="checkbox" name="naLoja" ${p.naLoja ? 'checked' : ''}> Mostrar na loja virtual</label>
        <label class="chk"><input type="checkbox" name="ativo" ${p.ativo !== false ? 'checked' : ''}> Produto ativo</label>
      </div>
      <div class="span2 kit-area">
        <label class="chk"><input type="checkbox" name="ehkit" ${ehKit(p) ? 'checked' : ''}> Este produto é um <b>kit</b> (montado com outros produtos do estoque)</label>
        <div id="kitbox" ${ehKit(p) ? '' : 'hidden'}>
          <div id="kitbusca" style="margin:8px 0"></div>
          <table class="tabela mini"><thead><tr><th>Componente</th><th class="n">Qtd. no kit</th><th class="n">Estoque</th><th></th></tr></thead><tbody id="kititens"></tbody></table>
          <p class="mudo pq">O estoque do kit é calculado pelos componentes, e vender o kit baixa cada um deles. <span id="kitinfo"></span></p>
        </div>
      </div>
      <div class="span2" id="lotesbox" ${ehKit(p) ? 'hidden' : ''}>
        <div class="sub-h"><h4>Estoque por lote / validade</h4><button type="button" class="btn sm" id="addl">${icon('plus')}Lote</button></div>
        <table class="tabela mini"><thead><tr><th class="n">Qtd.</th><th>Validade</th><th class="n">Custo un.</th><th></th></tr></thead><tbody id="lotes">${(p.lotes || []).map(linhaLote).join('')}</tbody></table>
        <p class="mudo pq">Nas vendas, o sistema baixa primeiro o lote que vence antes.</p>
      </div>
      ${datalist('dl-marca', S.d.produtos.map(x => x.marca))}${datalist('dl-cat', [...S.d.produtos.map(x => x.categoria), ...(cfg().categorias || [])])}
    </form>`,
    rodape: `${!novo && ed ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button>${ed ? `<button class="btn pri" id="salvar">Salvar</button>` : ''}`
  });
  const f = m.$('#fp');
  const calcMg = () => { const c = parseNum(f.custo.value), v = parseNum(f.preco.value); m.$('#mg').textContent = v ? `Margem ${pct((v - c) / v * 100)} · lucro ${brl(v - c)}` : ''; };
  f.custo.oninput = f.preco.oninput = calcMg; calcMg();
  const aplicar = r => {
    if (!f.nome.value || novo) f.nome.value = r.nome || f.nome.value;
    if (!f.marca.value || novo) f.marca.value = r.marca || f.marca.value;
    if (!f.categoria.value) f.categoria.value = r.categoria || '';
    if (!f.sku.value) f.sku.value = r.ref || '';
    if (!f.codigo.value) f.codigo.value = r.codigo || '';
    if (!f.descricao.value) f.descricao.value = r.descricao || '';
    if ((!f.preco.value || novo) && r.preco) { f.preco.value = nfmt(r.preco, 2); const d = (cfg().descontosMarca || {})[slugify(r.marca || '')]; if (d != null) f.custo.value = nfmt(r.preco * (1 - d / 100), 2); calcMg(); }
    if (!foto && r.foto) setFoto(r.foto);
    m.$('#achado').innerHTML = `${icon('check', 'mini')} <b>${esc(r.nome)}</b> — dados preenchidos (fonte: ${esc(r.fonte)}). Confira o preço e salve.`;
    f.custo.focus();
  };
  let refBuscado = '';
  const buscarPorRef = async (forcar = false) => {
    const ref = f.sku.value.trim();
    if (!ed || !ref || (!forcar && ref + '|' + f.marca.value === refBuscado)) return;
    refBuscado = ref + '|' + f.marca.value;
    const meu = S.d.produtos.find(x => x.id !== p.id && x.sku && normRef(x.sku) === normRef(ref) && (!f.marca.value || norm(x.marca) === norm(f.marca.value)));
    if (meu && novo) { m.$('#achado').innerHTML = `${icon('alert', 'mini')} Você já tem este código no estoque: <b>${esc(meu.nome)}</b> (${esc(meu.marca || '')}).`; return; }
    m.$('#achado').textContent = 'Buscando no catálogo global…';
    const l = await buscarRef(ref, f.marca.value);
    if (!m.el.isConnected) return;
    if (!l.length) { m.$('#achado').textContent = `Código ${ref} não encontrado no catálogo${f.marca.value ? ' de ' + f.marca.value : ''}. Preencha os dados: ao salvar, ele é sugerido para o catálogo global.`; return; }
    if (l.length === 1) return aplicar(l[0]);
    escolherItem(l, aplicar);
  };
  f.sku.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarPorRef(true); } });
  f.sku.addEventListener('change', () => buscarPorRef());
  m.$('#bref').onclick = () => buscarPorRef(true);
  let ultimoBuscado = '';
  const autoPreencher = async () => {
    const cod = f.codigo.value.trim();
    if (!novo || !ed || cod.length < 8 || cod === ultimoBuscado) return;
    ultimoBuscado = cod;
    const outro = S.d.produtos.find(x => String(x.codigo) === cod);
    if (outro) return toast(`Você já tem esse código cadastrado: ${outro.nome}.`, 'aviso');
    m.$('#achado').textContent = 'Buscando no catálogo…';
    const r = await buscarEAN(cod);
    if (!m.el.isConnected) return;
    if (!r) { m.$('#achado').textContent = 'Código não encontrado no catálogo. Preencha os dados: ao salvar, ele é sugerido para o catálogo.'; return; }
    aplicar(r);
  };
  m.$('#lerc').onclick = () => scanner(c => { f.codigo.value = c; autoPreencher(); });
  f.codigo.addEventListener('change', autoPreencher);
  m.$('#addl').onclick = () => { m.$('#lotes').insertAdjacentHTML('beforeend', linhaLote({ id: uid(), qtd: 0 })); };
  m.$('#lotes').onclick = e => { if (e.target.closest('[data-rl]')) e.target.closest('tr').remove(); };
  const setFoto = v => { foto = v; m.$('#prev').innerHTML = v ? `<img src="${v}">` : icon('box'); };
  m.$('#arq').onchange = async e => { const a = e.target.files[0]; if (a) setFoto(await tratarFotoProduto(a).catch(() => reduzirImagem(a, 900, 0.82))); };
  m.$('#buscafoto').onclick = () => { const f = m.$('#fp'); window.open(linkBuscaFoto(f.nome.value || p.nome, f.marca.value || p.marca), '_blank'); };
  m.$('#colarfoto').onclick = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const itens = await navigator.clipboard.read();
        for (const it of itens) { const tipo = it.types.find(t => t.startsWith('image/')); if (tipo) { setFoto(await tratarFotoProduto(await it.getType(tipo))); return toast('Foto colada e ajustada.'); } }
        for (const it of itens) if (it.types.includes('text/plain')) { const t = (await (await it.getType('text/plain')).text()).trim(); if (/^https?:\/\//.test(t)) return colarLink(t); }
      }
      const t = await navigator.clipboard.readText(); if (/^https?:\/\//.test(t.trim())) return colarLink(t.trim());
      toast('Copie uma imagem (toque e segure → Copiar) ou o link dela e tente de novo.', 'aviso');
    } catch { toast('O navegador não deixou ler a área de transferência. Salve a imagem e use "Escolher foto".', 'aviso'); }
  };
  const colarLink = async u => { try { setFoto(await tratarFotoProduto(u)); toast('Foto ajustada.'); } catch { setFoto(u); toast('Foto adicionada pelo link.'); } };
  const sf = m.$('#semfoto'); if (sf) sf.onclick = () => setFoto('');
  // fotos adicionais
  let fotos = [...(p.fotos || [])];
  const desenharFotos = () => {
    m.$('#fotos').innerHTML = fotos.map((x, k) => `<div class="mini-foto"><img src="${x}"><button type="button" data-rf="${k}" title="Remover">×</button></div>`).join('')
      + (fotos.length < 4 && ed ? `<label class="mini-foto add">${icon('plus')}<input type="file" accept="image/*" multiple hidden id="arqs"></label>` : '');
    const a = m.$('#arqs'); if (a) a.onchange = async e => { for (const fl of [...e.target.files].slice(0, 4 - fotos.length)) fotos.push(await tratarFotoProduto(fl, 800).catch(() => reduzirImagem(fl, 700, 0.8))); desenharFotos(); };
    m.$$('[data-rf]').forEach(b => b.onclick = () => { fotos.splice(+b.dataset.rf, 1); desenharFotos(); });
  };
  desenharFotos();
  // kit
  let kit = (p.kit || []).map(c => ({ ...c }));
  const desenharKit = () => {
    m.$('#kititens').innerHTML = kit.length ? kit.map((c, k) => { const cp = prodPorId(c.prodId); return `<tr data-k="${k}"><td>${esc(cp ? cp.nome : 'produto removido')}<small class="bl mudo">${cp && cp.sku ? 'cód. ' + esc(cp.sku) : ''}</small></td><td class="n"><input class="n w70" name="kq" inputmode="decimal" value="${c.qtd}"></td><td class="n">${cp ? qtdProduto(cp) : 0}</td><td><button type="button" class="btn-ic" data-kx>${icon('trash')}</button></td></tr>`; }).join('')
      : '<tr><td colspan="4" class="mudo pq">Busque e adicione os produtos que formam o kit.</td></tr>';
    const custo = kit.reduce((s, c) => s + c.qtd * ((prodPorId(c.prodId) || {}).custo || 0), 0);
    const disp = kit.length ? Math.min(...kit.map(c => { const cp = prodPorId(c.prodId); return cp ? Math.floor(qtdProduto(cp) / (c.qtd || 1)) : 0; })) : 0;
    m.$('#kitinfo').innerHTML = kit.length ? `Custo dos componentes: <b>${brl(custo)}</b> · dá para montar <b>${disp}</b> kit(s).` : '';
    if (f.ehkit.checked && kit.length) { f.custo.value = nfmt(custo, 2); calcMg(); }
  };
  if (ed) buscaProduto(m.$('#kitbusca'), cp => {
    if (cp.id === p.id || ehKit(cp)) return toast('Um kit não pode conter outro kit.', 'aviso');
    const ex = kit.find(c => c.prodId === cp.id); if (ex) ex.qtd++; else kit.push({ prodId: cp.id, qtd: 1 }); desenharKit();
  }, { placeholder: 'Adicionar componente: código ou nome…' });
  m.$('#kititens').addEventListener('input', e => { const tr = e.target.closest('tr[data-k]'); if (tr) { kit[+tr.dataset.k].qtd = parseNum(e.target.value) || 1; desenharKit(); } });
  m.$('#kititens').addEventListener('click', e => { if (e.target.closest('[data-kx]')) { kit.splice(+e.target.closest('tr').dataset.k, 1); desenharKit(); } });
  f.ehkit.onchange = () => { m.$('#kitbox').hidden = !f.ehkit.checked; m.$('#lotesbox').hidden = f.ehkit.checked; desenharKit(); };
  desenharKit();
  if (!ed) m.$$('input,textarea,select').forEach(i => i.disabled = true);

  const del = m.$('#del');
  if (del) del.onclick = async () => {
    if (!await ask(`Excluir "${p.nome}"? As vendas antigas continuam registradas.`, { ok: 'Excluir', perigo: true })) return;
    if (await commit([{ op: 'del', col: 'produtos', id: p.id }, ...opsItemLoja(p, true)], 'Excluiu produto ' + p.nome)) { toast('Produto excluído.'); m.fechar(); }
  };
  const sv = m.$('#salvar');
  if (sv) sv.onclick = async () => {
    if (!f.reportValidity()) return;
    const cod = f.codigo.value.trim();
    if (f.sku.value.trim() && S.d.produtos.some(x => x.id !== p.id && x.sku && normRef(x.sku) === normRef(f.sku.value) && norm(x.marca) === norm(f.marca.value))) return toast('Já existe um produto desta marca com esse código.', 'erro');
    if (cod && S.d.produtos.some(x => x.id !== p.id && String(x.codigo) === cod)) return toast('Já existe outro produto com esse código de barras.', 'erro');
    const ehk = f.ehkit.checked;
    if (ehk && !kit.length) return toast('Adicione os componentes do kit.', 'aviso');
    const custo = parseNum(f.custo.value);
    const lotes = ehk ? [] : m.$$('#lotes tr').map(tr => ({ id: tr.dataset.lote, qtd: parseNum($('[name=lq]', tr).value), validade: $('[name=lv]', tr).value, custo: parseNum($('[name=lc]', tr).value) || custo })).filter(l => l.qtd > 0);
    const dados = {
      ...p, nome: f.nome.value.trim(), marca: f.marca.value.trim(), categoria: f.categoria.value.trim(), codigo: cod, sku: f.sku.value.trim(),
      custo, preco: parseNum(f.preco.value), precoLoja: parseNum(f.precoLoja.value), estoqueMin: f.estoqueMin.value === '' ? null : parseNum(f.estoqueMin.value),
      descricao: f.descricao.value.trim(), naLoja: f.naLoja.checked, ativo: f.ativo.checked, foto, fotos, kit: ehk ? kit : [], lotes, atualizadoEm: Date.now(), criadoEm: p.criadoEm || Date.now()
    };
    delete dados.id;
    if (await commit([{ op: 'set', col: 'produtos', id: p.id, data: dados }, ...opsItemLoja({ ...dados, id: p.id })], (novo ? 'Cadastrou' : 'Editou') + ' produto ' + dados.nome)) {
      toast('Produto salvo.'); m.fechar(); aoSalvar && aoSalvar({ ...dados, id: p.id });
      if (dados.codigo || (dados.sku && dados.marca)) sugerir(dados);
    }
  };
}

// ---------------- ajuste rápido ----------------
function ajustar(p) {
  const m = modal({
    titulo: 'Movimentar estoque',
    corpo: `<p><b>${esc(p.nome)}</b> — estoque atual: <b>${nfmt(qtdProduto(p))}</b></p>
    <form class="form grid2" id="fa">
      <label>Tipo<select name="tipo"><option value="entrada">Entrada (+)</option><option value="saida">Saída / perda (−)</option><option value="definir">Definir quantidade exata</option></select></label>
      <label>Quantidade<input name="qtd" inputmode="decimal" required></label>
      <label id="lval">Validade do lote<input type="date" name="validade"></label>
      <label id="lcus">Custo unitário<input name="custo" inputmode="decimal" placeholder="${nfmt(p.custo || 0, 2)}"></label>
      <label class="span2">Motivo<input name="motivo" placeholder="Ex.: brinde, avaria, uso próprio, contagem"></label>
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Aplicar</button>`
  });
  const f = m.$('#fa');
  const vis = () => { const e = f.tipo.value === 'entrada'; m.$('#lval').hidden = !e; m.$('#lcus').hidden = !e; };
  f.tipo.onchange = vis; vis();
  m.$('#ok').onclick = async () => {
    const q = parseNum(f.qtd.value); if (!(q >= 0) || f.qtd.value === '') return toast('Informe a quantidade.', 'aviso');
    let lotes = (p.lotes || []).map(l => ({ ...l })); const atual = qtdProduto(p); let desc;
    if (f.tipo.value === 'entrada') { lotes.push({ id: uid(), qtd: q, validade: f.validade.value, custo: parseNum(f.custo.value) || p.custo || 0 }); desc = `+${q}`; }
    else {
      const alvo = f.tipo.value === 'definir' ? q : Math.max(0, atual - q);
      let tirar = r2(atual - alvo);
      if (tirar < 0) { lotes.push({ id: uid(), qtd: -tirar, validade: '', custo: p.custo || 0 }); }
      else {
        lotes.sort((a, b) => (a.validade || '9999') < (b.validade || '9999') ? -1 : 1);
        for (const l of lotes) { const t = Math.min(l.qtd, tirar); l.qtd = r2(l.qtd - t); tirar = r2(tirar - t); }
        lotes = lotes.filter(l => l.qtd > 0);
      }
      desc = `${atual} → ${alvo}`;
    }
    const np = { ...p, lotes };
    if (await commit([{ op: 'upd', col: 'produtos', id: p.id, data: { lotes, atualizadoEm: Date.now() } }, ...opsItemLoja(np)], `Estoque de ${p.nome}: ${desc}${f.motivo.value ? ' (' + f.motivo.value + ')' : ''}`)) { toast('Estoque atualizado.'); m.fechar(); }
  };
}

// ---------------- CSV ----------------
const COLS = [
  { label: 'nome', key: 'nome' }, { label: 'marca', key: 'marca' }, { label: 'categoria', key: 'categoria' }, { label: 'codigo', key: 'codigo' },
  { label: 'custo', val: p => nfmt(p.custo || 0, 2) }, { label: 'preco', val: p => nfmt(p.preco || 0, 2) },
  { label: 'quantidade', val: p => qtdProduto(p) }, { label: 'validade', val: p => validadeProxima(p) },
  { label: 'estoque_minimo', val: p => p.estoqueMin ?? '' }, { label: 'descricao', key: 'descricao' }
];
function exportar(l) { baixar(`estoque-${hoje()}.csv`, toCSV(l, COLS)); }

async function importar() {
  const m = modal({
    titulo: 'Importar catálogo / estoque',
    corpo: `<p>Envie uma planilha <b>CSV</b> (Excel: Salvar como → CSV) com as colunas:</p>
    <p><code>nome; marca; categoria; codigo; custo; preco; quantidade; validade; estoque_minimo; descricao</code></p>
    <p class="mudo pq">Produtos com o mesmo código de barras (ou mesmo nome e marca) são atualizados; a quantidade informada entra como novo lote. Validade no formato AAAA-MM-DD ou DD/MM/AAAA.</p>`,
    rodape: `<button class="btn" id="modelo">${icon('down')}Baixar modelo</button><span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="esc">${icon('up')}Escolher arquivo</button>`
  });
  m.$('#modelo').onclick = () => baixar('modelo-catalogo.csv', toCSV([{ nome: 'Hidratante Corporal 400ml', marca: 'Marca X', categoria: 'Corpo e Banho', codigo: '7891234567890', custo: 25, preco: 49.9, quantidade: 3, validade: '2027-06-30', estoqueMin: 1, descricao: '' }],
    [{ label: 'nome', key: 'nome' }, { label: 'marca', key: 'marca' }, { label: 'categoria', key: 'categoria' }, { label: 'codigo', key: 'codigo' }, { label: 'custo', val: r => nfmt(r.custo, 2) }, { label: 'preco', val: r => nfmt(r.preco, 2) }, { label: 'quantidade', key: 'quantidade' }, { label: 'validade', key: 'validade' }, { label: 'estoque_minimo', key: 'estoqueMin' }, { label: 'descricao', key: 'descricao' }]));
  m.$('#esc').onclick = async () => {
    const txt = await lerArquivo('.csv,text/csv'); if (!txt) return;
    const rows = parseCSV(txt);
    const g = (r, ...k) => { for (const x of k) if (r[x] != null && r[x] !== '') return r[x]; return ''; };
    const data = v => { v = String(v || '').trim(); if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v.split('/').reverse().join('-'); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
    const ops = []; let novos = 0, atual = 0; const vistos = {};
    for (const r of rows) {
      const nome = g(r, 'nome', 'produto', 'descricao do produto'); if (!nome) continue;
      const cod = g(r, 'codigo', 'codigo de barras', 'ean', 'cod'); const marca = g(r, 'marca');
      const ex = S.d.produtos.find(p => (cod && String(p.codigo) === cod) || (norm(p.nome) === norm(nome) && norm(p.marca) === norm(marca))) || vistos[cod || norm(nome + marca)];
      const custo = parseNum(g(r, 'custo', 'preco de custo')), preco = parseNum(g(r, 'preco', 'preco de venda', 'valor')), qtd = parseNum(g(r, 'quantidade', 'qtd', 'estoque'));
      const p = ex ? structuredClone(ex) : { id: uid(), lotes: [], ativo: true, naLoja: !!(S.conta.loja || {}).ativa, criadoEm: Date.now() };
      Object.assign(p, { nome, marca: marca || p.marca || '', categoria: g(r, 'categoria') || p.categoria || '', codigo: cod || p.codigo || '', descricao: g(r, 'descricao') || p.descricao || '' });
      if (custo) p.custo = custo; if (preco) p.preco = preco;
      const em = g(r, 'estoque_minimo', 'estoque minimo'); if (em !== '') p.estoqueMin = parseNum(em);
      if (qtd > 0) p.lotes = [...(p.lotes || []), { id: uid(), qtd, validade: data(g(r, 'validade', 'vencimento')), custo: custo || p.custo || 0 }];
      p.atualizadoEm = Date.now();
      vistos[cod || norm(nome + marca)] = p;
      const { id, ...dd } = p; ops.push({ op: 'set', col: 'produtos', id, data: dd }, ...opsItemLoja(p));
      ex ? atual++ : novos++;
    }
    if (!ops.length) return toast('Nenhuma linha válida encontrada. Confira o cabeçalho.', 'erro');
    if (await commit(ops, `Importou catálogo: ${novos} novos, ${atual} atualizados`)) { toast(`${novos} produto(s) criados e ${atual} atualizados.`); m.fechar(); }
  };
}

// ---------------- categorias ----------------
function gerenciarCategorias() {
  const desenhar = m => {
    const cont = {}; S.d.produtos.forEach(p => { if (p.categoria) cont[p.categoria] = (cont[p.categoria] || 0) + 1; });
    (cfg().categorias || []).forEach(c => { if (!(c in cont)) cont[c] = 0; });
    const l = Object.entries(cont).sort((a, b) => a[0].localeCompare(b[0]));
    const semCat = S.d.produtos.filter(p => !p.categoria && p.ativo !== false).length;
    m.$('#lc').innerHTML = (l.length ? `<table class="tabela mini"><tbody>${l.map(([c, n]) => `<tr data-c="${esc(c)}"><td><b>${esc(c)}</b></td><td class="n">${n} produto(s)</td><td class="acoes"><button class="btn sm" data-ren>${icon('edit')}Renomear / juntar</button><button class="btn-ic" data-del title="Excluir">${icon('trash')}</button></td></tr>`).join('')}</tbody></table>` : '<p class="mudo">Nenhuma categoria.</p>')
      + (semCat ? `<p class="mudo pq">${semCat} produto(s) ativo(s) sem categoria.</p>` : '');
    m.$$('[data-ren]').forEach(b => b.onclick = async () => {
      const antiga = b.closest('tr').dataset.c; const nova = (prompt(`Novo nome para "${antiga}" (use o nome de outra categoria para juntar as duas):`, antiga) || '').trim();
      if (!nova || nova === antiga) return;
      const ops = S.d.produtos.filter(p => p.categoria === antiga).flatMap(p => [{ op: 'upd', col: 'produtos', id: p.id, data: { categoria: nova } }, ...opsItemLoja({ ...p, categoria: nova })]);
      ops.push({ op: 'upd', col: '@conta', data: { config: { ...cfg(), categorias: [...new Set([...(cfg().categorias || []).filter(c => c !== antiga), nova])] } } });
      if (await commit(ops, `Renomeou a categoria ${antiga} para ${nova}`)) { toast('Categoria atualizada.'); setTimeout(() => desenhar(m), 300); }
    });
    m.$$('[data-del]').forEach(b => b.onclick = async () => {
      const c = b.closest('tr').dataset.c;
      if (!await ask(`Excluir a categoria "${c}"? Os produtos ficam sem categoria.`, { perigo: true, ok: 'Excluir' })) return;
      const ops = S.d.produtos.filter(p => p.categoria === c).flatMap(p => [{ op: 'upd', col: 'produtos', id: p.id, data: { categoria: '' } }, ...opsItemLoja({ ...p, categoria: '' })]);
      ops.push({ op: 'upd', col: '@conta', data: { config: { ...cfg(), categorias: (cfg().categorias || []).filter(x => x !== c) } } });
      if (await commit(ops, `Excluiu a categoria ${c}`)) setTimeout(() => desenhar(m), 300);
    });
  };
  const m = modal({ titulo: 'Categorias', corpo: `<div class="barra"><input id="nc" placeholder="Nova categoria" style="max-width:260px"><button class="btn" id="add">${icon('plus')}Criar</button></div><div id="lc"></div>` });
  m.$('#add').onclick = async () => {
    const n = m.$('#nc').value.trim(); if (!n) return;
    if (await commit([{ op: 'upd', col: '@conta', data: { config: { ...cfg(), categorias: [...new Set([...(cfg().categorias || []), n])] } } }])) { m.$('#nc').value = ''; setTimeout(() => desenhar(m), 300); }
  };
  desenhar(m);
}
