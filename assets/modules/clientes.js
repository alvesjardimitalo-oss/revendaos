// Clientes: cadastro, ficha, aniversariantes, histórico e crédito
import { $, $$, esc, brl, nfmt, parseNum, uid, r2, norm, fmtData, hoje, waLink, fmtFone, toCSV, parseCSV, baixar, lerArquivo, soDigitos } from '../utils.js';
import { S, pode, icon, modal, ask, toast, commit, cliPorId, abertoCliente, saldoRec, statusRec, STATUS_REC, badge, vazio, datalist, chip, corEtiqueta, avatar } from '../core.js';

let F = { q: '', tag: '', filtro: '', vis: (() => { try { return localStorage.getItem('revendaos:clivis') || 'cartoes'; } catch { return 'cartoes'; } })() };
const sepEtiquetas = s => String(s || '').split(/\s*[|;\n]\s*/).map(t => t.trim()).filter(Boolean);

const vendasCli = id => S.d.vendas.filter(v => v.clienteId === id && !v.cancelada);
const mesAniv = c => c.aniversario ? c.aniversario.slice(5, 7) : '';
export const aniversariantes = (mes = hoje().slice(5, 7)) => S.d.clientes.filter(c => mesAniv(c) === mes).sort((a, b) => a.aniversario.slice(8) > b.aniversario.slice(8) ? 1 : -1);

export function render(el) {
  const ed = pode('clientes', 'editar');
  const tags = [...new Set(S.d.clientes.flatMap(c => c.tags || []))].sort();
  const stats = {};
  S.d.vendas.forEach(v => { if (v.cancelada || !v.clienteId) return; const s = stats[v.clienteId] = stats[v.clienteId] || { tot: 0, n: 0, ult: '' }; s.tot += v.total; s.n++; if (v.data > s.ult) s.ult = v.data; });
  let l = S.d.clientes.filter(c => {
    if (F.tag && !(c.tags || []).includes(F.tag)) return false;
    if (F.filtro === 'aniv' && mesAniv(c) !== hoje().slice(5, 7)) return false;
    if (F.filtro === 'debito' && abertoCliente(c.id) <= 0) return false;
    if (F.filtro === 'inativos') { const u = (stats[c.id] || {}).ult; if (u && u >= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)) return false; }
    if (F.q) { const n = norm(F.q); if (!(norm(c.nome).includes(n) || norm(c.cidade).includes(n) || (c.tags || []).some(t => norm(t).includes(n)) || soDigitos(c.whatsapp).includes(soDigitos(F.q) || '#') || norm(c.email).includes(n))) return false; }
    return true;
  }).sort((a, b) => a.nome.localeCompare(b.nome));
  const anivs = aniversariantes();

  const mob = `<div class="so-mob">
    <div class="mtopo"><div class="campo-ic mbusca">${icon('search')}<input type="search" id="qm" placeholder="Buscar por clientes" value="${esc(F.q)}"></div>
      <button class="mfiltro ${F.filtro || F.tag ? 'on' : ''}" id="mf">${icon('filtro')}</button></div>
    ${l.length ? `<div class="mlista">${l.map(c => { const ab = abertoCliente(c.id); return `<div class="mrow" data-id="${c.id}">${avatar(c.nome, 'grande')}<div class="mrow-m"><b class="mnome">${esc(c.nome)}</b><small>${c.whatsapp ? fmtFone(c.whatsapp) : 'Sem número'}${ab > 0 ? ` · <span class="t-perigo">deve ${brl(ab)}</span>` : ''}</small>${(c.tags || []).length ? `<div class="cli-tags mini">${c.tags.map(chip).join('')}</div>` : ''}</div></div>`; }).join('')}</div>`
      : `<div class="mvazio">${icon('users')}<p>Nenhum cliente encontrado</p></div>`}
    ${ed ? `<button class="fab" id="fabc">${icon('plus')}Adicionar cliente</button>` : ''}
  </div>`;
  el.innerHTML = mob + `<div class="so-desk">
  <div class="kpis">
    <div class="kpi"><span>Clientes</span><b>${S.d.clientes.length}</b></div>
    <div class="kpi" data-f="aniv"><span>Aniversariantes do mês</span><b>${anivs.length}</b><small>${anivs.slice(0, 3).map(c => esc(c.nome.split(' ')[0]) + ' ' + c.aniversario.slice(8) + '/' + c.aniversario.slice(5, 7)).join(', ')}</small></div>
    <div class="kpi" data-f="debito"><span>Com saldo em aberto</span><b>${S.d.clientes.filter(c => abertoCliente(c.id) > 0).length}</b></div>
    <div class="kpi" data-f="inativos"><span>Sem comprar há 90 dias</span><b>${S.d.clientes.filter(c => { const u = (stats[c.id] || {}).ult; return !u || u < new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10); }).length}</b></div>
  </div>
  <div class="barra filtros-m">
    ${ed ? `<button class="btn pri" id="novo">${icon('plus')}Novo cliente</button>` : ''}
    <div class="campo-ic grow">${icon('search')}<input type="search" id="q" placeholder="Nome, WhatsApp, cidade ou etiqueta" value="${esc(F.q)}"></div>
    <select id="filtro"><option value="">Todos</option><option value="aniv" ${F.filtro === 'aniv' ? 'selected' : ''}>Aniversariantes do mês</option><option value="debito" ${F.filtro === 'debito' ? 'selected' : ''}>Com saldo em aberto</option><option value="inativos" ${F.filtro === 'inativos' ? 'selected' : ''}>Sem comprar há 90 dias</option></select>
    <select id="tag"><option value="">Todas as etiquetas</option>${tags.map(t => `<option ${F.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
    <div class="seg"><button data-vis="cartoes" class="${F.vis === 'cartoes' ? 'ativo' : ''}">Cartões</button><button data-vis="lista" class="${F.vis === 'lista' ? 'ativo' : ''}">Lista</button></div>
    ${ed ? `<button class="btn" id="imp" title="Importar CSV">${icon('up')}</button>` : ''}<button class="btn" id="exp" title="Exportar CSV">${icon('down')}</button>
  </div>
  ${l.length && F.vis === 'cartoes' ? `<div class="cli-grade">${l.map(c => { const ab = abertoCliente(c.id); return `<div class="cli-card clicavel" data-id="${c.id}">
      <span class="cli-av">${esc((c.nome || '?')[0].toUpperCase())}</span><b>${esc(c.nome)}</b>
      <small>${icon('wa', 'mini')} ${c.whatsapp ? fmtFone(c.whatsapp) : '-'}</small><small>${icon('store', 'mini')} ${esc(c.cidade || '-')}</small>
      ${ab > 0 ? `<small class="t-perigo">em aberto ${brl(ab)}</small>` : ''}
      <div class="cli-tags">${(c.tags || []).map(chip).join('')}</div></div>`; }).join('')}</div>` : ''}
  ${l.length && F.vis === 'lista' ? `<div class="tabela-w"><table class="tabela"><thead><tr><th>Cliente</th><th>Aniversário</th><th>Etiquetas</th><th class="n">Comprou</th><th>Última compra</th><th class="n">Em aberto</th><th></th></tr></thead><tbody>
    ${l.map(c => { const s = stats[c.id] || { tot: 0, n: 0 }; const ab = abertoCliente(c.id); return `<tr data-id="${c.id}" class="clicavel">
      <td><b>${esc(c.nome)}</b><small class="bl mudo">${fmtFone(c.whatsapp) || esc(c.email || '')}</small></td>
      <td>${c.aniversario ? c.aniversario.slice(8) + '/' + c.aniversario.slice(5, 7) + (mesAniv(c) === hoje().slice(5, 7) ? ' ' + icon('gift', 'mini t-pri') : '') : '—'}</td>
      <td>${(c.tags || []).map(chip).join(' ')}</td>
      <td class="n">${brl(s.tot)}<small class="bl mudo">${s.n} compra(s)</small></td><td>${fmtData(s.ult)}</td>
      <td class="n">${ab > 0 ? `<b class="${S.d.recebiveis.some(r => r.clienteId === c.id && statusRec(r) === 'vencido') ? 't-perigo' : ''}">${brl(ab)}</b>` : '—'}</td>
      <td class="acoes">${c.whatsapp ? `<a class="btn-ic wa" href="${waLink(c.whatsapp, 'Olá ' + c.nome.split(' ')[0] + '! ')}" target="_blank" title="WhatsApp">${icon('wa')}</a>` : ''}</td></tr>`; }).join('')}
  </tbody></table></div>` : !l.length ? vazio(S.d.clientes.length ? 'Nenhum cliente com esses filtros.' : 'Cadastre suas clientes para controlar compras, aniversários e cobranças.') : ''}</div>`;

  const re = () => render(el);
  ['q', 'qm'].forEach(k => $('#' + k, el).oninput = e => { F.q = e.target.value; re(); const i = $('#' + k, el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
  $('#mf', el).onclick = () => el.classList.toggle('mostrar-filtros');
  const fc = $('#fabc', el); if (fc) fc.onclick = () => formCliente();
  $$('.mrow[data-id]', el).forEach(r => r.onclick = () => fichaCliente(r.dataset.id));
  $('#filtro', el).onchange = e => { F.filtro = e.target.value; re(); };
  $('#tag', el).onchange = e => { F.tag = e.target.value; re(); };
  $$('[data-vis]', el).forEach(b => b.onclick = () => { F.vis = b.dataset.vis; try { localStorage.setItem('revendaos:clivis', F.vis); } catch { } re(); });
  $$('.kpi[data-f]', el).forEach(k => k.onclick = () => { F.filtro = k.dataset.f; re(); });
  if (ed) { $('#novo', el).onclick = () => formCliente(); $('#imp', el).onclick = importar; }
  $('#exp', el).onclick = () => baixar(`clientes-${hoje()}.csv`, toCSV(l, [{ label: 'nome', key: 'nome' }, { label: 'whatsapp', key: 'whatsapp' }, { label: 'email', key: 'email' }, { label: 'aniversario', key: 'aniversario' }, { label: 'endereco', key: 'endereco' }, { label: 'cidade', key: 'cidade' }, { label: 'etiquetas', val: c => (c.tags || []).join(' | ') }, { label: 'limite', val: c => nfmt(c.limite || 0, 2) }, { label: 'em_aberto', val: c => nfmt(abertoCliente(c.id), 2) }, { label: 'obs', key: 'obs' }]));
  $$('tr[data-id], .cli-card[data-id]', el).forEach(tr => tr.onclick = e => { if (e.target.closest('a')) return; fichaCliente(tr.dataset.id); });
}

export function formCliente(c, aoSalvar) {
  const novo = !c; c = c || { id: uid() };
  const m = modal({
    titulo: novo ? 'Novo cliente' : 'Editar cliente',
    corpo: `<form class="form grid2" id="fc">
      <label class="span2">Nome *<input name="nome" required value="${esc(c.nome || '')}"></label>
      <label>WhatsApp<input name="whatsapp" inputmode="tel" placeholder="(11) 91234-5678" value="${esc(fmtFone(c.whatsapp || ''))}"></label>
      <label>Aniversário<input type="date" name="aniversario" value="${c.aniversario || ''}"></label>
      <label>E-mail<input name="email" type="email" value="${esc(c.email || '')}"></label>
      <label>CPF<input name="cpf" inputmode="numeric" value="${esc(c.cpf || '')}"></label>
      <label>Endereço<input name="endereco" value="${esc(c.endereco || '')}" placeholder="Rua, número, bairro"></label>
      <label>Cidade<input name="cidade" list="dl-cid" value="${esc(c.cidade || '')}"></label>
      <div class="span2"><span class="rot">Etiquetas</span><div class="etq-box" id="etqs"></div>
        <div class="campo-bt"><input id="netq" list="dl-tags" placeholder="Digite ou escolha uma etiqueta e tecle Enter"><button type="button" class="btn" id="addetq">${icon('plus')}</button></div>
        <small class="mudo">Cada etiqueta é inteira, pode ter vírgula (ex.: Consorcio G1 - 35,00 - Julho 2025 a Abril 2026).</small></div>
      ${datalist('dl-cid', S.d.clientes.map(x => x.cidade))}
      <label>Limite de crédito (R$)<input name="limite" inputmode="decimal" value="${c.limite ? nfmt(c.limite, 2) : ''}" placeholder="sem limite"></label>
      <label class="span2">Observações / preferências<textarea name="obs" rows="2">${esc(c.obs || '')}</textarea></label>
      ${datalist('dl-tags', S.d.clientes.flatMap(x => x.tags || []))}
    </form>`,
    rodape: `${!novo ? `<button class="btn perigo-txt" id="del">${icon('trash')}Excluir</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fc');
  let etqs = [...(c.tags || [])];
  const desenharEtq = () => { m.$('#etqs').innerHTML = etqs.length ? etqs.map((t, k) => `<span class="chip-etq" style="background:${corEtiqueta(t)}">${esc(t)}<button type="button" data-rx="${k}">×</button></span>`).join('') : '<span class="mudo pq">Nenhuma etiqueta.</span>'; m.$$('[data-rx]').forEach(b => b.onclick = () => { etqs.splice(+b.dataset.rx, 1); desenharEtq(); }); };
  const addEtq = () => { const v = m.$('#netq').value.trim(); if (v && !etqs.includes(v)) etqs.push(v); m.$('#netq').value = ''; desenharEtq(); };
  m.$('#netq').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addEtq(); } });
  m.$('#netq').addEventListener('change', () => { if (S.d.clientes.some(x => (x.tags || []).includes(m.$('#netq').value.trim()))) addEtq(); });
  m.$('#addetq').onclick = addEtq; desenharEtq();
  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    if (m.$('#netq').value.trim()) addEtq();
    const d = {
      nome: f.nome.value.trim(), whatsapp: soDigitos(f.whatsapp.value), aniversario: f.aniversario.value, email: f.email.value.trim(), cpf: f.cpf.value.trim(),
      endereco: f.endereco.value.trim(), cidade: f.cidade.value.trim(), tags: etqs, limite: parseNum(f.limite.value), obs: f.obs.value.trim(),
      criadoEm: c.criadoEm || Date.now(), atualizadoEm: Date.now()
    };
    if (await commit([{ op: 'set', col: 'clientes', id: c.id, data: d }], (novo ? 'Cadastrou' : 'Editou') + ' cliente ' + d.nome)) { toast('Cliente salvo.'); m.fechar(); aoSalvar && aoSalvar({ id: c.id, ...d }); }
  };
  const del = m.$('#del');
  if (del) del.onclick = async () => {
    if (abertoCliente(c.id) > 0) return toast('Este cliente tem saldo em aberto. Quite ou cancele as parcelas antes.', 'erro');
    if (!await ask(`Excluir ${c.nome}? O histórico de vendas é mantido.`, { ok: 'Excluir', perigo: true })) return;
    if (await commit([{ op: 'del', col: 'clientes', id: c.id }], 'Excluiu cliente ' + c.nome)) { toast('Cliente excluído.'); m.fechar(); }
  };
}

export async function fichaCliente(id) {
  const c = cliPorId(id); if (!c) return;
  const vs = vendasCli(id).sort((a, b) => b.data > a.data ? 1 : -1);
  const tot = vs.reduce((s, v) => s + v.total, 0), ab = abertoCliente(id);
  const recs = S.d.recebiveis.filter(r => r.clienteId === id && !r.cancelado && saldoRec(r) > 0).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const prods = {}; vs.forEach(v => v.itens.forEach(i => { prods[i.nome] = (prods[i.nome] || 0) + i.qtd; }));
  const top = Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const m = modal({
    titulo: c.nome, largo: true,
    corpo: `<div class="det-topo">
      <div><small class="mudo">WhatsApp</small><b>${fmtFone(c.whatsapp) || '—'}</b></div>
      <div><small class="mudo">Aniversário</small><b>${c.aniversario ? fmtData(c.aniversario).slice(0, 5) : '—'}</b></div>
      <div><small class="mudo">Total comprado</small><b>${brl(tot)}</b></div>
      <div><small class="mudo">Compras · ticket</small><b>${vs.length} · ${brl(vs.length ? tot / vs.length : 0)}</b></div>
      <div><small class="mudo">Em aberto</small><b class="${ab ? 't-perigo' : ''}">${brl(ab)}</b>${c.limite ? `<small class="bl mudo">limite ${brl(c.limite)}</small>` : ''}</div>
    </div>
    ${c.endereco || c.cidade ? `<p>${icon('store', 'mini')} ${esc([c.endereco, c.cidade].filter(Boolean).join(' — '))}</p>` : ''}${c.obs ? `<p class="mudo">${esc(c.obs)}</p>` : ''}
    ${(c.tags || []).length ? `<div class="cli-tags" style="margin-bottom:10px">${c.tags.map(chip).join('')}</div>` : ''}
    ${recs.length ? `<div class="sub-h"><h4>Parcelas em aberto</h4></div><table class="tabela mini"><tbody>${recs.map(r => `<tr><td>#${r.numeroVenda} · ${r.parcela === 0 ? 'entrada' : r.parcela + '/' + r.totalParcelas}</td><td>${fmtData(r.vencimento)}</td><td class="n">${brl(saldoRec(r))}</td><td>${badge(...STATUS_REC[statusRec(r)])}</td></tr>`).join('')}</tbody></table>` : ''}
    ${top.length ? `<div class="sub-h"><h4>Mais compra</h4></div><p>${top.map(([n, q]) => `${esc(n)} <span class="mudo">(${nfmt(q)})</span>`).join(' · ')}</p>` : ''}
    <div class="sub-h"><h4>Histórico de compras</h4></div>
    ${vs.length ? `<table class="tabela mini"><tbody>${vs.slice(0, 30).map(v => `<tr class="clicavel" data-v="${v.id}"><td>#${v.numero}</td><td>${fmtData(v.data)}</td><td>${v.itens.length} item(ns)</td><td class="n">${brl(v.total)}</td></tr>`).join('')}</tbody></table>` : '<p class="mudo">Nenhuma compra ainda.</p>'}`,
    rodape: `${pode('clientes', 'editar') ? `<button class="btn" id="ed">${icon('edit')}Editar</button>` : ''}<span class="grow"></span>
      ${ab > 0 ? `<button class="btn wa" id="cob">${icon('wa')}Cobrar</button>${pode('cobrancas', 'editar') ? `<button class="btn" id="rec">Receber</button>` : ''}` : (c.whatsapp ? `<a class="btn wa" target="_blank" href="${waLink(c.whatsapp, 'Olá ' + c.nome.split(' ')[0] + '! ')}">${icon('wa')}WhatsApp</a>` : '')}
      ${pode('vendas', 'editar') ? `<button class="btn pri" id="vender">${icon('cart')}Nova venda</button>` : ''}`
  });
  const on = (s, fn) => { const b = m.$(s); if (b) b.onclick = fn; };
  on('#ed', () => { m.fechar(); formCliente(c); });
  on('#cob', async () => (await import('./cobrancas.js')).cobrarCliente(id));
  on('#rec', async () => { m.fechar(); (await import('./cobrancas.js')).receberCliente(id); });
  on('#vender', async () => { m.fechar(); (await import('./vendas.js')).novaVenda({ clienteId: id }); });
  m.$$('[data-v]').forEach(tr => tr.onclick = async () => { m.fechar(); (await import('./vendas.js')).verVenda(tr.dataset.v); });
}

async function importar() {
  const txt = await lerArquivo('.csv,text/csv'); if (!txt) return;
  await importarClientesTexto(txt);
}
export async function importarClientesTexto(txt, silencioso = false) {
  const rows = parseCSV(txt); const ops = [];
  for (const r of rows) {
    const nome = r.nome || r.cliente; if (!nome) continue;
    const fone = soDigitos(r.whatsapp || r.telefone || r.celular || '');
    const ex = S.d.clientes.find(c => (fone && c.whatsapp === fone) || norm(c.nome) === norm(nome));
    let aniv = r.aniversario || r.nascimento || '';
    if (/^\d{2}\/\d{2}(\/\d{4})?$/.test(aniv)) { const [d, mm, y] = aniv.split('/'); aniv = `${y || '2000'}-${mm}-${d}`; }
    ops.push({ op: 'set', col: 'clientes', id: ex ? ex.id : uid(), data: { ...(ex || {}), nome, whatsapp: fone || (ex || {}).whatsapp || '', email: r.email || (ex || {}).email || '', aniversario: aniv || (ex || {}).aniversario || '', endereco: r.endereco || (ex || {}).endereco || '', cidade: r.cidade || (ex || {}).cidade || '', tags: [...new Set([...((ex || {}).tags || []), ...sepEtiquetas(r.etiquetas || r.tags)])], limite: parseNum(r.limite), obs: r.obs || '', criadoEm: (ex || {}).criadoEm || Date.now() } });
  }
  ops.forEach(o => delete o.data.id);
  if (!ops.length) { toast('Nenhuma linha válida. Use as colunas: nome; whatsapp; cidade; email; aniversario; endereco; etiquetas (separe várias com |); limite; obs', 'erro'); return 0; }
  const n = ops.length;
  if (await commit(ops, `Importou ${n} clientes`)) { if (!silencioso) toast(`${n} cliente(s) importados.`); return n; }
  return 0;
}
