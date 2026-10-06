// Inicialização, autenticação, layout e rotas
import { getDB } from './db.js';
import { APP_NOME } from './config.js';
import { $, $$, esc } from './utils.js';
import { S, MODS, pode, icon, toast, statusRec, isAdmin } from './core.js';

import * as dashboard from './modules/dashboard.js';
import * as vendas from './modules/vendas.js';
import * as cobrancas from './modules/cobrancas.js';
import * as clientes from './modules/clientes.js';
import * as produtos from './modules/produtos.js';
import * as compras from './modules/compras.js';
import * as financeiro from './modules/financeiro.js';
import * as relatorios from './modules/relatorios.js';
import * as loja from './modules/loja.js';
import * as equipe from './modules/equipe.js';
import * as config from './modules/config.js';
import * as catalogo from './modules/catalogo.js';
import * as promocoes from './modules/promocoes.js';
import * as notificacoes from './modules/notificacoes.js';
import * as consorcios from './modules/consorcios.js';

const ROTAS = { dashboard, vendas, cobrancas, clientes, produtos, compras, financeiro, relatorios, loja, equipe, config, catalogo, promocoes, consorcios };
const COLS = ['produtos', 'clientes', 'vendas', 'recebiveis', 'lancamentos', 'compras', 'promocoes', 'consorcios', 'membros', 'logs'];
let unsubs = [], unsubPedidos = null, slugPedidos = null, unsubConvites = null;

// ---------------- tema ----------------
export function aplicarTema() {
  const t = localStorage.getItem('revendaos:tema') || 'auto';
  const escuro = t === 'escuro' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  const cor = (S.conta.config || {}).cor;
  document.documentElement.style.setProperty('--pri', cor || '#c2185b');
  const meta = $('meta[name=theme-color]'); if (meta) meta.content = cor || '#c2185b';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', aplicarTema);

// ---------------- login ----------------
function telaLogin(erro = '') {
  const demo = S.db.modo === 'demo';
  document.body.innerHTML = `
  <div class="login">
    <div class="login-card">
      <div class="login-logo">${icon('store')}</div>
      <h1>${esc(APP_NOME)}</h1>
      <p class="mudo">Estoque, vendas, cobranças e loja virtual da sua revenda.</p>
      ${demo ? `<div class="aviso-demo">Modo demonstração: o Firebase ainda não foi configurado em <code>assets/config.js</code>. Os dados ficam só neste navegador.</div>` : ''}
      ${erro ? `<div class="erro-box">${esc(erro)}</div>` : ''}
      <button class="btn google" id="g">${googleSvg}Entrar com Google</button>
      <div class="ou"><span>ou</span></div>
      <form id="f" class="form">
        <label id="lnome" hidden>Nome<input name="nome" autocomplete="name"></label>
        <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
        <label>Senha<input name="senha" type="password" minlength="6" required autocomplete="current-password"></label>
        <button class="btn pri cheio" id="bt">Entrar</button>
      </form>
      <div class="login-links"><a href="#" id="alterna">Criar conta</a><a href="#" id="esqueci">Esqueci a senha</a></div>
    </div>
  </div>`;
  let cadastro = false;
  const f = $('#f');
  const ua = navigator.userAgent || '';
  const embutido = /GSA\/|FBAN|FBAV|Instagram|WhatsApp|Line\//.test(ua);
  const celular = /iPhone|iPad|Android/i.test(ua);
  if (celular) {
    const dica = document.createElement('p'); dica.className = 'mudo pq'; dica.style.marginTop = '10px';
    dica.innerHTML = embutido
      ? '<b>Abra no Safari ou no Chrome</b>: dentro do app do Google/WhatsApp/Instagram o login com Google não funciona. Toque em ⋯ ou no ícone de compartilhar → "Abrir no navegador".'
      : 'Se o Google não abrir no celular, entre com e-mail e senha. Já entrou com Google no computador? Digite o mesmo Gmail abaixo e toque em <b>Esqueci a senha</b> para criar uma senha da mesma conta.';
    $('#g').after(dica);
  }
  $('#g').onclick = () => S.db.loginGoogle().catch(e => telaLogin(msgErro(e)));
  $('#alterna').onclick = e => {
    e.preventDefault(); cadastro = !cadastro;
    $('#lnome').hidden = !cadastro; $('#bt').textContent = cadastro ? 'Criar conta' : 'Entrar';
    e.target.textContent = cadastro ? 'Já tenho conta' : 'Criar conta';
  };
  $('#esqueci').onclick = async e => {
    e.preventDefault(); const em = f.email.value.trim();
    if (!em) return toast('Digite seu e-mail no campo acima.', 'aviso');
    try { await S.db.resetSenha(em); toast('Enviamos um link de redefinição para ' + em); } catch (er) { toast(msgErro(er), 'erro'); }
  };
  f.onsubmit = async e => {
    e.preventDefault(); $('#bt').disabled = true;
    try {
      if (cadastro) await S.db.cadastrar(f.email.value.trim(), f.senha.value, f.nome.value.trim());
      else await S.db.loginEmail(f.email.value.trim(), f.senha.value);
    } catch (er) { telaLogin(msgErro(er)); }
  };
}
const googleSvg = `<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
function msgErro(e) {
  const c = e && e.code || '';
  return ({
    'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'Senha incorreta.', 'auth/user-not-found': 'Usuário não encontrado.',
    'auth/email-already-in-use': 'Este e-mail já tem cadastro.', 'auth/weak-password': 'A senha precisa ter ao menos 6 caracteres.',
    'auth/popup-closed-by-user': 'O login com Google foi fechado antes de terminar. Tente de novo ou use e-mail e senha.', 'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups ou use e-mail e senha.', 'auth/unauthorized-domain': 'Domínio não autorizado: adicione o endereço do GitHub Pages em Firebase > Authentication > Configurações > Domínios autorizados.',
    'auth/operation-not-allowed': 'Método de login não ativado no Firebase (Authentication > Método de login).'
  })[c] || (e && e.message) || 'Erro inesperado.';
}

// ---------------- layout ----------------
function montarShell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="side" id="side">
      <div class="marca" id="marca"></div>
      <nav id="nav"></nav>
      <div class="side-pe">
        <button class="nav-item" id="tema">${icon('moon')}<span>Tema</span></button>
        <button class="nav-item" id="sair">${icon('out')}<span>Sair</span></button>
      </div>
    </aside>
    <div class="side-bg" id="sidebg"></div>
    <div class="conteudo">
      <header class="topo">
        <button class="btn-ic so-mobile" id="abrir">${icon('menu')}</button>
        <h2 id="titulo"></h2>
        <div class="topo-dir">
          <button class="btn-ic sino" id="sino" title="Notificações">${icon('bell')}<i id="nsino" hidden></i></button>
          <div class="eu" id="eu"></div>
        </div>
      </header>
      ${S.db.modo === 'demo' ? `<div class="faixa-demo">Modo demonstração — configure o Firebase em <b>assets/config.js</b> para usar login real e salvar na nuvem.</div>` : ''}
      <main id="main"></main>
    </div>
  </div>`;
  $('#abrir').onclick = () => document.body.classList.add('menu-aberto');
  $('#sidebg').onclick = () => document.body.classList.remove('menu-aberto');
  $('#sair').onclick = () => S.db.sair();
  $('#sino').onclick = () => notificacoes.abrir();
  $('#tema').onclick = () => {
    const ordem = ['auto', 'claro', 'escuro']; const at = localStorage.getItem('revendaos:tema') || 'auto';
    const nx = ordem[(ordem.indexOf(at) + 1) % 3]; localStorage.setItem('revendaos:tema', nx); aplicarTema();
    toast('Tema: ' + ({ auto: 'automático', claro: 'claro', escuro: 'escuro' })[nx]);
  };
  const main = $('#main');
  main.addEventListener('input', e => { if (e.target.closest('[data-form]')) main.dataset.sujo = 1; });
}

function atualizarShell() {
  const c = S.conta.config || {};
  $('#marca').innerHTML = `${c.logo ? `<img src="${c.logo}" alt="">` : `<span class="marca-ini">${esc((S.conta.nome || 'R')[0])}</span>`}<b>${esc(S.conta.nome || 'Minha Revenda')}</b>`;
  const vencidas = S.d.recebiveis.filter(r => statusRec(r) === 'vencido').length;
  const pedidos = S.d.pedidos.filter(p => p.status === 'novo').length;
  const cont = { cobrancas: vencidas, loja: pedidos };
  $('#nav').innerHTML = MODS.filter(m => pode(m.id)).map(m =>
    `<a href="#/${m.id}" class="nav-item ${S.rota === m.id ? 'ativo' : ''}">${icon(m.ic)}<span>${m.nome}</span>${cont[m.id] ? `<i class="cont">${cont[m.id]}</i>` : ''}</a>`).join('');
  const n = notificacoes.contagem(); const ns = $('#nsino'); ns.hidden = !n; ns.textContent = n > 9 ? '9+' : n;
  const u = S.user;
  $('#eu').innerHTML = `${u.foto ? `<img src="${esc(u.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc((S.membro.nome || u.nome || '?')[0])}</span>`}
    <div><b>${esc(S.membro.nome || u.nome)}</b><small>${isAdmin() ? 'Administrador' : 'Vendedor'}</small></div>`;
  aplicarTema();
}

// ---------------- rotas ----------------
function lerRota() {
  const h = location.hash.replace(/^#\/?/, '');
  const id = h.split('?')[0] || 'dashboard';
  S.rota = ROTAS[id] && pode(id) ? id : 'dashboard';
}
function render(forcar = false) {
  const main = $('#main'); if (!main) return;
  if (!forcar && main.dataset.sujo) { atualizarShell(); return; }
  delete main.dataset.sujo;
  const m = MODS.find(x => x.id === S.rota);
  $('#titulo').textContent = m ? m.nome : '';
  document.title = (m ? m.nome + ' · ' : '') + (S.conta.nome || APP_NOME);
  atualizarShell();
  const y = main.scrollTop;
  try { ROTAS[S.rota].render(main); }
  catch (e) { console.error(e); main.innerHTML = `<div class="erro-box">Erro ao exibir esta tela: ${esc(e.message)}</div>`; }
  if (!forcar) main.scrollTop = y;
}
let agendado = false;
function agendar() { if (agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; render(); }); }
export const rerender = () => render(true);
window.addEventListener('hashchange', () => { lerRota(); document.body.classList.remove('menu-aberto'); render(true); $('#main') && ($('#main').scrollTop = 0); });

// ---------------- dados ----------------
function assinar() {
  unsubs.forEach(f => f && f()); unsubs = [];
  COLS.forEach(c => unsubs.push(S.db.watch(c, lista => {
    S.d[c] = lista;
    if (c === 'membros') { const eu = lista.find(m => m.id === S.user.uid); if (eu) S.membro = eu; }
    agendar();
  })));
  unsubs.push(S.db.watchConta(c => { S.conta = c; ligarPedidos(); ligarConvites(); agendar(); }));
}
function ligarPedidos() {
  const slug = (S.conta.loja || {}).slug;
  if (slug === slugPedidos) return;
  unsubPedidos && unsubPedidos(); unsubPedidos = null; slugPedidos = slug; S.d.pedidos = [];
  if (slug) unsubPedidos = S.db.watchPedidos(slug, l => { S.d.pedidos = l; agendar(); });
}
function ligarConvites() {
  if (unsubConvites || !isAdmin()) return;
  unsubConvites = S.db.listConvites(l => { S.d.convites = l; agendar(); });
}

async function iniciar() {
  window.__appIniciado = true;
  aplicarTema();
  try { S.db = await getDB(); }
  catch (e) { document.body.innerHTML = `<div class="login"><div class="login-card"><h1>Falha ao carregar</h1><p>${esc(e.message)}</p></div></div>`; return; }
  if (S.db.resultadoRedirect && sessionStorage.getItem('rv-redir')) { sessionStorage.removeItem('rv-redir'); S.db.resultadoRedirect().then(r => { if (!r) setTimeout(() => { if (!S.user) telaLogin('O Google não concluiu o login neste navegador. Use e-mail e senha (se já entrou com Google no computador, toque em "Esqueci a senha" com o mesmo Gmail).'); }, 1500); }).catch(e => telaLogin(msgErro(e))); }
  S.db.onAuth(async user => {
    unsubs.forEach(f => f && f()); unsubs = []; unsubPedidos && unsubPedidos(); unsubPedidos = null; slugPedidos = null;
    unsubConvites && unsubConvites(); unsubConvites = null;
    if (!user) { S.user = null; telaLogin(); return; }
    S.user = user;
    document.body.innerHTML = `<div class="carregando"><div class="spin"></div><p>Carregando sua revenda…</p></div>`;
    try {
      const r = await S.db.resolverConta(user);
      S.contaId = r.contaId; S.membro = r.membro;
      S.curador = await catalogo.verificarCurador();
    } catch (e) { console.error(e); telaLogin('Não foi possível abrir sua conta: ' + (e.code || e.message) + '. Verifique se as regras do Firestore foram publicadas.'); return; }
    montarShell(); lerRota(); assinar(); render(true);
    // primeiro acesso: traz automaticamente os dados do Revendi que estão no repositório
    setTimeout(async () => { try { const d = await import('./modules/dados-iniciais.js'); await new Promise(r => setTimeout(r, 1500)); if (S.conta && d.precisaCarga()) d.carregarTudo(); } catch (e) { console.warn(e); } }, 1500);
  });
}
iniciar();

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
