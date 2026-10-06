// Painel inicial
import { $, $$, esc, brl, nfmt, fmtData, hoje, addDias, diasAte, mesAtual, nomeMes, waLink, r2 } from '../utils.js';
import { S, cfg, pode, isAdmin, icon, navegar, modal, saldoRec, statusRec, qtdProduto, validadeProxima, vendasValidas, badge, ENTREGA } from '../core.js';
import { aniversariantes } from './clientes.js';

let grafico;

export function render(el) {
  const vs = vendasValidas(), h = hoje(), ym = mesAtual();
  const minhas = pode('relatorios') ? vs : vs.filter(v => v.vendedorUid === S.user.uid);
  const vHoje = minhas.filter(v => v.data === h), vMes = minhas.filter(v => (v.data || '').startsWith(ym));
  const totMes = vMes.reduce((s, v) => s + v.total, 0);
  const lucroMes = vMes.reduce((s, v) => s + v.total - (v.frete || 0) - (v.custoTotal || 0) - (v.taxaCartaoValor || 0), 0);
  const meta = pode('relatorios') ? Number(cfg().metaMensal) || 0 : Number(S.membro.meta) || 0;
  const abertas = [...S.d.recebiveis.filter(r => !r.cancelado && saldoRec(r) > 0), ...(window.__consParcelas ? window.__consParcelas() : [])];
  const vencidas = abertas.filter(r => r.vencimento < h).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const prox = abertas.filter(r => r.vencimento >= h && diasAte(r.vencimento) <= 7).sort((a, b) => a.vencimento > b.vencimento ? 1 : -1);
  const dias = Number(cfg().diasValidade) || 30;
  const ativos = S.d.produtos.filter(p => p.ativo !== false);
  const validade = ativos.filter(p => { const v = validadeProxima(p); return v && diasAte(v) <= dias; }).sort((a, b) => validadeProxima(a) > validadeProxima(b) ? 1 : -1);
  const baixo = ativos.filter(p => !(p.kit && p.kit.length) && qtdProduto(p) < (Number(p.estoqueMin ?? cfg().estoqueMin ?? 0) || 0)).sort((a, b) => qtdProduto(a) - qtdProduto(b));
  const anivs = aniversariantes().filter(c => c.aniversario.slice(8) >= h.slice(8));
  const pedidos = S.d.pedidos.filter(p => p.status === 'novo');
  const entregas = vs.filter(v => v.statusEntrega && v.statusEntrega !== 'entregue');
  const nome = (S.membro.nome || S.user.nome || '').split(' ')[0];
  const hora = new Date().getHours();

  const card = (titulo, rota, conteudo, mod) => pode(mod || rota) ? `<div class="card"><div class="card-h"><h4>${titulo}</h4>${rota ? `<a href="#/${rota}">Ver tudo</a>` : ''}</div>${conteudo}</div>` : '';
  const lista = (itens, fn, vazioTxt) => itens.length ? `<ul class="lista">${itens.slice(0, 6).map(fn).join('')}</ul>` : `<p class="mudo pq">${vazioTxt}</p>`;

  const c = cfg(), lj = S.conta.loja || {};
  const passos = [
    { ok: !!(S.conta.nome && S.conta.nome !== 'Minha Revenda'), t: 'Nome e logotipo do negócio', r: 'config' },
    { ok: !!c.pixChave, t: 'Chave Pix para cobranças', r: 'config' },
    { ok: S.d.produtos.length >= 3, t: 'Cadastrar produtos (pelo código ou catálogo)', r: 'produtos' },
    { ok: S.d.clientes.length > 0, t: 'Cadastrar a primeira cliente', r: 'clientes' },
    { ok: S.d.vendas.length > 0, t: 'Registrar a primeira venda', r: 'vendas' },
    { ok: !!lj.ativa, t: 'Ativar a loja virtual', r: 'loja' }
  ];
  let fechou = false; try { fechou = localStorage.getItem('revendaos:passos') === '1'; } catch { }
  const mostrarPassos = isAdmin() && !fechou && passos.some(p => !p.ok);
  // -------- versão celular (igual ao app do Revendi) --------
  let per = 'mes'; try { per = localStorage.getItem('revendaos:per') || 'mes'; } catch { }
  const PER = { hoje: 'Hoje', d7: 'Últimos 7 dias', mes: 'Mês atual', mesant: 'Mês passado', ano: 'Este ano' };
  const ini = per === 'hoje' ? h : per === 'd7' ? addDias(h, -6) : per === 'mesant' ? (() => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`; })() : per === 'ano' ? h.slice(0, 4) + '-01-01' : ym + '-01';
  const fim = per === 'mesant' ? addDias(ym + '-01', -1) : per === 'mes' ? ym + '-31' : h;
  const noPer = d => d && d >= ini && d <= fim;
  const vPer = minhas.filter(v => noPer(v.data));
  const totPer = r2(vPer.reduce((a, v) => a + v.total, 0)), lucPer = r2(vPer.reduce((a, v) => a + v.total - (v.frete || 0) - (v.custoTotal || 0) - (v.taxaCartaoValor || 0), 0));
  const aRec = r2(abertas.filter(r => noPer(r.vencimento) || r.vencimento < h).reduce((a, r) => a + saldoRec(r), 0));
  const comprasPer = r2(S.d.compras.filter(c => noPer(c.data)).reduce((a, c) => a + (c.total || 0), 0));
  const dias30 = []; for (let d = ini; d <= (fim > h ? h : fim) && dias30.length < 400; d = addDias(d, 1)) dias30.push(d);
  const porDia = dias30.map(d => r2(vPer.filter(v => v.data === d).reduce((a, v) => a + v.total, 0))), maxD = Math.max(1, ...porDia);
  const cons = (window.__consAtrasos ? window.__consAtrasos() : []).length;
  const alertasM = [
    ['cal', 'Produtos a vencer', validade.length, 'produtos'], ['truck', 'Entregas pendentes', entregas.length, 'vendas'],
    ['wallet', 'Cobranças vencidas', vencidas.length, 'cobrancas'], ['gift', 'Aniversariantes do mês', anivs.length, 'clientes'],
    ['tag', 'Consórcios em atraso', cons, 'consorcios'], ['box', 'Estoque baixo', baixo.length, 'produtos']
  ].filter(a => pode(a[3]));
  const cfgx = cfg();
  const mob = `<div class="so-mob mdash">
    <div class="mola">${cfgx.logo ? `<img class="mlogo" src="${cfgx.logo}" alt="">` : `<span class="mlogo ini">${esc((S.conta.nome || 'R')[0])}</span>`}
      <div><small>Olá,</small><b>${esc(S.conta.nome && S.conta.nome !== 'Minha Revenda' ? S.conta.nome : (S.membro.nome || S.user.nome || ''))}</b></div>
      <span class="grow"></span><button class="btn-ic" id="olho" title="Mostrar/ocultar valores">${icon(document.body.classList.contains('ocultar-valores') ? 'olhofechado' : 'eye')}</button>
      ${pode('vendas', 'editar') ? `<button class="btn-ic" id="mais" title="Adicionar">${icon('plus')}</button>` : ''}
      <button class="btn-ic sino" id="msino">${icon('bell')}${notifN() ? `<i>${notifN()}</i>` : ''}</button></div>
    ${pedidos.length && pode('loja') ? `<a class="mbanner" href="#/loja">${icon('store')}<span><b>${pedidos.length} pedido(s) novo(s)</b><small>na sua loja virtual</small></span>${icon('dir')}</a>` : ''}
    <div class="msec"><h3>Resumo do período</h3><select id="mper" class="chip-sel">${Object.entries(PER).map(([k, t]) => `<option value="${k}" ${per === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="mcards">
      <div class="mcard" data-ir="vendas"><span>${icon('tag')}Total em vendas</span><b class="valor">${brl(totPer)}</b></div>
      ${pode('relatorios') ? `<div class="mcard" data-ir="relatorios"><span>${icon('porc')}Lucro</span><b class="valor">${brl(lucPer)}</b></div>` : ''}
      ${pode('cobrancas') ? `<div class="mcard" data-ir="cobrancas"><span>${icon('cash')}A receber</span><b class="valor">${brl(aRec)}</b></div>` : ''}
      ${pode('compras') ? `<div class="mcard" data-ir="compras"><span>${icon('wallet')}Total em compras</span><b class="valor">${brl(comprasPer)}</b></div>` : ''}
    </div>
    <div class="mgraf"><div class="mgraf-h"><div><small>Vendas no período</small><b class="valor">${brl(totPer)}</b></div><span class="mudo pq">${fmtData(ini).slice(0, 5)} - ${fmtData(fim > h ? fim : fim).slice(0, 5)}</span></div>
      <div class="barras">${porDia.map((v, k) => `<i title="${fmtData(dias30[k])}: ${brl(v)}" style="height:${Math.max(2, v / maxD * 100)}%"></i>`).join('')}</div></div>
    <div class="msec"><h3>Alertas e lembretes</h3></div>
    <div class="malertas">${alertasM.map(([ic, t, n, r]) => `<a class="malerta" href="#/${r}"><span class="mal-ic">${icon(ic)}</span>${n ? `<em>${n}</em>` : ''}<b>${t}</b>${icon('dir')}</a>`).join('')}</div>
  </div>`;
  function notifN() { try { return window.__notifN ? window.__notifN() : 0; } catch { return 0; } }

  el.innerHTML = mob + `<div class="so-desk">
  ${mostrarPassos ? `<div class="card" style="margin-bottom:16px"><div class="card-h"><h4>Primeiros passos · ${passos.filter(p => p.ok).length} de ${passos.length}</h4><a href="#" id="fpassos">Ocultar</a></div>
    <div class="passos">${passos.map(p => `<a class="passo ${p.ok ? 'feito' : ''}" href="#/${p.r}"><span class="ok">${p.ok ? icon('check') : ''}</span><span>${p.t}</span></a>`).join('')}</div></div>` : ''}
  <div class="ola"><div><h3>${hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, ${esc(nome)}!</h3><p class="mudo">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    <div class="atalhos">
      ${pode('vendas', 'editar') ? `<button class="btn pri" data-a="venda">${icon('cart')}Nova venda</button>` : ''}
      ${pode('clientes', 'editar') ? `<button class="btn" data-a="cliente">${icon('users')}Cliente</button>` : ''}
      ${pode('produtos', 'editar') ? `<button class="btn" data-a="produto">${icon('box')}Produto</button>` : ''}
    </div></div>
  <div class="kpis">
    <div class="kpi"><span>Vendas hoje</span><b>${brl(vHoje.reduce((s, v) => s + v.total, 0))}</b><small>${vHoje.length} venda(s)</small></div>
    <div class="kpi"><span>Vendas em ${nomeMes(ym).split(' ')[0]}</span><b>${brl(totMes)}</b>
      ${meta ? `<div class="prog"><i style="width:${Math.min(100, totMes / meta * 100)}%"></i></div><small>${nfmt(totMes / meta * 100)}% da meta de ${brl(meta)}</small>` : `<small>${vMes.length} venda(s)${pode('config') ? ' · <a href="#/config">definir meta</a>' : ''}</small>`}</div>
    ${pode('relatorios') ? `<div class="kpi"><span>Lucro bruto no mês</span><b>${brl(lucroMes)}</b><small>${totMes ? nfmt(lucroMes / totMes * 100, 1) + '% de margem' : ''}</small></div>` : ''}
    ${pode('cobrancas') ? `<div class="kpi ${vencidas.length ? 'alerta' : ''}" data-ir="cobrancas"><span>A receber até o fim do mês</span><b>${brl(abertas.filter(r => r.vencimento <= ym + '-31').reduce((s, r) => s + saldoRec(r), 0))}</b><small>${vencidas.length ? `<span class="t-perigo">${brl(vencidas.reduce((s, r) => s + saldoRec(r), 0))} vencido</span>` : 'nada vencido'}</small></div>` : ''}
  </div>
  ${pedidos.length && pode('loja') ? `<a class="aviso-box destaque" href="#/loja">${icon('bell')}<span><b>${pedidos.length} pedido(s) novo(s)</b> na loja virtual aguardando você.</span></a>` : ''}
  <div class="grid-dash">
    ${pode('vendas') ? `<div class="card span2"><div class="card-h"><h4>Vendas dos últimos 30 dias</h4><a href="#/vendas">Ver vendas</a></div><div class="graf"><canvas id="g"></canvas></div></div>` : ''}
    ${card('Cobranças vencidas', 'cobrancas', lista(vencidas, r => `<li><span><b>${esc(r.clienteNome || 'Sem cliente')}</b><small>${r.consParc ? 'Consórcio G' + r.grupo : '#' + r.numeroVenda} · venceu ${fmtData(r.vencimento)}</small></span><em class="t-perigo">${brl(saldoRec(r))}</em></li>`, 'Nenhuma parcela vencida. 🎉'))}
    ${card('Vencem nos próximos 7 dias', 'cobrancas', lista(prox, r => `<li><span><b>${esc(r.clienteNome || 'Sem cliente')}</b><small>${r.vencimento === h ? 'hoje' : fmtData(r.vencimento)}</small></span><em>${brl(saldoRec(r))}</em></li>`, 'Nada para os próximos dias.'))}
    ${card(`Validade em até ${dias} dias`, 'produtos', lista(validade, p => { const d = diasAte(validadeProxima(p)); return `<li><span><b>${esc(p.nome)}</b><small>${esc(p.marca || '')} · ${qtdProduto(p)} un.</small></span>${badge(d < 0 ? 'vencido' : d === 0 ? 'hoje' : d + ' dias', d < 0 ? 'perigo' : 'aviso')}</li>`; }, 'Nenhum produto perto do vencimento.'))}
    ${card('Estoque baixo', 'produtos', lista(baixo, p => `<li><span><b>${esc(p.nome)}</b><small>${esc(p.marca || '')}</small></span>${badge(qtdProduto(p) + ' un.', qtdProduto(p) <= 0 ? 'perigo' : 'aviso')}</li>`, 'Estoque em dia.'))}
    ${card('Aniversariantes do mês', 'clientes', lista(anivs, c => `<li><span><b>${esc(c.nome)}</b><small>${c.aniversario.slice(8)}/${c.aniversario.slice(5, 7)}${c.aniversario.slice(5) === h.slice(5) ? ' · hoje! 🎂' : ''}</small></span>${c.whatsapp ? `<a class="btn-ic wa" target="_blank" href="${waLink(c.whatsapp, `Feliz aniversário, ${c.nome.split(' ')[0]}! 🎉 Que seu dia seja lindo! Preparei um mimo especial pra você, quer ver? 💖`)}">${icon('gift')}</a>` : ''}</li>`, 'Nenhum aniversário pelos próximos dias deste mês.'))}
    ${card('Entregas pendentes', 'vendas', lista(entregas, v => `<li><span><b>${esc(v.clienteNome || 'Consumidor final')}</b><small>#${v.numero} · ${fmtData(v.data)}</small></span>${badge(ENTREGA[v.statusEntrega], 'info')}</li>`, 'Tudo entregue.'))}
  </div></div>`;

  $$('[data-ir]', el).forEach(k => k.onclick = () => navegar(k.dataset.ir));
  $('#mper', el).onchange = e => { try { localStorage.setItem('revendaos:per', e.target.value); } catch { } render(el); };
  $('#olho', el).onclick = () => { const on = document.body.classList.toggle('ocultar-valores'); try { localStorage.setItem('revendaos:ocultar', on ? '1' : ''); } catch { } render(el); };
  $('#msino', el).onclick = async () => (await import('./notificacoes.js')).abrir();
  const mais = $('#mais', el); if (mais) mais.onclick = () => {
    const m = modal({ titulo: 'Adicionar', corpo: `<div class="madd">${[['venda', 'cart', 'Nova venda'], ['cliente', 'users', 'Novo cliente'], ['produto', 'box', 'Novo produto']].map(([a, ic, t]) => `<button class="btn" data-x="${a}">${icon(ic)}${t}</button>`).join('')}</div>` });
    m.$$('[data-x]').forEach(b => b.onclick = async () => { m.fechar(); const a = b.dataset.x; if (a === 'venda') (await import('./vendas.js')).novaVenda(); if (a === 'cliente') (await import('./clientes.js')).formCliente(); if (a === 'produto') (await import('./produtos.js')).formProduto(); });
  };
  const fp = $('#fpassos', el); if (fp) fp.onclick = e => { e.preventDefault(); try { localStorage.setItem('revendaos:passos', '1'); } catch { } render(el); };
  $$('[data-a]', el).forEach(b => b.onclick = async () => {
    if (b.dataset.a === 'venda') (await import('./vendas.js')).novaVenda();
    if (b.dataset.a === 'cliente') (await import('./clientes.js')).formCliente();
    if (b.dataset.a === 'produto') (await import('./produtos.js')).formProduto();
  });

  const cv = $('#g', el);
  if (cv && !window.Chart) cv.parentElement.innerHTML = '<p class="mudo pq" style="padding:20px 0">Gráfico indisponível agora (sem conexão com a biblioteca de gráficos).</p>';
  if (cv && window.Chart) {
    const ds = Array.from({ length: 30 }, (_, i) => addDias(h, i - 29));
    const val = ds.map(d => r2(minhas.filter(v => v.data === d).reduce((s, v) => s + v.total, 0)));
    const cs = getComputedStyle(document.documentElement);
    grafico && grafico.destroy();
    grafico = new Chart(cv, {
      type: 'bar',
      data: { labels: ds.map(d => d.slice(8) + '/' + d.slice(5, 7)), datasets: [{ label: 'Vendas', data: val, backgroundColor: cs.getPropertyValue('--pri').trim(), borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => brl(c.raw) } } }, scales: { x: { ticks: { color: cs.getPropertyValue('--txt2').trim(), maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { color: cs.getPropertyValue('--txt2').trim(), callback: v => 'R$ ' + nfmt(v) }, grid: { color: cs.getPropertyValue('--borda').trim() } } } }
    });
  }
}
