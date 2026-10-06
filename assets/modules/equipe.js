// Equipe: usuários, convites, permissões por módulo, metas e histórico de atividades
import { $, $$, esc, brl, nfmt, parseNum, fmtDataHora, norm, mesAtual } from '../utils.js';
import { S, MODS, icon, modal, ask, toast, commit, badge, vazio, vendasValidas } from '../core.js';

const MOD_PERM = MODS.filter(m => !['dashboard', 'catalogo', 'equipe', 'config'].includes(m.id));
export const PERM_VENDEDOR = { vendas: 'editar', clientes: 'editar', cobrancas: 'editar', produtos: 'ver', loja: 'ver', promocoes: 'ver', consorcios: 'editar', compras: 'nenhum', financeiro: 'nenhum', relatorios: 'nenhum' };
let qLog = '';

const gradePerm = (p = {}) => `<table class="tabela mini perm"><thead><tr><th>Módulo</th><th>Sem acesso</th><th>Ver</th><th>Ver e editar</th></tr></thead><tbody>
  ${MOD_PERM.map(m => `<tr><td>${m.nome}</td>${['nenhum', 'ver', 'editar'].map(n => `<td><input type="radio" name="p_${m.id}" value="${n}" ${(p[m.id] || 'nenhum') === n ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table>`;
const lerPerm = root => Object.fromEntries(MOD_PERM.map(m => [m.id, ($(`input[name=p_${m.id}]:checked`, root) || {}).value || 'nenhum']));

export function render(el) {
  const ym = mesAtual();
  const vMes = vendasValidas().filter(v => (v.data || '').startsWith(ym));
  const ms = [...S.d.membros].sort((a, b) => (a.papel === 'admin' ? 0 : 1) - (b.papel === 'admin' ? 0 : 1) || a.nome.localeCompare(b.nome));
  const logs = [...S.d.logs].filter(l => !qLog || norm(l.acao + ' ' + l.nome).includes(norm(qLog))).sort((a, b) => b.quando - a.quando).slice(0, 150);
  el.innerHTML = `
  <div class="barra"><span class="grow mudo">Convide quem vende com você. Cada pessoa entra com o próprio e-mail e só vê o que você liberar.</span><button class="btn pri" id="conv">${icon('plus')}Convidar pessoa</button></div>
  <div class="tabela-w"><table class="tabela"><thead><tr><th>Pessoa</th><th>Perfil</th><th class="n">Vendas no mês</th><th class="n">Meta mensal</th><th class="n">Comissão</th><th></th></tr></thead><tbody>
  ${ms.map(m => { const t = vMes.filter(v => v.vendedorUid === m.id).reduce((s, v) => s + v.total, 0); return `<tr data-id="${m.id}">
    <td><div class="pessoa">${m.foto ? `<img src="${esc(m.foto)}" referrerpolicy="no-referrer">` : `<span class="av">${esc((m.nome || '?')[0])}</span>`}<span><b>${esc(m.nome)}</b>${m.id === S.user.uid ? ' (você)' : ''}<small class="bl mudo">${esc(m.email || '')}</small></span></div></td>
    <td>${m.papel === 'admin' ? badge('Administrador', 'info') : badge('Vendedor(a)')}</td>
    <td class="n">${brl(t)}${m.meta ? `<div class="prog"><i style="width:${Math.min(100, t / m.meta * 100)}%"></i></div>` : ''}</td><td class="n">${m.meta ? brl(m.meta) : '—'}</td><td class="n">${m.comissao ? nfmt(m.comissao, 1) + '%' : '—'}</td>
    <td class="acoes"><button class="btn sm" data-ed="${m.id}">${icon('edit')}Editar</button></td></tr>`; }).join('')}
  </tbody></table></div>
  ${S.d.convites.length ? `<div class="sub-h"><h4>Convites pendentes</h4></div><div class="tabela-w"><table class="tabela"><tbody>${S.d.convites.map(c => `<tr><td><b>${esc(c.id)}</b></td><td>${c.papel === 'admin' ? 'Administrador' : 'Vendedor(a)'}</td><td class="mudo pq">aguardando o primeiro acesso</td><td class="acoes"><button class="btn-ic" data-rc="${esc(c.id)}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="sub-h"><h4>Histórico de atividades</h4><div class="campo-ic">${icon('search')}<input type="search" id="ql" placeholder="Filtrar" value="${esc(qLog)}"></div></div>
  ${logs.length ? `<div class="tabela-w"><table class="tabela mini"><tbody>${logs.map(l => `<tr><td class="nowrap">${fmtDataHora(l.quando)}</td><td><b>${esc(l.nome)}</b></td><td>${esc(l.acao)}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma atividade registrada.')}`;

  $('#conv', el).onclick = convidar;
  $('#ql', el).oninput = e => { qLog = e.target.value; render(el); const i = $('#ql', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  $$('[data-ed]', el).forEach(b => b.onclick = () => editar(S.d.membros.find(m => m.id === b.dataset.ed)));
  $$('[data-rc]', el).forEach(b => b.onclick = async () => { if (await ask(`Cancelar convite de ${b.dataset.rc}?`)) { await S.db.removerConvite(b.dataset.rc); toast('Convite removido.'); } });
}

function convidar() {
  if (S.db.modo === 'demo') toast('No modo demonstração o convite fica só registrado; configure o Firebase para usar de verdade.', 'aviso');
  const m = modal({
    titulo: 'Convidar pessoa', largo: true,
    corpo: `<form class="form grid2" id="fc">
      <label>E-mail da pessoa *<input name="email" type="email" required placeholder="nome@gmail.com"></label>
      <label>Perfil<select name="papel"><option value="vendedor">Vendedor(a) — acesso limitado</option><option value="admin">Administrador — acesso total</option></select></label>
      <label>Comissão (%)<input name="comissao" inputmode="decimal" placeholder="0"></label>
      <div class="span2" id="perms"><h4>Permissões</h4>${gradePerm(PERM_VENDEDOR)}</div>
      <p class="span2 mudo pq">Envie o endereço do sistema para a pessoa. Ao entrar com esse e-mail (Google ou e-mail e senha), ela é adicionada automaticamente à sua equipe.</p>
    </form>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Enviar convite</button>`
  });
  const f = m.$('#fc');
  f.papel.onchange = () => m.$('#perms').hidden = f.papel.value === 'admin';
  m.$('#ok').onclick = async () => {
    if (!f.reportValidity()) return;
    const email = f.email.value.trim().toLowerCase();
    if (S.d.membros.some(x => (x.email || '').toLowerCase() === email)) return toast('Essa pessoa já faz parte da equipe.', 'aviso');
    try {
      await S.db.criarConvite(email, { papel: f.papel.value, permissoes: f.papel.value === 'admin' ? {} : lerPerm(m.el), comissao: parseNum(f.comissao.value), criadoEm: Date.now(), por: S.user.uid });
      await commit([], `Convidou ${email}`);
      toast('Convite criado. Avise a pessoa para entrar com ' + email); m.fechar();
    } catch (e) { toast('Erro: ' + (e.code || e.message), 'erro'); }
  };
}

function editar(mb) {
  const eu = mb.id === S.user.uid, dono = mb.id === S.conta.dono;
  const m = modal({
    titulo: mb.nome, largo: true,
    corpo: `<form class="form grid2" id="fe">
      <label>Nome exibido<input name="nome" value="${esc(mb.nome || '')}"></label>
      <label>Perfil<select name="papel" ${dono ? 'disabled' : ''}><option value="vendedor" ${mb.papel !== 'admin' ? 'selected' : ''}>Vendedor(a)</option><option value="admin" ${mb.papel === 'admin' ? 'selected' : ''}>Administrador</option></select></label>
      <label>Meta mensal de vendas (R$)<input name="meta" inputmode="decimal" value="${mb.meta ? nfmt(mb.meta, 2) : ''}"></label>
      <label>Comissão padrão (%)<input name="comissao" inputmode="decimal" value="${mb.comissao ? nfmt(mb.comissao, 1) : ''}"></label>
      <div class="span2" id="perms" ${mb.papel === 'admin' ? 'hidden' : ''}><h4>Permissões</h4>${gradePerm(mb.permissoes || PERM_VENDEDOR)}</div>
      ${dono ? '<p class="span2 mudo pq">Dono(a) da conta: sempre administrador.</p>' : ''}
    </form>`,
    rodape: `${!eu && !dono ? `<button class="btn perigo-txt" id="rm">${icon('trash')}Remover da equipe</button>` : ''}<span class="grow"></span><button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok">Salvar</button>`
  });
  const f = m.$('#fe');
  f.papel.onchange = () => m.$('#perms').hidden = f.papel.value === 'admin';
  m.$('#ok').onclick = async () => {
    const papel = dono ? 'admin' : f.papel.value;
    if (eu && papel !== 'admin' && !await ask('Você vai remover seu próprio acesso de administrador. Continuar?', { perigo: true })) return;
    const d = { nome: f.nome.value.trim() || mb.nome, papel, meta: parseNum(f.meta.value), comissao: parseNum(f.comissao.value), permissoes: papel === 'admin' ? {} : lerPerm(m.el) };
    if (await commit([{ op: 'upd', col: 'membros', id: mb.id, data: d }], `Atualizou acesso de ${d.nome}`)) { toast('Salvo.'); m.fechar(); }
  };
  const rm = m.$('#rm');
  if (rm) rm.onclick = async () => {
    if (!await ask(`Remover ${mb.nome} da equipe? A pessoa perde o acesso imediatamente; as vendas dela continuam registradas.`, { perigo: true, ok: 'Remover' })) return;
    if (await commit([{ op: 'del', col: 'membros', id: mb.id }], `Removeu ${mb.nome} da equipe`)) { toast('Removido(a).'); m.fechar(); }
  };
}
