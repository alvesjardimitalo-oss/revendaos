// Central de cobrança: parcelas, recebimentos, Pix e lembretes por WhatsApp
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtData, hoje, diasAte, mesAtual, waLink, preencher, pixPayload, copiar, fmtFone, reduzirImagem } from '../utils.js';
import { S, cfg, pode, icon, modal, toast, commit, cliPorId, saldoRec, statusRec, STATUS_REC, badge, vazio, FORMAS, navegar } from '../core.js';

let F = { aba: 'abertas', q: '', vis: 'parcelas' };

const ativos = () => S.d.recebiveis.filter(r => !r.cancelado);
const foneDe = r => { const c = cliPorId(r.clienteId); return c ? c.whatsapp : r.clienteFone; };

export function render(el) {
  const ed = pode('cobrancas', 'editar');
  const rs = ativos();
  const abertas = rs.filter(r => saldoRec(r) > 0.004);
  const venc = abertas.filter(r => r.vencimento < hoje());
  const prox7 = abertas.filter(r => { const d = diasAte(r.vencimento); return d >= 0 && d <= 7; });
  const recMes = S.d.recebiveis.flatMap(r => r.pagamentos || []).filter(p => (p.data || '').startsWith(mesAtual())).reduce((s, p) => s + p.valor, 0);

  let l = rs;
  if (F.aba === 'abertas') l = abertas;
  if (F.aba === 'vencidas') l = venc;
  if (F.aba === 'semana') l = prox7;
  if (F.aba === 'pagas') l = rs.filter(r => saldoRec(r) <= 0.004);
  if (F.q) { const n = norm(F.q); l = l.filter(r => norm(r.clienteNome).includes(n) || String(r.numeroVenda) === F.q.replace('#', '')); }
  l = [...l].sort((a, b) => F.aba === 'pagas' ? (b.vencimento > a.vencimento ? 1 : -1) : (a.vencimento > b.vencimento ? 1 : -1));

  const tabs = [['abertas', 'Em aberto', abertas.length], ['vencidas', 'Vencidas', venc.length], ['semana', 'Próximos 7 dias', prox7.length], ['pagas', 'Pagas', null], ['todas', 'Todas', null]];
  let corpo;
  if (F.vis === 'clientes' && F.aba !== 'pagas') {
    const g = {};
    l.forEach(r => { const k = r.clienteId || '_'; (g[k] = g[k] || { id: r.clienteId, nome: r.clienteNome || 'Sem cliente', rs: [] }).rs.push(r); });
    const gs = Object.values(g).map(x => ({ ...x, tot: r2(x.rs.reduce((s, r) => s + saldoRec(r), 0)), venc: r2(x.rs.filter(r => r.vencimento < hoje()).reduce((s, r) => s + saldoRec(r), 0)) })).sort((a, b) => b.venc - a.venc || b.tot - a.tot);
    corpo = gs.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Cliente</th><th class="n">Parcelas</th><th class="n">Vencido</th><th class="n">Total em aberto</th><th>Mais antiga</th><th></th></tr></thead><tbody>
      ${gs.map(x => `<tr><td><b>${esc(x.nome)}</b>${x.id && cliPorId(x.id) && cliPorId(x.id).whatsapp ? `<small class="bl mudo">${fmtFone(cliPorId(x.id).whatsapp)}</small>` : ''}</td><td class="n">${x.rs.length}</td>
        <td class="n">${x.venc ? `<b class="t-perigo">${brl(x.venc)}</b>` : '—'}</td><td class="n"><b>${brl(x.tot)}</b></td><td>${fmtData(x.rs.map(r => r.vencimento).sort()[0])}</td>
        <td class="acoes"><button class="btn sm wa" data-cobcli="${x.id}">${icon('wa')}Cobrar</button>${ed && x.id ? `<button class="btn sm" data-reccli="${x.id}">Receber</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : vazio('Nenhuma cobrança aqui. 🎉');
  } else {
    corpo = l.length ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Cliente</th><th>Venda</th><th>Parcela</th><th>Vencimento</th><th class="n">Valor</th><th class="n">Saldo</th><th>Status</th><th></th></tr></thead><tbody>
      ${l.map(r => { const s = statusRec(r), d = diasAte(r.vencimento); return `<tr>
        <td><b>${esc(r.clienteNome || 'Sem cliente')}</b></td><td><a href="#" data-venda="${r.vendaId}">#${r.numeroVenda}</a></td>
        <td>${r.consorcio ? 'Consórcio' : r.parcela === 0 ? 'Entrada' : r.parcela + '/' + r.totalParcelas}</td>
        <td>${fmtData(r.vencimento)}${s === 'vencido' ? `<small class="bl t-perigo">há ${-d} dia(s)</small>` : s === 'aberto' && d <= 7 ? `<small class="bl mudo">${d === 0 ? 'hoje' : 'em ' + d + ' dia(s)'}</small>` : ''}</td>
        <td class="n">${brl(r.valor)}</td><td class="n"><b>${brl(Math.max(0, saldoRec(r)))}</b></td><td>${badge(...STATUS_REC[s])}</td>
        <td class="acoes">${s !== 'pago' ? `${ed ? `<button class="btn sm" data-rec="${r.id}">Receber</button>` : ''}<button class="btn-ic" data-pix="${r.id}" title="Gerar Pix">${icon('pix')}</button><button class="btn-ic wa" data-cob="${r.id}" title="Cobrar no WhatsApp">${icon('wa')}</button>`
          : `<button class="btn-ic" data-hist="${r.id}" title="Pagamentos">${icon('eye')}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div>` : vazio(F.aba === 'vencidas' ? 'Nenhuma parcela vencida. 🎉' : 'Nada por aqui.');
  }

  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Total a receber</span><b>${brl(abertas.reduce((s, r) => s + saldoRec(r), 0))}</b><small>${abertas.length} parcela(s)</small></div>
    <div class="kpi ${venc.length ? 'alerta' : ''}"><span>Vencido</span><b>${brl(venc.reduce((s, r) => s + saldoRec(r), 0))}</b><small>${new Set(venc.map(r => r.clienteId)).size} cliente(s)</small></div>
    <div class="kpi"><span>Vence em 7 dias</span><b>${brl(prox7.reduce((s, r) => s + saldoRec(r), 0))}</b><small>${prox7.length} parcela(s)</small></div>
    <div class="kpi"><span>Recebido no mês</span><b>${brl(recMes)}</b></div>
  </div>
  <div class="abas">${tabs.map(([k, t, n]) => `<button data-aba="${k}" class="${F.aba === k ? 'ativo' : ''}">${t}${n ? ` <i>${n}</i>` : ''}</button>`).join('')}</div>
  <div class="barra">
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Buscar cliente ou nº da venda" value="${esc(F.q)}"></div>
    <div class="seg"><button data-vis="parcelas" class="${F.vis === 'parcelas' ? 'ativo' : ''}">Por parcela</button><button data-vis="clientes" class="${F.vis === 'clientes' ? 'ativo' : ''}">Por cliente</button></div>
  </div>
  ${!cfg().pixChave ? `<div class="aviso-box">${icon('pix')}<span>Cadastre sua chave Pix em <a href="#/config">Configurações</a> para gerar QR Code e "copia e cola" nas cobranças.</span></div>` : ''}
  ${corpo}`;

  const re = () => render(el);
  $$('[data-aba]', el).forEach(b => b.onclick = () => { F.aba = b.dataset.aba; re(); });
  $$('[data-vis]', el).forEach(b => b.onclick = () => { F.vis = b.dataset.vis; re(); });
  $('#q', el).oninput = e => { F.q = e.target.value; re(); const i = $('#q', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  const R = id => S.d.recebiveis.find(r => r.id === id);
  $$('[data-rec]', el).forEach(b => b.onclick = () => receber(R(b.dataset.rec)));
  $$('[data-pix]', el).forEach(b => b.onclick = () => enviarPix(R(b.dataset.pix)));
  $$('[data-cob]', el).forEach(b => b.onclick = () => cobrar(R(b.dataset.cob)));
  $$('[data-hist]', el).forEach(b => b.onclick = () => historico(R(b.dataset.hist)));
  $$('[data-cobcli]', el).forEach(b => b.onclick = () => cobrarCliente(b.dataset.cobcli));
  $$('[data-reccli]', el).forEach(b => b.onclick = () => receberCliente(b.dataset.reccli));
  $$('[data-venda]', el).forEach(a => a.onclick = async e => { e.preventDefault(); (await import('./vendas.js')).verVenda(a.dataset.venda); });
}

// ---------------- recebimento ----------------
function opsPagamento(lista, valor, data, forma, descricao, comprovante = '') {
  const ops = []; let resta = r2(valor);
  for (const r of lista) {
    if (resta <= 0) break;
    const s = saldoRec(r); if (s <= 0) continue;
    const v = Math.min(s, resta); resta = r2(resta - v);
    ops.push({ op: 'upd', col: 'recebiveis', id: r.id, data: { pago: r2((r.pago || 0) + v), pagamentos: [...(r.pagamentos || []), { data, valor: v, forma, por: S.membro.nome || '', ...(comprovante ? { comprovante } : {}) }] } });
    comprovante = ''; // anexa só na primeira parcela abatida
  }
  const usado = r2(valor - resta);
  if (usado > 0) ops.push({ op: 'set', col: 'lancamentos', id: uid(), data: { tipo: 'receita', descricao, categoria: 'Vendas', valor: usado, vencimento: data, pago: true, dataPagamento: data, forma, origem: 'recebimento', refId: lista[0] ? lista[0].vendaId : '', criadoEm: Date.now() } });
  return { ops, usado, sobra: resta };
}

export function receber(r) {
  if (!r) return;
  const outras = ativos().filter(x => x.vendaId === r.vendaId && x.id !== r.id && saldoRec(x) > 0).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const totVenda = r2(saldoRec(r) + outras.reduce((s, x) => s + saldoRec(x), 0));
  const m = modal({
    titulo: 'Registrar recebimento',
    corpo: `<p><b>${esc(r.clienteNome || 'Cliente')}</b> · venda #${r.numeroVenda} · parcela ${r.parcela === 0 ? 'entrada' : r.parcela + '/' + r.totalParcelas}<br>
      Saldo desta parcela: <b>${brl(saldoRec(r))}</b>${outras.length ? ` · saldo total da venda: <b>${brl(totVenda)}</b>` : ''}</p>
    <form class="form grid2" id="fr">
      <label>Valor recebido (R$)<input name="valor" inputmode="decimal" required value="${nfmt(saldoRec(r), 2)}"></label>
      <label>Data<input type="date" name="data" value="${hoje()}"></label>
      <label class="span2">Forma<select name="forma">${FORMAS.filter(x => !x.startsWith('Fiado')).map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="span2">Comprovante (foto ou print, opcional)<input type="file" accept="image/*" name="comp"><small class="mudo">Fica guardado junto do pagamento para consulta.</small></label>
      ${outras.length ? `<p class="span2 mudo pq">Se o valor for maior que o saldo da parcela, a diferença abate as próximas parcelas desta venda.</p>` : ''}
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Confirmar</button>`
  });
  const f = m.$('#fr'); f.forma.value = 'Pix';
  m.$('#ok').onclick = async () => {
    const v = parseNum(f.valor.value); if (v <= 0) return toast('Informe o valor.', 'aviso');
    const comp = f.comp.files[0] ? await reduzirImagem(f.comp.files[0], 900, 0.6) : '';
    const { ops, usado, sobra } = opsPagamento([r, ...outras], v, f.data.value || hoje(), f.forma.value, `Recebimento venda #${r.numeroVenda} — ${r.clienteNome || ''}`, comp);
    if (await commit(ops, `Recebeu ${brl(usado)} de ${r.clienteNome || 'cliente'} (venda #${r.numeroVenda})`)) {
      toast(`Recebimento de ${brl(usado)} registrado.` + (sobra > 0 ? ` ${brl(sobra)} excedente não aplicado.` : ''), sobra > 0 ? 'aviso' : 'ok'); m.fechar();
      reciboPagamento(r, usado);
    }
  };
}

export function receberCliente(clienteId) {
  const c = cliPorId(clienteId);
  const lista = ativos().filter(r => r.clienteId === clienteId && saldoRec(r) > 0).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const tot = r2(lista.reduce((s, r) => s + saldoRec(r), 0));
  if (!lista.length) return toast('Cliente sem saldo em aberto.');
  const m = modal({
    titulo: 'Receber de ' + (c ? c.nome : 'cliente'),
    corpo: `<p>Saldo total em aberto: <b>${brl(tot)}</b> em ${lista.length} parcela(s). O valor abate primeiro as parcelas mais antigas.</p>
    <form class="form grid2" id="fr"><label>Valor (R$)<input name="valor" inputmode="decimal" value="${nfmt(tot, 2)}"></label><label>Data<input type="date" name="data" value="${hoje()}"></label>
    <label class="span2">Forma<select name="forma">${FORMAS.filter(x => !x.startsWith('Fiado')).map(x => `<option>${x}</option>`).join('')}</select></label>
      <label class="span2">Comprovante (foto ou print, opcional)<input type="file" accept="image/*" name="comp"><small class="mudo">Fica guardado junto do pagamento para consulta.</small></label></form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Confirmar</button>`
  });
  const f = m.$('#fr'); f.forma.value = 'Pix';
  m.$('#ok').onclick = async () => {
    const v = parseNum(f.valor.value); if (v <= 0) return;
    const comp = f.comp.files[0] ? await reduzirImagem(f.comp.files[0], 900, 0.6) : '';
    const { ops, usado } = opsPagamento(lista, v, f.data.value || hoje(), f.forma.value, `Recebimento — ${c ? c.nome : ''}`, comp);
    if (await commit(ops, `Recebeu ${brl(usado)} de ${c ? c.nome : 'cliente'}`)) { toast(`Recebido ${brl(usado)}.`); m.fechar(); }
  };
}

function reciboPagamento(r, valor) {
  const fone = foneDe(r); if (!fone) return;
  const restante = r2(ativos().filter(x => x.clienteId === r.clienteId && x.clienteId).reduce((s, x) => s + Math.max(0, saldoRec(x)), 0) - valor);
  const m = modal({
    titulo: 'Enviar comprovante?',
    corpo: `<p>Deseja enviar a confirmação do pagamento para ${esc(r.clienteNome)} pelo WhatsApp?</p>`,
    rodape: `<button class="btn" data-fechar>Agora não</button><button class="btn wa" id="ok">${icon('wa')}Enviar</button>`
  });
  m.$('#ok').onclick = () => {
    window.open(waLink(fone, `Olá ${(r.clienteNome || '').split(' ')[0]}! Recebi seu pagamento de ${brl(valor)} referente à compra nº ${r.numeroVenda}. Muito obrigada! 💖${restante > 0.004 ? `\nSaldo restante: ${brl(restante)}.` : '\nSua conta está quitada ✅'}`), '_blank');
    m.fechar();
  };
}

function historico(r) {
  const m = modal({
    titulo: 'Pagamentos da parcela',
    corpo: (r.pagamentos || []).length ? `<table class="tabela mini"><thead><tr><th>Data</th><th>Forma</th><th class="n">Valor</th><th>Por</th><th>Comprovante</th></tr></thead><tbody>${r.pagamentos.map((p, k) => `<tr><td>${fmtData(p.data)}</td><td>${esc(p.forma)}</td><td class="n">${brl(p.valor)}</td><td>${esc(p.por || '')}</td><td>${p.comprovante ? `<button class="btn sm" data-comp="${k}">${icon('eye')}Ver</button>` : '—'}</td></tr>`).join('')}</tbody></table>` : '<p class="mudo">Sem registros.</p>'
  });
  m.$$('[data-comp]').forEach(b => b.onclick = () => verComprovante(r.pagamentos[+b.dataset.comp].comprovante));
}
export function verComprovante(img) { modal({ titulo: 'Comprovante', corpo: `<img src="${img}" style="width:100%;border-radius:10px">` }); }

// ---------------- Pix ----------------
export function codigoPix(valor, txid) {
  const c = cfg(); if (!c.pixChave) return '';
  return pixPayload({ chave: c.pixChave, nome: c.pixNome || S.conta.nome, cidade: c.pixCidade || '', valor, txid });
}
export function enviarPix(r, valorFixo) {
  const c = cfg();
  if (!c.pixChave) { toast('Cadastre sua chave Pix em Configurações.', 'aviso'); navegar('config'); return; }
  let valor = valorFixo ?? Math.max(0, saldoRec(r));
  const m = modal({
    titulo: 'Cobrança via Pix',
    corpo: `<div class="pix-box">
      <div id="qr" class="qr"></div>
      <label class="form">Valor (R$)<input id="v" inputmode="decimal" value="${nfmt(valor, 2)}"></label>
      <label class="form">Pix copia e cola<textarea id="cod" rows="4" readonly></textarea></label>
      <p class="mudo pq">Chave: ${esc(c.pixChave)} · Recebedor: ${esc(c.pixNome || S.conta.nome)}</p></div>`,
    rodape: `<button class="btn" id="cp">${icon('copy')}Copiar código</button><span class="grow"></span>${r && foneDe(r) ? `<button class="btn wa" id="wa">${icon('wa')}Enviar no WhatsApp</button>` : ''}`
  });
  const gerar = () => {
    valor = parseNum(m.$('#v').value);
    const cod = codigoPix(valor, r ? 'VENDA' + r.numeroVenda + 'P' + r.parcela : '');
    m.$('#cod').value = cod;
    const q = m.$('#qr'); q.innerHTML = '';
    if (window.QRCode) new QRCode(q, { text: cod, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
    else q.innerHTML = '<p class="mudo pq">QR Code indisponível offline — use o copia e cola.</p>';
  };
  m.$('#v').oninput = gerar; gerar();
  m.$('#cp').onclick = async () => { await copiar(m.$('#cod').value); toast('Código Pix copiado!'); };
  const w = m.$('#wa');
  if (w) w.onclick = () => window.open(waLink(foneDe(r), `Olá ${(r.clienteNome || '').split(' ')[0]}! Segue o Pix de ${brl(valor)} referente à compra nº ${r.numeroVenda}:\n\n${m.$('#cod').value}\n\n(É só copiar e colar no app do banco, na opção Pix Copia e Cola.)`), '_blank');
}

// ---------------- lembretes ----------------
const TPL_COB = 'Olá {cliente}! Tudo bem? 😊\nPassando para lembrar da parcela {parcela} da sua compra nº {numero}, no valor de {valor}, {situacao} {vencimento}.\n{pix}\nQualquer dúvida, estou à disposição!\n{loja}';
export function cobrar(r) {
  const fone = foneDe(r);
  if (!fone) return toast('Cliente sem WhatsApp cadastrado.', 'aviso');
  const s = statusRec(r), cod = codigoPix(saldoRec(r));
  const msg = preencher(cfg().msgCobranca || TPL_COB, {
    cliente: (r.clienteNome || '').split(' ')[0], parcela: r.parcela === 0 ? 'de entrada' : `${r.parcela}/${r.totalParcelas}`, numero: r.numeroVenda,
    valor: brl(saldoRec(r)), vencimento: fmtData(r.vencimento), situacao: s === 'vencido' ? 'que venceu em' : 'com vencimento em',
    pix: cod ? `\nPix copia e cola:\n${cod}\n` : '', loja: S.conta.nome || ''
  });
  window.open(waLink(fone, msg), '_blank');
  commit([{ op: 'upd', col: 'recebiveis', id: r.id, data: { ultimaCobranca: Date.now() } }]);
}
export function cobrarCliente(clienteId) {
  const c = cliPorId(clienteId);
  const lista = ativos().filter(r => (r.clienteId || '') === (clienteId || '') && saldoRec(r) > 0).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const fone = c ? c.whatsapp : (lista[0] && lista[0].clienteFone);
  if (!fone) return toast('Cliente sem WhatsApp cadastrado.', 'aviso');
  const tot = r2(lista.reduce((s, r) => s + saldoRec(r), 0)), cod = codigoPix(tot);
  const linhas = lista.map(r => `• Compra nº ${r.numeroVenda} (${r.parcela === 0 ? 'entrada' : r.parcela + '/' + r.totalParcelas}) — ${brl(saldoRec(r))} ${r.vencimento < hoje() ? '⚠️ venceu' : 'vence'} ${fmtData(r.vencimento)}`).join('\n');
  window.open(waLink(fone, `Olá ${(c ? c.nome : lista[0].clienteNome || '').split(' ')[0]}! Tudo bem? 😊\nSegue o resumo das suas parcelas em aberto:\n\n${linhas}\n\n*Total: ${brl(tot)}*${cod ? `\n\nPix copia e cola (valor total):\n${cod}` : ''}\n\nQualquer dúvida, estou à disposição!`), '_blank');
}
