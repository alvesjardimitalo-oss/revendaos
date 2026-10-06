// Configurações: negócio, personalização, Pix, metas, mensagens e backup
import { $, $$, esc, nfmt, parseNum, uid, hoje, addDias, addMeses, soDigitos, fmtFone, baixar, lerArquivo, reduzirImagem, pixPayload } from '../utils.js';
import { S, cfg, icon, modal, ask, toast, commit } from '../core.js';
import { opsPublicarLoja } from './loja.js';

const CORES = ['#c2185b', '#e91e63', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5', '#00897b', '#43a047', '#f4511e', '#6d4c41', '#37474f', '#000000'];
const COLS = ['produtos', 'clientes', 'vendas', 'recebiveis', 'lancamentos', 'compras', 'promocoes', 'consorcios', 'logs'];

export function render(el) {
  const c = cfg();
  let logo = c.logo || '';
  const tema = localStorage.getItem('revendaos:tema') || 'auto';
  el.innerHTML = `<form class="form cfg" id="fc" data-form>
    <section class="card"><h4>Seu negócio</h4><div class="grid2">
      <label>Nome do negócio<input name="nome" value="${esc(S.conta.nome || '')}"></label>
      <label>WhatsApp / telefone<input name="telefone" inputmode="tel" value="${esc(fmtFone(c.telefone || ''))}"></label>
      <div class="foto-up span2"><div class="foto-prev" id="prev">${logo ? `<img src="${logo}">` : icon('store')}</div>
        <div><label class="btn">${icon('up')}Enviar logotipo<input type="file" accept="image/*" id="arq" hidden></label> <button type="button" class="btn" id="semlogo">Remover</button><p class="mudo pq">Aparece no menu, nos recibos e na loja virtual.</p></div></div>
      <div class="span2"><span class="rot">Cor do sistema</span><div class="cores">${CORES.map(x => `<button type="button" data-cor="${x}" style="background:${x}" class="${(c.cor || '#c2185b') === x ? 'sel' : ''}"></button>`).join('')}<input type="color" name="cor" value="${c.cor || '#c2185b'}" title="Outra cor"></div></div>
    </div></section>

    <section class="card"><h4>${icon('scan')} Base de códigos de barras (Cosmos)</h4>
      <p class="mudo pq">Ao ler um código que ainda não está no catálogo, o sistema consulta a base brasileira Cosmos e preenche nome, marca, foto e categoria. Crie uma conta em cosmos.bluesoft.com.br para obter o token. O recomendado é usar o proxy (pasta <code>servidor-cosmos</code>, roda no Railway): assim o token fica escondido no servidor.</p>
      <div class="grid2">
        <label>Endereço do proxy (recomendado)<input name="cosmosProxy" value="${esc(c.cosmosProxy || '')}" placeholder="https://seu-proxy.up.railway.app"></label>
        <label>Ou token direto da Cosmos<input name="cosmosToken" value="${esc(c.cosmosToken || '')}" placeholder="fica visível para a equipe" autocomplete="off"></label>
      </div>
      <div class="barra" style="margin-top:8px"><input id="eanteste" placeholder="Código para testar, ex.: 7891000100103" style="max-width:280px"><button type="button" class="btn" id="testacosmos">Testar consulta</button><span class="mudo pq" id="rescosmos"></span></div>
    </section>

    <section class="card"><h4>${icon('pix')} Pix para cobranças</h4><div class="grid3">
      <label>Chave Pix<input name="pixChave" value="${esc(c.pixChave || '')}" placeholder="CPF, e-mail, +5511999999999 ou aleatória"></label>
      <label>Nome do recebedor<input name="pixNome" value="${esc(c.pixNome || '')}" placeholder="Como está no banco"></label>
      <label>Cidade<input name="pixCidade" value="${esc(c.pixCidade || '')}"></label>
    </div><p class="mudo pq">Telefone como chave deve ter o formato +55DDDNÚMERO. O QR Code gerado é estático e já vem com o valor da parcela. <a href="#" id="testepix">Testar código</a></p></section>

    <section class="card"><h4>${icon('cash')} Taxas da maquininha de cartão</h4>
      <p class="mudo pq">Usadas para calcular quanto a maquininha desconta em cada venda no cartão e, se você quiser, repassar os juros ao cliente. Venda no cartão parcelado não vira fiado: o cliente paga a operadora.</p>
      <div class="taxas-grid">
        <label>Débito (%)<input name="tx_deb" inputmode="decimal" value="${(c.taxas || {}).debito ? nfmt(c.taxas.debito, 2) : ''}"></label>
        ${Array.from({ length: 12 }, (_, i) => `<label>Crédito ${i + 1}x (%)<input name="tx_c${i}" inputmode="decimal" value="${((c.taxas || {}).credito || [])[i] ? nfmt(c.taxas.credito[i], 2) : ''}"></label>`).join('')}
      </div>
    </section>

    <section class="card"><h4>Metas e regras</h4><div class="grid2">
      <label>Meta de vendas mensal da loja (R$)<input name="metaMensal" inputmode="decimal" value="${c.metaMensal ? nfmt(c.metaMensal, 2) : ''}"></label>
      <label>Comissão padrão (%)<input name="comissaoPadrao" inputmode="decimal" value="${c.comissaoPadrao ? nfmt(c.comissaoPadrao, 1) : ''}"></label>
      <label>Alertar validade com quantos dias<input name="diasValidade" inputmode="numeric" value="${c.diasValidade || 30}"></label>
      <label>Estoque mínimo padrão<input name="estoqueMin" inputmode="numeric" value="${c.estoqueMin ?? 1}"></label>
    </div></section>

    <section class="card"><h4>Mensagens de WhatsApp</h4>
      <label>Lembrete de cobrança<textarea name="msgCobranca" rows="6" placeholder="Deixe em branco para usar o modelo padrão">${esc(c.msgCobranca || '')}</textarea>
        <small class="mudo">Variáveis: {cliente} {parcela} {numero} {valor} {vencimento} {situacao} {pix} {loja}</small></label>
      <label>Recibo de venda<textarea name="msgRecibo" rows="6" placeholder="Deixe em branco para usar o modelo padrão">${esc(c.msgRecibo || '')}</textarea>
        <small class="mudo">Variáveis: {cliente} {numero} {data} {itens} {total} {pagamento} {loja}</small></label>
    </section>

    <section class="card"><h4>Aparência neste aparelho</h4>
      <div class="seg" id="tema">${[['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([k, t]) => `<button type="button" data-t="${k}" class="${tema === k ? 'ativo' : ''}">${t}</button>`).join('')}</div>
    </section>
    <div class="barra fixa"><span class="grow"></span><button class="btn pri" id="ok">${icon('check')}Salvar configurações</button></div>
  </form>

  <section class="card"><h4>Backup dos dados</h4>
    <p class="mudo pq">Baixe uma cópia completa (produtos, clientes, vendas, cobranças e financeiro) em JSON. Guarde em local seguro.</p>
    <div class="barra"><button class="btn" id="bk">${icon('down')}Baixar backup</button><button class="btn" id="rs">${icon('up')}Restaurar backup</button>
    <span class="grow"></span><button class="btn" id="ex">Gerar dados de exemplo</button></div>
  </section>`;

  const f = $('#fc', el);
  const setLogo = v => { logo = v; $('#prev', el).innerHTML = v ? `<img src="${v}">` : icon('store'); el.dataset.sujo = 1; $('#main').dataset.sujo = 1; };
  $('#arq', el).onchange = async e => { const a = e.target.files[0]; if (a) setLogo(await reduzirImagem(a, 240, 0.85)); };
  $('#semlogo', el).onclick = () => setLogo('');
  $$('[data-cor]', el).forEach(b => b.onclick = () => { f.cor.value = b.dataset.cor; $$('[data-cor]', el).forEach(x => x.classList.toggle('sel', x === b)); document.documentElement.style.setProperty('--pri', b.dataset.cor); $('#main').dataset.sujo = 1; });
  f.cor.oninput = () => document.documentElement.style.setProperty('--pri', f.cor.value);
  $$('[data-t]', el).forEach(b => b.onclick = () => { localStorage.setItem('revendaos:tema', b.dataset.t); $$('[data-t]', el).forEach(x => x.classList.toggle('ativo', x === b)); const t = b.dataset.t; const esc_ = t === 'escuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.dataset.theme = esc_ ? 'dark' : 'light'; });
  $('#testacosmos', el).onclick = async () => {
    const ean = soDigitos($('#eanteste', el).value); if (ean.length < 8) return toast('Digite um código de barras.', 'aviso');
    const antes = S.conta.config; S.conta.config = { ...cfg(), cosmosProxy: f.cosmosProxy.value.trim(), cosmosToken: f.cosmosToken.value.trim() };
    $('#rescosmos', el).textContent = 'Consultando…';
    const { buscarCosmos } = await import('./catalogo.js');
    const r = await buscarCosmos(ean, { silencioso: false });
    S.conta.config = antes;
    $('#rescosmos', el).textContent = !r ? 'Não encontrado (ou sem resposta).' : r.erro ? 'Erro: ' + (r.erro === 'limite' ? 'limite diário atingido' : 'token inválido') : `✓ ${r.nome}${r.marca ? ' — ' + r.marca : ''}`;
  };
  $('#testepix', el).onclick = e => {
    e.preventDefault();
    if (!f.pixChave.value.trim()) return toast('Informe a chave Pix.', 'aviso');
    const cod = pixPayload({ chave: f.pixChave.value, nome: f.pixNome.value || f.nome.value, cidade: f.pixCidade.value, valor: 1 });
    const m = modal({ titulo: 'Teste: Pix de R$ 1,00', corpo: `<div class="qr" id="q"></div><textarea rows="4" readonly class="cheio">${esc(cod)}</textarea><p class="mudo pq">Leia com o app do seu banco: deve aparecer seu nome e o valor de R$ 1,00. Não é preciso concluir o pagamento.</p>` });
    if (window.QRCode) new QRCode(m.$('#q'), { text: cod, width: 220, height: 220 });
  };
  $('#ok', el).onclick = async e => {
    e.preventDefault();
    const config = {
      ...cfg(), logo, cor: f.cor.value, telefone: soDigitos(f.telefone.value), pixChave: f.pixChave.value.trim(), pixNome: f.pixNome.value.trim(), pixCidade: f.pixCidade.value.trim(),
      metaMensal: parseNum(f.metaMensal.value), comissaoPadrao: parseNum(f.comissaoPadrao.value), diasValidade: parseNum(f.diasValidade.value) || 30,
      estoqueMin: f.estoqueMin.value === '' ? 0 : parseNum(f.estoqueMin.value), msgCobranca: f.msgCobranca.value.trim(), msgRecibo: f.msgRecibo.value.trim(),
      taxas: { debito: parseNum(f.tx_deb.value), credito: Array.from({ length: 12 }, (_, i) => parseNum(f['tx_c' + i].value)) },
      cosmosProxy: f.cosmosProxy.value.trim(), cosmosToken: f.cosmosToken.value.trim()
    };
    const nome = f.nome.value.trim() || 'Minha Revenda';
    const ok = await commit([{ op: 'upd', col: '@conta', data: { nome, config } }, ...opsPublicarLoja({ ...S.conta, nome, config })], 'Atualizou as configurações');
    if (ok) { S.conta = { ...S.conta, nome, config }; delete $('#main').dataset.sujo; toast('Configurações salvas.'); }
  };

  $('#bk', el).onclick = () => {
    const dados = { app: 'RevendaOS', versao: 1, exportadoEm: new Date().toISOString(), conta: { nome: S.conta.nome, config: S.conta.config, loja: S.conta.loja } };
    COLS.forEach(k => dados[k] = S.d[k]);
    baixar(`backup-${(S.conta.nome || 'revenda').replace(/\W+/g, '-')}-${hoje()}.json`, JSON.stringify(dados), 'application/json');
  };
  $('#rs', el).onclick = async () => {
    const txt = await lerArquivo('.json,application/json'); if (!txt) return;
    let d; try { d = JSON.parse(txt); } catch { return toast('Arquivo inválido.', 'erro'); }
    if (d.app !== 'RevendaOS') return toast('Este arquivo não é um backup do sistema.', 'erro');
    const n = COLS.reduce((s, k) => s + (d[k] || []).length, 0);
    if (!await ask(`Restaurar ${n} registros? Registros com o mesmo identificador serão substituídos; os demais são mantidos.`, { ok: 'Restaurar' })) return;
    const ops = [];
    COLS.forEach(k => (d[k] || []).forEach(({ id, ...x }) => ops.push({ op: 'set', col: k, id, data: x })));
    if (d.conta) ops.push({ op: 'upd', col: '@conta', data: { nome: d.conta.nome || S.conta.nome, config: d.conta.config || {} } });
    if (await commit(ops, 'Restaurou backup')) toast('Backup restaurado.');
  };
  $('#ex', el).onclick = async () => {
    if (!await ask('Adicionar produtos, clientes e vendas fictícios para você testar o sistema? Você pode excluí-los depois.', { ok: 'Gerar exemplos' })) return;
    if (await commit(exemplos(), 'Gerou dados de exemplo')) toast('Dados de exemplo criados! Veja o Início.');
  };
}

function exemplos() {
  const ops = []; const h = hoje();
  const P = [['Hidratante Corporal Ameixa 400ml', 'Marca A', 'Corpo e Banho', 32, 64.9], ['Perfume Floral Feminino 75ml', 'Marca A', 'Perfumaria', 89, 179.9], ['Batom Matte Vermelho', 'Marca B', 'Maquiagem', 14, 34.9],
    ['Base Líquida Tom 03', 'Marca B', 'Maquiagem', 28, 59.9], ['Desodorante Roll-on', 'Marca C', 'Corpo e Banho', 8, 17.9], ['Shampoo Reconstrução 300ml', 'Marca C', 'Cabelos', 15, 32.9],
    ['Máscara de Cílios', 'Marca B', 'Maquiagem', 19, 42.9], ['Colônia Masculina 100ml', 'Marca A', 'Perfumaria', 62, 129.9]];
  const prods = P.map(([nome, marca, categoria, custo, preco], i) => {
    const id = uid();
    const d = { nome, marca, categoria, custo, preco, codigo: '78900000000' + (10 + i), estoqueMin: 2, ativo: true, naLoja: true, lotes: [{ id: uid(), qtd: 3 + (i * 3) % 9, validade: addDias(h, 20 + i * 45), custo }], criadoEm: Date.now() };
    ops.push({ op: 'set', col: 'produtos', id, data: d }); return { id, ...d };
  });
  const C = [['Ana Paula Souza', '11987654321', addDias(h, 5).slice(5)], ['Bruna Lima', '11976543210', '03-22'], ['Carla Mendes', '11965432109', addDias(h, 12).slice(5)], ['Daniela Rocha', '11954321098', '11-02']];
  const clis = C.map(([nome, whatsapp, an]) => { const id = uid(); const d = { nome, whatsapp, aniversario: '1990-' + an, tags: [], limite: 500, criadoEm: Date.now() }; ops.push({ op: 'set', col: 'clientes', id, data: d }); return { id, ...d }; });
  let num = (S.d.vendas.reduce((m, v) => Math.max(m, v.numero || 0), 0));
  for (let k = 0; k < 14; k++) {
    const data = addDias(h, -Math.floor(k * 2.1)); const c = clis[k % clis.length]; const p = prods[k % prods.length]; const p2 = prods[(k * 3 + 1) % prods.length];
    const itens = [{ prodId: p.id, nome: p.nome, marca: p.marca, categoria: p.categoria, qtd: 1, preco: p.preco, custo: p.custo, baixas: [] }, { prodId: p2.id, nome: p2.nome, marca: p2.marca, categoria: p2.categoria, qtd: 1 + k % 2, preco: p2.preco, custo: p2.custo * (1 + k % 2), baixas: [] }];
    const total = itens.reduce((s, i) => s + i.qtd * i.preco, 0); const id = uid(); num++;
    const prazo = k % 3 === 0;
    ops.push({ op: 'set', col: 'vendas', id, data: { numero: num, data, clienteId: c.id, clienteNome: c.nome, clienteFone: c.whatsapp, itens, subtotal: total, desconto: 0, frete: 0, total, custoTotal: itens.reduce((s, i) => s + i.custo, 0), forma: prazo ? 'Crediário' : 'Pix', parcelas: prazo ? 2 : 1, vendedorUid: S.user.uid, vendedorNome: S.membro.nome, comissaoPct: 0, comissaoValor: 0, statusEntrega: k < 2 ? 'pendente' : 'entregue', origem: 'balcao', cancelada: false, criadoEm: Date.now() } });
    const base = { vendaId: id, numeroVenda: num, clienteId: c.id, clienteNome: c.nome, clienteFone: c.whatsapp, criadoEm: Date.now() };
    if (prazo) [0, 1].forEach(i => ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: i + 1, totalParcelas: 2, valor: Math.round(total / 2 * 100) / 100, pago: 0, vencimento: addMeses(addDias(data, 15), i), forma: 'Crediário', pagamentos: [] } }));
    else {
      ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: 1, totalParcelas: 1, valor: total, pago: total, vencimento: data, forma: 'Pix', pagamentos: [{ data, valor: total, forma: 'Pix' }] } });
      ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'receita', descricao: `Venda #${num} — ${c.nome}`, categoria: 'Vendas', valor: total, vencimento: data, pago: true, dataPagamento: data, forma: 'Pix', origem: 'venda', refId: id, criadoEm: Date.now() } });
    }
  }
  ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: 'Sacolas e embalagens', categoria: 'Embalagens', valor: 45, vencimento: addDias(h, -3), pago: true, dataPagamento: addDias(h, -3), origem: 'manual', criadoEm: Date.now() } });
  ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'despesa', descricao: 'Boleto pedido Marca A', categoria: 'Compra de mercadoria', valor: 620, vencimento: addDias(h, 6), pago: false, origem: 'manual', criadoEm: Date.now() } });
  return ops;
}
