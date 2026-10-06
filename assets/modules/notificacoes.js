// Central de notificações: tudo que pede atenção hoje, calculado em tempo real
import { esc, brl, fmtData, hoje, diasAte } from '../utils.js';
import { S, cfg, pode, icon, modal, navegar, saldoRec, qtdProduto, validadeProxima } from '../core.js';

export function alertas() {
  const h = hoje(), l = [];
  if (pode('loja')) {
    const p = S.d.pedidos.filter(x => x.status === 'novo');
    if (p.length) l.push({ ic: 'store', cls: 'info', rota: 'loja', titulo: `${p.length} pedido(s) novo(s) na loja virtual`, det: p.slice(0, 3).map(x => `${x.cliente.nome} · ${brl(x.total)}`).join(' · ') });
  }
  if (pode('cobrancas')) {
    const ab = S.d.recebiveis.filter(r => !r.cancelado && saldoRec(r) > 0.004);
    const venc = ab.filter(r => r.vencimento < h), hojeR = ab.filter(r => r.vencimento === h);
    if (venc.length) l.push({ ic: 'cash', cls: 'perigo', rota: 'cobrancas', titulo: `${venc.length} parcela(s) vencida(s) · ${brl(venc.reduce((s, r) => s + saldoRec(r), 0))}`, det: [...new Set(venc.map(r => r.clienteNome || 'Sem cliente'))].slice(0, 4).join(', ') });
    if (hojeR.length) l.push({ ic: 'cash', cls: 'aviso', rota: 'cobrancas', titulo: `${hojeR.length} parcela(s) vencem hoje · ${brl(hojeR.reduce((s, r) => s + saldoRec(r), 0))}`, det: hojeR.slice(0, 4).map(r => r.clienteNome).join(', ') });
  }
  if (pode('consorcios')) {
    let at = [];
    try { at = window.__consAtrasos ? window.__consAtrasos() : []; } catch { }
    if (at.length) l.push({ ic: 'layers', cls: 'perigo', rota: 'consorcios', titulo: `${at.length} participante(s) de consórcio com parcela em atraso · ${brl(at.reduce((s, x) => s + x.s.valorAtraso, 0))}`, det: at.slice(0, 4).map(x => `${x.p.nome} (G${x.g.grupo})`).join(', ') });
  }
  if (pode('financeiro')) {
    const pg = S.d.lancamentos.filter(x => x.tipo === 'despesa' && !x.pago && x.vencimento <= h);
    if (pg.length) l.push({ ic: 'wallet', cls: 'perigo', rota: 'financeiro', titulo: `${pg.length} conta(s) a pagar vencida(s) ou vencendo hoje · ${brl(pg.reduce((s, x) => s + x.valor, 0))}`, det: pg.slice(0, 3).map(x => x.descricao).join(', ') });
  }
  if (pode('produtos')) {
    const at = S.d.produtos.filter(p => p.ativo !== false);
    const dias = Number(cfg().diasValidade) || 30;
    const venc = at.filter(p => { const v = validadeProxima(p); return v && diasAte(v) < 0 && qtdProduto(p) > 0; });
    const prox = at.filter(p => { const v = validadeProxima(p); return v && diasAte(v) >= 0 && diasAte(v) <= dias; });
    const zer = at.filter(p => qtdProduto(p) <= 0);
    if (venc.length) l.push({ ic: 'alert', cls: 'perigo', rota: 'produtos', titulo: `${venc.length} produto(s) com lote vencido`, det: venc.slice(0, 3).map(p => p.nome).join(', ') });
    if (prox.length) l.push({ ic: 'box', cls: 'aviso', rota: 'produtos', titulo: `${prox.length} produto(s) vencem em até ${dias} dias`, det: prox.sort((a, b) => validadeProxima(a) > validadeProxima(b) ? 1 : -1).slice(0, 3).map(p => `${p.nome} (${fmtData(validadeProxima(p))})`).join(', ') });
    if (zer.length) l.push({ ic: 'box', cls: 'aviso', rota: 'produtos', titulo: `${zer.length} produto(s) sem estoque`, det: zer.slice(0, 4).map(p => p.nome).join(', ') });
  }
  if (pode('clientes')) {
    const an = S.d.clientes.filter(c => (c.aniversario || '').slice(5) === h.slice(5));
    if (an.length) l.push({ ic: 'gift', cls: 'info', rota: 'clientes', titulo: `${an.length} cliente(s) fazem aniversário hoje 🎂`, det: an.map(c => c.nome).join(', ') });
  }
  if (pode('vendas')) {
    const ent = S.d.vendas.filter(v => !v.cancelada && v.statusEntrega && v.statusEntrega !== 'entregue');
    if (ent.length) l.push({ ic: 'truck', cls: 'info', rota: 'vendas', titulo: `${ent.length} entrega(s) pendente(s)`, det: ent.slice(0, 4).map(v => v.clienteNome || '#' + v.numero).join(', ') });
  }
  return l;
}

export function contagem() { return alertas().filter(a => a.cls !== 'info' || a.rota === 'loja').length; }

export function abrir() {
  const l = alertas();
  const m = modal({
    titulo: 'Notificações',
    corpo: l.length ? `<ul class="lista notif">${l.map((a, k) => `<li data-k="${k}" class="n-${a.cls}"><span class="n-ic">${icon(a.ic)}</span><span><b>${esc(a.titulo)}</b><small>${esc(a.det || '')}</small></span><em>›</em></li>`).join('')}</ul>` : '<p class="mudo">Tudo em dia por aqui. 🎉</p>'
  });
  m.$$('[data-k]').forEach(li => li.onclick = () => { m.fechar(); navegar(l[+li.dataset.k].rota); });
}
