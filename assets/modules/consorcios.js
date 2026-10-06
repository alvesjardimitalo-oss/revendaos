// Consórcios: grupos (G1, G2…), participantes, parcela mensal por vigência, pagamentos com comprovante,
// cobrança no WhatsApp, contemplação (sorteio ou ordem) e etiqueta padronizada no cadastro da cliente.
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, hoje, fmtData, waLink, reduzirImagem, soDigitos } from '../utils.js';
import { S, cfg, pode, icon, modal, ask, toast, commit, badge, vazio, cliPorId, FORMAS } from '../core.js';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MES_IDX = Object.fromEntries(MESES.map((m, i) => [norm(m), i + 1]));
let F = { grupo: '', q: '' };

// ---------------- datas e nome padrão ----------------
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
export const mesesEntre = (ini, fim) => { const out = []; let [y, m] = ini.split('-').map(Number); const [fy, fm] = fim.split('-').map(Number); while (y < fy || (y === fy && m <= fm)) { out.push(ym(y, m)); m++; if (m > 12) { m = 1; y++; } if (out.length > 60) break; } return out; };
const nomeMes = k => { const [y, m] = k.split('-'); return `${MESES[+m - 1]} ${y}`; };
const curto = k => { const [y, m] = k.split('-'); return `${MESES[+m - 1].slice(0, 3)}/${y.slice(2)}`; };
export const nomePadrao = g => `Consorcio G${g.grupo} - ${nfmt(g.valor, 2)} - ${nomeMes(g.inicio)} a ${nomeMes(g.fim)}`;
const mesAtual = () => hoje().slice(0, 7);

// Lê etiquetas no padrão "Consorcio G1 - 35,00 - Julho 2025 a Abril 2026" (aceita sem "a", com ponto no fim etc.)
export function lerEtiqueta(t) {
  const n = norm(t).replace(/\.$/, '');
  const m = n.match(/^cons[oó]rcio\s*g\s*(\d+)\s*-?\s*([\d.,]+)\s*-?\s*([a-zç]+)\s*(?:de\s*)?(\d{4})\s*(?:a|ate|até|-)?\s*([a-zç]+)\s*(?:de\s*)?(\d{4})/);
  if (!m) return null;
  const mi = MES_IDX[m[3]], mf = MES_IDX[m[5]];
  if (!mi || !mf) return null;
  return { grupo: +m[1], valor: parseNum(m[2]), inicio: ym(+m[4], mi), fim: ym(+m[6], mf) };
}

// ---------------- situação das parcelas ----------------
const dia = g => Number(g.diaVencimento) || 10;
const vencimento = (g, mes) => `${mes}-${String(Math.min(dia(g), 28)).padStart(2, '0')}`;
const pago = (g, cid, mes) => !!(((g.pagamentos || {})[cid] || {})[mes]);
export function situacao(g, cid) {
  const ms = mesesEntre(g.inicio, g.fim), h = hoje();
  const pagos = ms.filter(m => pago(g, cid, m));
  const atrasados = ms.filter(m => !pago(g, cid, m) && vencimento(g, m) < h);
  return { total: ms.length, pagos: pagos.length, atrasados, valorAtraso: r2(atrasados.length * g.valor), restante: r2((ms.length - pagos.length) * g.valor) };
}
window.__consAtrasos = () => atrasosGerais();
export const creditoGrupo = g => r2(g.valor * mesesEntre(g.inicio, g.fim).length);
// créditos ainda não usados de uma cliente (para abater numa venda)
export function creditosCliente(cid) {
  const l = [];
  S.d.consorcios.forEach(g => (g.participantes || []).forEach(p => { if (p.clienteId === cid && !p.resgate) l.push({ g, p, credito: creditoGrupo(g) }); }));
  return l.sort((a, b) => a.g.grupo - b.g.grupo);
}
export const mesNoGrupo = (g, mes) => mes < g.inicio ? g.inicio : mes > g.fim ? g.fim : mes;
// operação que marca o crédito como usado numa venda
export function opsResgate(g, cid, r) {
  const lista = (g.participantes || []).map(p => p.clienteId === cid ? { ...p, resgate: r, entregue: true, mesContemplado: p.mesContemplado || mesNoGrupo(g, r.data.slice(0, 7)) } : p);
  g.participantes = lista;
  return { op: 'upd', col: 'consorcios', id: g.id, data: { participantes: lista } };
}
export function atrasosGerais() {
  const l = [];
  S.d.consorcios.filter(g => g.status !== 'encerrado').forEach(g => (g.participantes || []).forEach(p => { const s = situacao(g, p.clienteId); if (s.atrasados.length) l.push({ g, p, s }); }));
  return l;
}

// ---------------- tela ----------------
export function render(el) {
  const ed = pode('consorcios', 'editar');
  const gs = [...S.d.consorcios].sort((a, b) => a.grupo - b.grupo);
  const etiquetasSemGrupo = semGrupo();
  if (F.grupo && !gs.some(g => g.id === F.grupo)) F.grupo = '';
  const at = atrasosGerais();
  const mes = mesAtual();
  const recMes = gs.reduce((s, g) => s + Object.values(g.pagamentos || {}).reduce((a, pm) => a + (pm[mes] ? g.valor : 0), 0), 0);
  const esperadoMes = gs.filter(g => mesesEntre(g.inicio, g.fim).includes(mes)).reduce((s, g) => s + (g.participantes || []).length * g.valor, 0);

  el.innerHTML = `
  <div class="kpis">
    <div class="kpi"><span>Grupos ativos</span><b>${gs.filter(g => g.status !== 'encerrado').length}</b><small>${gs.reduce((s, g) => s + (g.participantes || []).length, 0)} participantes</small></div>
    <div class="kpi"><span>Recebido em ${MESES[+mes.slice(5) - 1].toLowerCase()}</span><b>${brl(recMes)}</b><small>de ${brl(esperadoMes)} esperados</small></div>
    <div class="kpi ${at.length ? 'alerta' : ''}"><span>Parcelas em atraso</span><b>${brl(at.reduce((s, x) => s + x.s.valorAtraso, 0))}</b><small>${at.length} participante(s)</small></div>
  </div>
  ${etiquetasSemGrupo.length && ed ? `<div class="aviso-box destaque">${icon('tag')}<span>Encontrei <b>${etiquetasSemGrupo.length}</b> consórcio(s) nas etiquetas das suas clientes que ainda não viraram grupo: ${etiquetasSemGrupo.map(x => esc(x.etiqueta)).join(' · ')}. <a href="#" id="importar">Criar os grupos automaticamente</a></span></div>` : ''}
  <div class="barra">${ed ? `<button class="btn pri" id="novo">${icon('plus')}Novo grupo</button>` : ''}<span class="grow"></span>${at.length ? `<button class="btn wa" id="cobrartodos">${icon('wa')}Cobrar atrasados (${at.length})</button>` : ''}</div>
  ${gs.length ? `<div class="grupos">${gs.map(g => {
    const ms = mesesEntre(g.inicio, g.fim); const idx = ms.indexOf(mes);
    const ps = g.participantes || []; const atr = ps.filter(p => situacao(g, p.clienteId).atrasados.length).length;
    const cont = ps.filter(p => p.mesContemplado).length;
    return `<button class="grupo-card ${F.grupo === g.id ? 'ativo' : ''}" data-g="${g.id}">
      <div class="gc-topo"><b>G${g.grupo}</b><span>${brl(g.valor)}/mês</span>${g.status === 'encerrado' ? badge('Encerrado', 'mudo') : idx < 0 && mes < g.inicio ? badge('A iniciar', 'info') : idx < 0 ? badge('Vigência terminada', 'aviso') : badge(`Mês ${idx + 1} de ${ms.length}`, 'ok')}</div>
      <small>${nomeMes(g.inicio)} a ${nomeMes(g.fim)}</small>
      <div class="gc-pe"><span>${ps.length} participante(s)</span><span>${cont} contemplada(s)</span>${atr ? `<span class="t-perigo">${atr} em atraso</span>` : ''}</div>
    </button>`;
  }).join('')}</div><div id="det"></div>` : vazio('Cadastre seus grupos de consórcio: o sistema controla as parcelas de cada participante, cobra no WhatsApp e registra quem já foi contemplada.', ed ? `<button class="btn pri" onclick="document.getElementById('novo').click()">${icon('plus')}Criar primeiro grupo</button>` : '')}`;

  const re = () => render(el);
  if (ed) { const n = $('#novo', el); if (n) n.onclick = () => formGrupo(); }
  const imp = $('#importar', el); if (imp) imp.onclick = e => { e.preventDefault(); importarEtiquetas(etiquetasSemGrupo); };
  const ct = $('#cobrartodos', el); if (ct) ct.onclick = () => cobrarLista(at);
  $$('[data-g]', el).forEach(b => b.onclick = () => { F.grupo = F.grupo === b.dataset.g ? '' : b.dataset.g; re(); });
  if (!F.grupo && gs.length) F.grupo = (gs.find(g => g.status !== 'encerrado') || gs[0]).id, $(`[data-g="${F.grupo}"]`, el)?.classList.add('ativo');
  const det = $('#det', el); if (det && F.grupo) detalhe(det, S.d.consorcios.find(g => g.id === F.grupo), ed, re);
}

function detalhe(el, g, ed, re) {
  const ms = mesesEntre(g.inicio, g.fim), h = hoje(), mes = mesAtual();
  const ps = [...(g.participantes || [])].sort((a, b) => (a.cota || 999) - (b.cota || 999) || a.nome.localeCompare(b.nome));
  const n = norm(F.q);
  const lista = ps.filter(p => !n || norm(p.nome).includes(n));
  const credito = r2(g.valor * ms.length);
  el.innerHTML = `<div class="card" style="margin-top:14px">
    <div class="card-h"><h4>${esc(nomePadrao(g))}</h4><span class="mudo pq">Vence todo dia ${dia(g)} · crédito de ${brl(credito)} por participante · contemplação por ${g.contemplacao === 'ordem' ? 'ordem' : 'sorteio'}</span></div>
    <div class="barra">
      ${ed ? `<button class="btn pri sm" id="addp">${icon('plus')}Participante</button><button class="btn sm" id="contemplar">${icon('gift')}Contemplar ${ms.includes(mes) ? curto(mes) : ''}</button><button class="btn sm" id="editg">${icon('edit')}Editar grupo</button><button class="btn sm" id="ate">${icon('check')}Marcar pagos até…</button>` : ''}
      <button class="btn sm wa" id="cobrarg">${icon('wa')}Cobrar atrasados</button>
      <span class="grow"></span><div class="campo-ic">${icon('search')}<input type="search" id="qp" placeholder="Buscar participante" value="${esc(F.q)}"></div>
    </div>
    ${lista.length ? `<div class="tabela-w"><table class="tabela mini grade-cons"><thead><tr><th>Participante</th>${ms.map(m => `<th class="ta-c ${m === mes ? 'mes-atual' : ''}">${curto(m)}</th>`).join('')}<th class="n">Pago</th><th class="n">Em atraso</th><th></th></tr></thead><tbody>
    ${lista.map(p => {
      const s = situacao(g, p.clienteId); const c = cliPorId(p.clienteId);
      return `<tr data-c="${p.clienteId}"><td><b>${p.cota ? `<span class="cota">${p.cota}</span>` : ''}${esc(p.nome)}</b>${p.mesContemplado ? `<small class="bl t-pri">${icon('gift', 'mini')} contemplada em ${curto(p.mesContemplado)}${p.entregue ? ' · entregue' : ' · a entregar'}</small>` : ''}${p.resgate ? `<small class="bl t-ok">crédito usado em ${fmtData(p.resgate.data)}${p.resgate.numero ? ' · venda #' + p.resgate.numero : ''}</small>` : ''}${!c ? '<small class="bl t-perigo">cliente excluída</small>' : ''}</td>
        ${ms.map(m => { const pg = pago(g, p.clienteId, m); const atr = !pg && vencimento(g, m) < h; return `<td class="ta-c"><button class="cel ${pg ? 'pg' : atr ? 'atr' : 'fut'} ${m === p.mesContemplado ? 'contem' : ''}" data-m="${m}" title="${nomeMes(m)}${pg ? ' · pago em ' + fmtData(g.pagamentos[p.clienteId][m].data) : atr ? ' · em atraso' : ''}" ${ed ? '' : 'disabled'}>${pg ? '✓' : atr ? '!' : ''}</button></td>`; }).join('')}
        <td class="n">${s.pagos}/${s.total}</td><td class="n">${s.valorAtraso ? `<b class="t-perigo">${brl(s.valorAtraso)}</b>` : '—'}</td>
        <td class="acoes">${s.atrasados.length ? `<button class="btn-ic wa" data-cob title="Cobrar">${icon('wa')}</button>` : ''}${ed ? `<button class="btn-ic" data-ep title="Editar participante">${icon('edit')}</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="mudo pq">Toque num mês para registrar o pagamento (com comprovante) ou desfazer. ✓ pago · ! em atraso · ${icon('gift', 'mini')} contorno no mês da contemplação.</p>` : vazio('Nenhum participante neste grupo ainda.')}
  </div>`;
  const qp = $('#qp', el); qp.oninput = e => { F.q = e.target.value; detalhe(el, g, ed, re); const i = $('#qp', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  $('#cobrarg', el).onclick = () => cobrarLista(atrasosGerais().filter(x => x.g.id === g.id));
  if (ed) {
    $('#addp', el).onclick = () => addParticipantes(g);
    $('#editg', el).onclick = () => formGrupo(g);
    $('#contemplar', el).onclick = () => contemplar(g);
    $('#ate', el).onclick = () => marcarAte(g);
  }
  $$('tr[data-c]', el).forEach(tr => {
    const cid = tr.dataset.c, p = (g.participantes || []).find(x => x.clienteId === cid);
    $$('[data-m]', tr).forEach(b => b.onclick = () => clicarMes(g, p, b.dataset.m));
    const cb = $('[data-cob]', tr); if (cb) cb.onclick = () => cobrar(g, p);
    const ep = $('[data-ep]', tr); if (ep) ep.onclick = () => editarParticipante(g, p);
  });
}

// ---------------- grupos ----------------
function formGrupo(g) {
  const novo = !g;
  const prox = (S.d.consorcios.reduce((m, x) => Math.max(m, x.grupo || 0), 0) || 0) + 1;
  g = g ? structuredClone(g) : { id: uid(), grupo: prox, valor: 35, inicio: mesAtual(), fim: mesesEntre(mesAtual(), '2099-12')[9], diaVencimento: 10, contemplacao: 'sorteio', participantes: [], pagamentos: {}, status: 'ativo' };
  const m = modal({
    titulo: novo ? 'Novo grupo de consórcio' : 'Editar grupo',
    corpo: `<form class="form grid2" id="fg">
      <label>Número do grupo (G)<input name="grupo" inputmode="numeric" required value="${g.grupo}"></label>
      <label>Valor da parcela (R$)<input name="valor" inputmode="decimal" required value="${nfmt(g.valor, 2)}"></label>
      <label>Primeiro mês<input type="month" name="inicio" required value="${g.inicio}"></label>
      <label>Último mês<input type="month" name="fim" required value="${g.fim}"></label>
      <label>Dia do vencimento<input name="dia" inputmode="numeric" value="${dia(g)}"></label>
      <label>Contemplação<select name="contemplacao"><option value="sorteio" ${g.contemplacao !== 'ordem' ? 'selected' : ''}>Sorteio</option><option value="ordem" ${g.contemplacao === 'ordem' ? 'selected' : ''}>Por ordem (número da cota)</option></select></label>
      ${!novo ? `<label class="chk span2"><input type="checkbox" name="enc" ${g.status === 'encerrado' ? 'checked' : ''}> Grupo encerrado</label>` : ''}
      <div class="span2 aviso-box destaque" id="prev"></div>
    </form>`,
    rodape: `${!novo ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fg');
  const ler = () => ({ ...g, grupo: parseInt(f.grupo.value) || 0, valor: parseNum(f.valor.value), inicio: f.inicio.value, fim: f.fim.value, diaVencimento: parseInt(f.dia.value) || 10, contemplacao: f.contemplacao.value, status: f.enc && f.enc.checked ? 'encerrado' : 'ativo' });
  const prev = () => { const x = ler(); if (!x.inicio || !x.fim || x.fim < x.inicio) { m.$('#prev').textContent = 'Confira a vigência.'; return; } const n = mesesEntre(x.inicio, x.fim).length; m.$('#prev').innerHTML = `Etiqueta das participantes: <b>${esc(nomePadrao(x))}</b><br>${n} parcelas de ${brl(x.valor)} = crédito de ${brl(x.valor * n)}`; };
  f.addEventListener('input', prev); prev();
  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    const x = ler(); if (x.fim < x.inicio) return toast('O último mês deve ser depois do primeiro.', 'aviso');
    if (S.d.consorcios.some(o => o.id !== g.id && o.grupo === x.grupo)) return toast(`Já existe o grupo G${x.grupo}.`, 'erro');
    const ops = [{ op: 'set', col: 'consorcios', id: g.id, data: semId(x) }];
    if (!novo) { const antiga = nomePadrao(g), nova = nomePadrao(x); if (antiga !== nova) (x.participantes || []).forEach(p => ops.push(...opsEtiqueta(p.clienteId, nova, antiga))); }
    if (await commit(ops, `${novo ? 'Criou' : 'Editou'} o consórcio G${x.grupo}`)) { toast('Grupo salvo.'); F.grupo = g.id; m.fechar(); }
  };
  const del = m.$('#del');
  if (del) del.onclick = async () => {
    if (!await ask(`Excluir o grupo G${g.grupo}? As etiquetas das participantes também são removidas. Os recebimentos já lançados no financeiro continuam lá.`, { perigo: true, ok: 'Excluir' })) return;
    const ops = [{ op: 'del', col: 'consorcios', id: g.id }, ...(g.participantes || []).flatMap(p => opsEtiqueta(p.clienteId, null, nomePadrao(g)))];
    if (await commit(ops, `Excluiu o consórcio G${g.grupo}`)) { toast('Grupo excluído.'); m.fechar(); }
  };
}
const semId = x => { const { id, ...r } = x; return r; };

// etiqueta no cadastro da cliente: coloca a nova e tira a antiga (e variações do mesmo grupo)
function opsEtiqueta(cid, nova, antiga) {
  const c = cliPorId(cid); if (!c) return [];
  let tags = (c.tags || []).filter(t => t !== antiga && (!nova || !mesmoGrupo(t, nova)));
  if (nova && !tags.includes(nova)) tags.push(nova);
  c.tags = tags; // reflete já na memória para operações em sequência
  return [{ op: 'upd', col: 'clientes', id: cid, data: { tags } }];
}
const mesmoGrupo = (t, nova) => { const a = lerEtiqueta(t), b = lerEtiqueta(nova); return a && b && a.grupo === b.grupo; };

// ---------------- participantes ----------------
function addParticipantes(g) {
  const ja = new Set((g.participantes || []).map(p => p.clienteId));
  let q = ''; const sel = new Set();
  const m = modal({
    titulo: `Adicionar participantes ao G${g.grupo}`, largo: true,
    corpo: `<div class="barra"><div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Buscar cliente"></div><button class="btn" id="nova">${icon('plus')}Cadastrar cliente</button></div><div id="l" class="tabela-w" style="max-height:50vh;overflow:auto"></div>`,
    rodape: `<span class="grow mudo pq" id="cont"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Adicionar</button>`
  });
  const desenhar = () => {
    const n = norm(q);
    const l = S.d.clientes.filter(c => !ja.has(c.id) && (!n || norm(c.nome).includes(n) || soDigitos(c.whatsapp).includes(soDigitos(q) || '#'))).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 300);
    m.$('#l').innerHTML = l.length ? `<table class="tabela mini"><tbody>${l.map(c => `<tr class="clicavel" data-id="${c.id}"><td style="width:30px"><input type="checkbox" ${sel.has(c.id) ? 'checked' : ''}></td><td><b>${esc(c.nome)}</b><small class="bl mudo">${(c.tags || []).filter(t => lerEtiqueta(t)).map(t => esc(t.split(' - ')[0])).join(', ')}</small></td></tr>`).join('')}</tbody></table>` : '<p class="mudo pq" style="padding:12px">Nenhuma cliente encontrada.</p>';
    m.$('#cont').textContent = sel.size ? `${sel.size} selecionada(s)` : '';
  };
  m.$('#q').oninput = e => { q = e.target.value; desenhar(); };
  m.$('#l').onclick = e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; sel.has(tr.dataset.id) ? sel.delete(tr.dataset.id) : sel.add(tr.dataset.id); desenhar(); };
  m.$('#nova').onclick = async () => (await import('./clientes.js')).formCliente(null, c => { S.d.clientes.push(c); sel.add(c.id); desenhar(); });
  m.$('#ok').onclick = async () => {
    if (!sel.size) return toast('Selecione ao menos uma cliente.', 'aviso');
    let cota = (g.participantes || []).reduce((mx, p) => Math.max(mx, p.cota || 0), 0);
    const novos = [...sel].map(id => ({ clienteId: id, nome: (cliPorId(id) || {}).nome || '', cota: ++cota, mesContemplado: '', entregue: false }));
    const ops = [{ op: 'upd', col: 'consorcios', id: g.id, data: { participantes: [...(g.participantes || []), ...novos] } }, ...novos.flatMap(p => opsEtiqueta(p.clienteId, nomePadrao(g)))];
    if (await commit(ops, `Adicionou ${novos.length} participante(s) ao consórcio G${g.grupo}`)) { toast('Participantes adicionadas e etiquetadas.'); m.fechar(); }
  };
  desenhar();
}

function editarParticipante(g, p) {
  const ms = mesesEntre(g.inicio, g.fim);
  const m = modal({
    titulo: p.nome,
    corpo: `<form class="form grid2" id="fp">
      <label>Número da cota<input name="cota" inputmode="numeric" value="${p.cota || ''}"></label>
      <label>Mês da contemplação<select name="mc"><option value="">Ainda não contemplada</option>${ms.map(x => `<option value="${x}" ${p.mesContemplado === x ? 'selected' : ''}>${nomeMes(x)}</option>`).join('')}</select></label>
      <label class="chk span2"><input type="checkbox" name="ent" ${p.entregue ? 'checked' : ''}> Prêmio / crédito já entregue</label>
      ${p.resgate ? `<label class="chk span2"><input type="checkbox" name="res" checked> Crédito já usado em ${fmtData(p.resgate.data)}${p.resgate.numero ? ' (venda #' + p.resgate.numero + ')' : ''} — desmarque para liberar o crédito de novo</label>` : ''}
      <label class="span2">Observações<textarea name="obs" rows="2">${esc(p.obs || '')}</textarea></label>
    </form>`,
    rodape: `<button class="btn perigo-txt" id="rm">${icon('trash')}Tirar do grupo</button><span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fp');
  m.$('#ok').onclick = async () => {
    const lista = (g.participantes || []).map(x => x.clienteId === p.clienteId ? { ...x, cota: parseInt(f.cota.value) || null, mesContemplado: f.mc.value, entregue: f.ent.checked, obs: f.obs.value.trim(), resgate: f.res && !f.res.checked ? null : (x.resgate || null) } : x);
    if (await commit([{ op: 'upd', col: 'consorcios', id: g.id, data: { participantes: lista } }], `Atualizou ${p.nome} no consórcio G${g.grupo}`)) { toast('Salvo.'); m.fechar(); }
  };
  m.$('#rm').onclick = async () => {
    if (!await ask(`Tirar ${p.nome} do G${g.grupo}? A etiqueta sai do cadastro. Os pagamentos já registrados ficam no financeiro.`, { perigo: true, ok: 'Tirar' })) return;
    const pg = { ...(g.pagamentos || {}) }; delete pg[p.clienteId];
    const ops = [{ op: 'upd', col: 'consorcios', id: g.id, data: { participantes: (g.participantes || []).filter(x => x.clienteId !== p.clienteId), pagamentos: pg } }, ...opsEtiqueta(p.clienteId, null, nomePadrao(g))];
    if (await commit(ops, `Tirou ${p.nome} do consórcio G${g.grupo}`)) { toast('Participante removida.'); m.fechar(); }
  };
}

// ---------------- pagamentos ----------------
function clicarMes(g, p, mes) {
  const reg = ((g.pagamentos || {})[p.clienteId] || {})[mes];
  if (reg) {
    const m = modal({
      titulo: `${p.nome} · ${nomeMes(mes)}`,
      corpo: `<p>Pago em <b>${fmtData(reg.data)}</b> · ${esc(reg.forma || '')} · ${brl(reg.valor)}</p>${reg.lancId && (S.d.lancamentos.find(l => l.id === reg.lancId) || {}).comprovante ? `<img src="${S.d.lancamentos.find(l => l.id === reg.lancId).comprovante}" style="width:100%;border-radius:10px">` : '<p class="mudo pq">Sem comprovante anexado.</p>'}`,
      rodape: `<button class="btn perigo-txt" id="desf">${icon('undo')}Desfazer pagamento</button><span class="grow"></span><button class="btn" data-fechar>Fechar</button>`
    });
    m.$('#desf').onclick = async () => {
      const pg = structuredClone(g.pagamentos || {}); delete pg[p.clienteId][mes];
      const ops = [{ op: 'upd', col: 'consorcios', id: g.id, data: { pagamentos: pg } }]; if (reg.lancId) ops.push({ op: 'del', col: 'lancamentos', id: reg.lancId });
      if (await commit(ops, `Desfez pagamento de ${p.nome} (G${g.grupo}, ${nomeMes(mes)})`)) { toast('Pagamento desfeito.'); m.fechar(); }
    };
    return;
  }
  // meses em aberto até este, para pagar vários de uma vez
  const abertos = mesesEntre(g.inicio, mes).filter(x => !pago(g, p.clienteId, x));
  const m = modal({
    titulo: `Receber parcela · ${p.nome}`,
    corpo: `<form class="form grid2" id="fr">
      <label class="span2">Meses pagos<select name="qtd">${abertos.map((x, i) => `<option value="${i + 1}" ${x === mes && i === abertos.length - 1 ? '' : ''}>${i + 1 === 1 ? nomeMes(abertos[0]) : `${i + 1} parcelas (${curto(abertos[0])} a ${curto(abertos[i])})`}</option>`).join('')}</select><small class="mudo">Começa pela parcela mais antiga em aberto.</small></label>
      <label>Data<input type="date" name="data" value="${hoje()}"></label>
      <label>Forma<select name="forma">${FORMAS.filter(x => !x.startsWith('Crediário')).map(x => `<option ${x === 'Pix' ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="span2">Comprovante (opcional)<input type="file" accept="image/*" name="comp"></label>
      <div class="span2 total-box"><span>Total</span><b id="tot"></b></div>
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Confirmar</button>`
  });
  const f = m.$('#fr');
  f.qtd.value = String(abertos.indexOf(mes) + 1 || 1);
  const tot = () => m.$('#tot').textContent = brl(g.valor * +f.qtd.value); f.qtd.onchange = tot; tot();
  m.$('#ok').onclick = async () => {
    const n = +f.qtd.value, meses = abertos.slice(0, n), data = f.data.value || hoje();
    const comp = f.comp.files[0] ? await reduzirImagem(f.comp.files[0], 900, 0.6) : '';
    const lancId = uid();
    const pg = structuredClone(g.pagamentos || {}); pg[p.clienteId] = pg[p.clienteId] || {};
    meses.forEach(x => pg[p.clienteId][x] = { data, valor: g.valor, forma: f.forma.value, lancId });
    const ops = [
      { op: 'upd', col: 'consorcios', id: g.id, data: { pagamentos: pg } },
      { op: 'set', col: 'lancamentos', id: lancId, data: { tipo: 'receita', descricao: `Consórcio G${g.grupo} — ${p.nome} (${meses.map(curto).join(', ')})`, categoria: 'Consórcio', valor: r2(g.valor * n), vencimento: data, pago: true, dataPagamento: data, forma: f.forma.value, origem: 'consorcio', refId: g.id, ...(comp ? { comprovante: comp } : {}), criadoEm: Date.now() } }
    ];
    if (await commit(ops, `Recebeu ${brl(g.valor * n)} de ${p.nome} (consórcio G${g.grupo})`)) {
      toast(`${n} parcela(s) registrada(s).`); m.fechar();
      const c = cliPorId(p.clienteId);
      if (c && c.whatsapp) {
        const s = situacao({ ...g, pagamentos: pg }, p.clienteId);
        const mm = modal({ titulo: 'Enviar confirmação?', corpo: `<p>Mandar a confirmação do pagamento para ${esc(p.nome)} no WhatsApp?</p>`, rodape: `<button class="btn" data-fechar>Agora não</button><button class="btn wa" id="w">${icon('wa')}Enviar</button>` });
        mm.$('#w').onclick = () => { window.open(waLink(c.whatsapp, `Oi ${p.nome.split(' ')[0]}! Recebi seu pagamento do Consórcio G${g.grupo} referente a ${meses.map(nomeMes).join(', ')} (${brl(g.valor * n)}). Obrigada! 💖\nVocê já pagou ${s.pagos} de ${s.total} parcelas.`), '_blank'); mm.fechar(); };
      }
    }
  };
}

// Marca de uma vez as parcelas pagas antes de usar o sistema (sem lançar no financeiro)
function marcarAte(g) {
  const ms = mesesEntre(g.inicio, g.fim); const ps = g.participantes || [];
  const ult = ms.filter(x => vencimento(g, x) < hoje()).pop() || ms[0];
  const m = modal({
    titulo: `Marcar parcelas pagas · G${g.grupo}`,
    corpo: `<form class="form" id="fm">
      <p class="mudo pq">Use para lançar o que já foi pago antes do sistema. As parcelas ficam marcadas como pagas, sem entrar no financeiro. Depois é só tocar no mês de quem estiver devendo para desfazer.</p>
      <label>Pagas até<select name="ate">${ms.map(x => `<option value="${x}" ${x === ult ? 'selected' : ''}>${nomeMes(x)}</option>`).join('')}</select></label>
      <div class="lista-chk">${ps.map(p => `<label class="chk"><input type="checkbox" name="p" value="${p.clienteId}" checked> ${esc(p.nome)}</label>`).join('')}</div>
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">${icon('check')}Marcar</button>`
  });
  const f = m.$('#fm');
  m.$('#ok').onclick = async () => {
    const ate = f.ate.value, sel = m.$$('input[name=p]:checked').map(i => i.value);
    const pg = structuredClone(g.pagamentos || {}); let n = 0;
    sel.forEach(cid => { pg[cid] = pg[cid] || {}; ms.filter(x => x <= ate).forEach(x => { if (!pg[cid][x]) { pg[cid][x] = { data: vencimento(g, x), valor: g.valor, forma: 'Antes do sistema', importado: true }; n++; } }); });
    if (!n) return toast('Nada para marcar.', 'aviso');
    if (await commit([{ op: 'upd', col: 'consorcios', id: g.id, data: { pagamentos: pg } }], `Marcou ${n} parcela(s) anteriores no consórcio G${g.grupo}`)) { toast(`${n} parcela(s) marcada(s).`); m.fechar(); }
  };
}

// ---------------- cobrança ----------------
async function msgCobranca(g, p, s) {
  const { codigoPix } = await import('./cobrancas.js');
  const pix = codigoPix(s.valorAtraso, `CONSG${g.grupo}`);
  return `Oi ${p.nome.split(' ')[0]}! Tudo bem? 😊\nPassando para lembrar do Consórcio G${g.grupo} (${brl(g.valor)}/mês):\n${s.atrasados.map(m => `• ${nomeMes(m)} — ${brl(g.valor)}`).join('\n')}\n\n*Total em aberto: ${brl(s.valorAtraso)}*${pix ? `\n\nPix copia e cola:\n${pix}` : ''}\n\nDepois é só me mandar o comprovante. Obrigada!`;
}
async function cobrar(g, p) {
  const c = cliPorId(p.clienteId); if (!c || !c.whatsapp) return toast('Cliente sem WhatsApp cadastrado.', 'aviso');
  window.open(waLink(c.whatsapp, await msgCobranca(g, p, situacao(g, p.clienteId))), '_blank');
}
function cobrarLista(lista) {
  if (!lista.length) return toast('Ninguém em atraso. 🎉');
  const feitos = new Set();
  const m = modal({ titulo: 'Cobrar parcelas em atraso', largo: true, corpo: '<div id="l"></div><p class="mudo pq">Clique em cada uma: a mensagem abre pronta no WhatsApp, com os meses em aberto e o Pix do valor total.</p>' });
  const des = () => {
    m.$('#l').innerHTML = `<div class="tabela-w"><table class="tabela mini"><tbody>${lista.map((x, k) => `<tr><td><b>${esc(x.p.nome)}</b><small class="bl mudo">G${x.g.grupo} · ${x.s.atrasados.map(curto).join(', ')}</small></td><td class="n"><b class="t-perigo">${brl(x.s.valorAtraso)}</b></td><td class="acoes">${feitos.has(k) ? badge('Enviado', 'ok') : `<button class="btn sm wa" data-k="${k}">${icon('wa')}Cobrar</button>`}</td></tr>`).join('')}</tbody></table></div>`;
    m.$$('[data-k]').forEach(b => b.onclick = async () => { const x = lista[+b.dataset.k]; await cobrar(x.g, x.p); feitos.add(+b.dataset.k); des(); });
  };
  des();
}

// ---------------- contemplação ----------------
function contemplar(g) {
  const ms = mesesEntre(g.inicio, g.fim); const mes = ms.includes(mesAtual()) ? mesAtual() : ms.find(x => !(g.participantes || []).some(p => p.mesContemplado === x)) || ms[0];
  const ja = (g.participantes || []).find(p => p.mesContemplado === mes);
  const aptas = (g.participantes || []).filter(p => !p.mesContemplado);
  if (!aptas.length) return toast('Todas as participantes já foram contempladas.', 'aviso');
  let escolhida = null;
  const m = modal({
    titulo: `Contemplação do G${g.grupo}`,
    corpo: `<form class="form" id="fc"><label>Mês<select name="mes">${ms.map(x => `<option value="${x}" ${x === mes ? 'selected' : ''}>${nomeMes(x)}${(g.participantes || []).some(p => p.mesContemplado === x) ? ' (já tem contemplada)' : ''}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" name="emdia" checked> Só participantes com as parcelas em dia</label></form>
      ${ja ? `<div class="aviso-box">${icon('alert')}<span>${esc(ja.nome)} já foi contemplada neste mês.</span></div>` : ''}
      <div class="sorteio" id="res"><span class="mudo">${g.contemplacao === 'ordem' ? 'Pela ordem, a próxima é a de menor número de cota.' : 'Clique em sortear.'}</span></div>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn" id="sort">${icon('gift')}${g.contemplacao === 'ordem' ? 'Ver próxima' : 'Sortear'}</button><button class="btn pri" id="ok" disabled>Confirmar contemplação</button>`
  });
  const f = m.$('#fc');
  m.$('#sort').onclick = () => {
    const l = aptas.filter(p => !f.emdia.checked || !situacao(g, p.clienteId).atrasados.length);
    if (!l.length) return toast('Nenhuma participante apta com esse filtro.', 'aviso');
    escolhida = g.contemplacao === 'ordem' ? [...l].sort((a, b) => (a.cota || 999) - (b.cota || 999))[0] : l[Math.floor(Math.random() * l.length)];
    m.$('#res').innerHTML = `<div class="sorteada">${icon('gift')}<b>${esc(escolhida.nome)}</b>${escolhida.cota ? `<small>cota ${escolhida.cota}</small>` : ''}<small>crédito de ${brl(g.valor * ms.length)}</small></div>`;
    m.$('#ok').disabled = false;
  };
  m.$('#ok').onclick = async () => {
    const lista = (g.participantes || []).map(p => p.clienteId === escolhida.clienteId ? { ...p, mesContemplado: f.mes.value } : p);
    if (await commit([{ op: 'upd', col: 'consorcios', id: g.id, data: { participantes: lista } }], `Contemplou ${escolhida.nome} no consórcio G${g.grupo} (${nomeMes(f.mes.value)})`)) {
      toast(`${escolhida.nome} contemplada!`); m.fechar();
      const c = cliPorId(escolhida.clienteId);
      if (c && c.whatsapp) window.open(waLink(c.whatsapp, `Parabéns, ${escolhida.nome.split(' ')[0]}! 🎉 Você foi contemplada no Consórcio G${g.grupo} em ${nomeMes(f.mes.value)}! Seu crédito é de ${brl(g.valor * ms.length)}. Vamos escolher seus produtos? 💖`), '_blank');
    }
  };
}

// ---------------- importar das etiquetas ----------------
export function semGrupo() {
  const mapa = new Map();
  S.d.clientes.forEach(c => (c.tags || []).forEach(t => { const x = lerEtiqueta(t); if (!x) return; if (S.d.consorcios.some(g => g.grupo === x.grupo)) return; const k = x.grupo; if (!mapa.has(k)) mapa.set(k, { ...x, etiqueta: t, clientes: [] }); mapa.get(k).clientes.push(c); }));
  return [...mapa.values()].sort((a, b) => a.grupo - b.grupo);
}
export async function importarEtiquetas(lista, silencioso = false) {
  if (!silencioso && !await ask(`Criar ${lista.length} grupo(s) a partir das etiquetas (${lista.map(x => `G${x.grupo}: ${x.clientes.length} cliente(s)`).join(', ')})? As etiquetas serão padronizadas no formato do sistema.`, { ok: 'Criar grupos' })) return;
  const ops = [];
  for (const x of lista) {
    const id = uid();
    const g = { grupo: x.grupo, valor: x.valor, inicio: x.inicio, fim: x.fim, diaVencimento: 10, contemplacao: 'sorteio', status: 'ativo', pagamentos: {}, participantes: x.clientes.sort((a, b) => a.nome.localeCompare(b.nome)).map((c, i) => ({ clienteId: c.id, nome: c.nome, cota: i + 1, mesContemplado: '', entregue: false })), criadoEm: Date.now() };
    ops.push({ op: 'set', col: 'consorcios', id, data: g });
    x.clientes.forEach(c => ops.push(...opsEtiqueta(c.id, nomePadrao(g), x.etiqueta)));
  }
  if (await commit(ops, `Criou ${lista.length} consórcio(s) a partir das etiquetas`)) { if (!silencioso) toast(`${lista.length} grupo(s) criado(s). Agora marque os meses já pagos de cada participante.`); return lista.length; }
  return 0;
}
