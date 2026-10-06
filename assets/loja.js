// Vitrine pública da loja virtual (não exige login)
import { getDB } from './db.js';
import { $, $$, esc, brl, norm, soDigitos, fmtFone, waLink, pixPayload, copiar, slugify } from './utils.js';

const fotoItem = i => i.foto || (i.ref && i.marca ? `catalogo-img/${slugify(i.marca)}/${String(i.ref).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+(?=\d)/, '')}.jpg` : '');
const slug = new URLSearchParams(location.search).get('l') || location.hash.replace('#', '');
const KC = 'revendaos:carrinho:' + slug;
let db, loja, itens = [], cat = '', q = '';
let carrinho = {};
try { carrinho = JSON.parse(localStorage.getItem(KC) || '{}'); } catch { }
const salvarCarrinho = () => { try { localStorage.setItem(KC, JSON.stringify(carrinho)); } catch { } };

const escuro = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = escuro ? 'dark' : 'light';

const hojeISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const emPromo = i => i.precoPromo > 0 && i.precoPromo < i.preco && (!i.promoAte || i.promoAte >= hojeISO()) && (!i.promoDe || i.promoDe <= hojeISO());
const precoEf = i => emPromo(i) ? i.precoPromo : i.preco;
let cupomAplicado = null;

function fim(msg) { document.body.innerHTML = `<div class="login"><div class="login-card"><h1>Loja indisponível</h1><p class="mudo">${esc(msg)}</p></div></div>`; }

async function iniciar() {
  if (!slug) return fim('Endereço da loja incompleto.');
  try { db = await getDB(); loja = await db.lojaGet(slug); } catch (e) { return fim('Não foi possível carregar a loja agora. ' + (e.code || '')); }
  if (!loja || !loja.ativa) return fim('Esta loja não está disponível no momento.');
  itens = (await db.lojaItens(slug)).filter(i => i.disponivel || loja.mostrarEsgotados !== false).sort((a, b) => (b.disponivel - a.disponivel) || a.nome.localeCompare(b.nome));
  Object.keys(carrinho).forEach(id => { if (!itens.find(i => i.id === id && i.disponivel)) delete carrinho[id]; });
  document.documentElement.style.setProperty('--pri', loja.cor || '#7209b7');
  $('meta[name=theme-color]').content = loja.cor || '#7209b7';
  document.title = loja.titulo || loja.nomeConta || 'Loja';
  montar();
}

function montar() {
  const cats = [...new Set(itens.map(i => i.categoria).filter(Boolean))].sort();
  document.body.innerHTML = `
  <header class="v-topo">
    <div class="v-marca">${loja.logo ? `<img src="${loja.logo}" alt="">` : `<span class="marca-ini">${esc((loja.titulo || 'L')[0])}</span>`}<div><h1>${esc(loja.titulo || loja.nomeConta || 'Loja')}</h1>${loja.descricao ? `<p>${esc(loja.descricao)}</p>` : ''}</div></div>
  </header>
  <div class="v-filtros">
    <div class="campo-ic"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input type="search" id="q" placeholder="O que você procura?"></div>
    ${cats.length > 1 ? `<div class="chips"><button data-c="" class="ativo">Tudo</button>${cats.map(c => `<button data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
  </div>
  <main class="v-grade" id="grade"></main>
  <footer class="v-rodape">${loja.whatsapp ? `<a href="${waLink(loja.whatsapp, 'Olá! Vim pela sua loja online 😊')}" target="_blank">Dúvidas? Fale no WhatsApp ${fmtFone(loja.whatsapp)}</a>` : ''}</footer>
  <button class="v-carrinho" id="abrir" hidden><span id="cq"></span> Ver sacola · <b id="ct"></b></button>`;
  $('#q').oninput = e => { q = e.target.value; grade(); };
  $$('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; $$('[data-c]').forEach(x => x.classList.toggle('ativo', x === b)); grade(); });
  $('#abrir').onclick = sacola;
  grade(); barra();
}

function grade() {
  const n = norm(q);
  const l = itens.filter(i => (!cat || i.categoria === cat) && (!n || norm(i.nome + ' ' + i.marca + ' ' + i.categoria).includes(n)));
  $('#grade').innerHTML = l.length ? l.map(i => `<article class="v-item ${i.disponivel ? '' : 'esgotado'}" data-id="${i.id}">
    <div class="v-foto ${fotoItem(i) ? '' : 'sem-foto'}" data-ini="${esc((i.marca || i.nome || '?')[0])}">${fotoItem(i) ? `<img src="${fotoItem(i)}" alt="" loading="lazy">` : ''}${!i.disponivel ? '<em>Esgotado</em>' : emPromo(i) ? `<em class="promo">-${Math.round((1 - i.precoPromo / i.preco) * 100)}%</em>` : ''}${(i.fotos || []).length ? `<i class="v-nfotos">+${i.fotos.length}</i>` : ''}</div>
    <div class="v-info"><small>${esc(i.marca || '')}</small><h3>${esc(i.nome)}</h3>${i.descricao ? `<p>${esc(i.descricao)}</p>` : ''}
    <div class="v-preco">${emPromo(i) ? `<span><s class="mudo">${brl(i.preco)}</s> <b>${brl(i.precoPromo)}</b></span>` : `<b>${brl(i.preco)}</b>`}${i.qtd != null && i.disponivel ? `<small>${i.qtd} disp.</small>` : ''}</div>
    ${i.disponivel ? (carrinho[i.id] ? `<div class="qtd"><button data-m>−</button><span>${carrinho[i.id]}</span><button data-p>+</button></div>` : `<button class="btn pri cheio" data-add>Adicionar</button>`) : ''}</div></article>`).join('')
    : `<p class="mudo ta-c" style="grid-column:1/-1;padding:40px">Nenhum produto encontrado.</p>`;
  $$('.v-item').forEach(c => c.onclick = e => {
    const id = c.dataset.id, it = itens.find(x => x.id === id);
    const max = it.qtd != null ? it.qtd : 999;
    if (e.target.closest('[data-add]') || e.target.closest('[data-p]')) carrinho[id] = Math.min(max, (carrinho[id] || 0) + 1);
    else if (e.target.closest('[data-m]')) { carrinho[id]--; if (carrinho[id] <= 0) delete carrinho[id]; }
    else if (e.target.closest('.v-foto') || e.target.closest('h3')) return detalhe(it);
    else return;
    salvarCarrinho(); grade(); barra();
  });
}

const linhas = () => Object.entries(carrinho).map(([id, qtd]) => { const i = itens.find(x => x.id === id); return i ? { id, nome: i.nome, qtd, preco: precoEf(i) } : null; }).filter(Boolean);
const subtotal = () => linhas().reduce((s, l) => s + l.qtd * l.preco, 0);
function barra() {
  const n = linhas().reduce((s, l) => s + l.qtd, 0);
  $('#abrir').hidden = !n; $('#cq').textContent = n + (n === 1 ? ' item' : ' itens'); $('#ct').textContent = brl(subtotal());
}

function detalhe(i) {
  const fotos = [fotoItem(i), ...(i.fotos || [])].filter(Boolean);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><div class="modal-h"><h3>${esc(i.nome)}</h3><button class="btn-ic" data-x>✕</button></div><div class="modal-b">
    ${fotos.length ? `<div class="galeria"><img id="gp" src="${fotos[0]}" alt="">${fotos.length > 1 ? `<div class="miniaturas">${fotos.map((f, k) => `<img src="${f}" data-k="${k}" alt="">`).join('')}</div>` : ''}</div>` : ''}
    <p class="mudo">${esc([i.marca, i.ref ? 'cód. ' + i.ref : '', i.categoria].filter(Boolean).join(' · '))}</p>
    ${i.descricao ? `<p>${esc(i.descricao)}</p>` : ''}
    <div class="v-preco">${emPromo(i) ? `<span><s class="mudo">${brl(i.preco)}</s> <b>${brl(i.precoPromo)}</b> <small>${esc(i.promoNome || '')}</small></span>` : `<b>${brl(i.preco)}</b>`}</div>
  </div><div class="modal-f"><button class="btn" data-x>Fechar</button>${i.disponivel ? `<button class="btn pri" id="add">Adicionar à sacola</button>` : '<span class="mudo">Esgotado</span>'}</div></div>`;
  document.body.appendChild(bg);
  bg.querySelectorAll('[data-x]').forEach(b => b.onclick = () => bg.remove());
  bg.onclick = e => { if (e.target === bg) bg.remove(); };
  bg.querySelectorAll('.miniaturas img').forEach(im => im.onclick = () => bg.querySelector('#gp').src = fotos[+im.dataset.k]);
  const a = bg.querySelector('#add'); if (a) a.onclick = () => { const max = i.qtd != null ? i.qtd : 999; carrinho[i.id] = Math.min(max, (carrinho[i.id] || 0) + 1); salvarCarrinho(); bg.remove(); grade(); barra(); };
}

function sacola() {
  const entregas = (loja.entregas || 'Retirar; Entrega').split(';').map(s => s.trim()).filter(Boolean);
  const pags = (loja.pagamentos || 'Pix; Dinheiro; Cartão').split(';').map(s => s.trim()).filter(Boolean);
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal"><div class="modal-h"><h3>Sua sacola</h3><button class="btn-ic" data-x>✕</button></div>
  <div class="modal-b">
    <ul class="lista">${linhas().map(l => `<li><span><b>${l.qtd}x ${esc(l.nome)}</b></span><em>${brl(l.qtd * l.preco)}</em></li>`).join('')}</ul>
    <form class="form" id="f">
      <label>Seu nome *<input name="nome" required autocomplete="name"></label>
      <label>Seu WhatsApp *<input name="whatsapp" required inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678"></label>
      <label>Como quer receber?<select name="entrega">${entregas.map(e => `<option>${esc(e)}</option>`).join('')}</select></label>
      <label id="lend">Endereço para entrega<input name="endereco" autocomplete="street-address"></label>
      <label>Forma de pagamento<select name="pag">${pags.map(e => `<option>${esc(e)}</option>`).join('')}</select></label>
      <label>Observações<textarea name="obs" rows="2" placeholder="Cor, tom, horário…"></textarea></label>
      ${(loja.cupons || []).some(c => c.ativo !== false) ? `<label>Cupom de desconto<div class="campo-bt"><input name="cupom" placeholder="Tem um cupom?" style="text-transform:uppercase"><button type="button" class="btn" id="apcup">Aplicar</button></div><small id="cupmsg" class="mudo"></small></label>` : ''}
    </form>
    <div class="total-box"><span>Total</span><b id="tot"></b><small class="mudo" id="taxa"></small></div>
  </div>
  <div class="modal-f"><button class="btn" data-x>Continuar comprando</button><button class="btn pri" id="env">Enviar pedido</button></div></div>`;
  document.body.appendChild(bg);
  const f = $('#f', bg);
  try { const d = JSON.parse(localStorage.getItem('revendaos:cliente') || '{}'); f.nome.value = d.nome || ''; f.whatsapp.value = d.whatsapp || ''; f.endereco.value = d.endereco || ''; } catch { }
  const retira = () => /retir/i.test(f.entrega.value);
  const frete = () => retira() ? 0 : (Number(loja.taxa) || 0);
  const descCupom = () => { const c = cupomAplicado; if (!c) return 0; if (c.minimo && subtotal() < c.minimo) return 0; return Math.min(subtotal(), Math.round((c.tipo === 'valor' ? c.valor : subtotal() * c.valor / 100) * 100) / 100); };
  const atual = () => { $('#lend', bg).hidden = retira(); $('#tot', bg).textContent = brl(subtotal() - descCupom() + frete()); $('#taxa', bg).textContent = [descCupom() ? `cupom ${cupomAplicado.codigo}: − ${brl(descCupom())}` : '', frete() ? `entrega ${brl(frete())}` : ''].filter(Boolean).join(' · '); };
  const ap = $('#apcup', bg);
  if (ap) ap.onclick = () => {
    const cod = f.cupom.value.trim().toUpperCase();
    const c = (loja.cupons || []).find(x => x.codigo === cod && x.ativo !== false && (!x.validade || x.validade >= hojeISO()));
    cupomAplicado = c || null;
    $('#cupmsg', bg).textContent = !c ? 'Cupom inválido ou vencido.' : c.minimo && subtotal() < c.minimo ? `Válido para pedidos a partir de ${brl(c.minimo)}.` : `Cupom aplicado: ${c.tipo === 'valor' ? brl(c.valor) : c.valor + '%'} de desconto.`;
    atual();
  };
  f.entrega.onchange = atual; atual();
  $$('[data-x]', bg).forEach(b => b.onclick = () => bg.remove());
  $('#env', bg).onclick = async () => {
    if (!f.reportValidity()) return;
    if (soDigitos(f.whatsapp.value).length < 10) return alert('Informe um WhatsApp com DDD.');
    if (loja.minimo && subtotal() < loja.minimo) return alert(`O pedido mínimo é de ${brl(loja.minimo)}.`);
    if (!retira() && !f.endereco.value.trim()) return alert('Informe o endereço de entrega.');
    const its = linhas();
    const pedido = {
      cliente: { nome: f.nome.value.trim(), whatsapp: soDigitos(f.whatsapp.value), endereco: retira() ? '' : f.endereco.value.trim() },
      itens: its, frete: frete(), cupom: descCupom() ? cupomAplicado.codigo : '', desconto: descCupom(), total: Math.round((subtotal() - descCupom() + frete()) * 100) / 100, entrega: f.entrega.value, pagamento: f.pag.value,
      obs: f.obs.value.trim(), status: 'novo', criadoEm: Date.now()
    };
    $('#env', bg).disabled = true;
    try { await db.criarPedido(slug, pedido); }
    catch (e) { $('#env', bg).disabled = false; return alert('Não foi possível enviar o pedido agora. Tente novamente.'); }
    try { localStorage.setItem('revendaos:cliente', JSON.stringify(pedido.cliente)); } catch { }
    const pagaPix = !!(loja.pix && loja.pix.chave && /pix/i.test(pedido.pagamento));
    const msg = `Olá! Acabei de fazer um pedido na sua loja online 🛍️\n\n${its.map(l => `• ${l.qtd}x ${l.nome} — ${brl(l.qtd * l.preco)}`).join('\n')}${pedido.desconto ? `\nCupom ${pedido.cupom}: − ${brl(pedido.desconto)}` : ''}${pedido.frete ? `\nEntrega: ${brl(pedido.frete)}` : ''}\n\n*Total: ${brl(pedido.total)}*\nRecebimento: ${pedido.entrega}${pedido.cliente.endereco ? ' — ' + pedido.cliente.endereco : ''}\nPagamento: ${pedido.pagamento}${pagaPix ? ' (vou enviar o comprovante aqui)' : ''}${pedido.obs ? '\nObs.: ' + pedido.obs : ''}\n\nNome: ${pedido.cliente.nome}`;
    carrinho = {}; salvarCarrinho();
    const codPix = pagaPix ? pixPayload({ chave: loja.pix.chave, nome: loja.pix.nome, cidade: loja.pix.cidade, valor: pedido.total, txid: 'LOJA' + Date.now().toString(36).toUpperCase() }) : '';
    bg.querySelector('.modal').innerHTML = `<div class="modal-b ta-c" style="padding:28px"><h3>Pedido enviado! 🎉</h3>
      ${codPix ? `<p>Pague <b>${brl(pedido.total)}</b> pelo Pix e depois envie o comprovante no WhatsApp.</p><div class="qr" id="qrpix"></div>
        <textarea readonly rows="3" class="cheio" id="cpix">${esc(codPix)}</textarea><p><button class="btn" id="copix">Copiar código Pix</button></p>
        <p class="mudo pq">Recebedor: ${esc(loja.pix.nome || '')}. O pedido é confirmado assim que o comprovante for conferido.</p>`
      : `<p class="mudo">Agora é só confirmar pelo WhatsApp para combinar o pagamento e a entrega.</p>`}
      <a class="btn wa cheio" target="_blank" href="${waLink(loja.whatsapp, msg)}">${codPix ? 'Enviar comprovante no WhatsApp' : 'Confirmar no WhatsApp'}</a><p><button class="btn" data-x>Voltar à loja</button></p></div>`;
    if (codPix) { if (window.QRCode) new QRCode($('#qrpix', bg), { text: codPix, width: 200, height: 200 }); $('#copix', bg).onclick = async () => { await copiar(codPix); $('#copix', bg).textContent = 'Código copiado!'; }; }
    $$('[data-x]', bg).forEach(b => b.onclick = () => { bg.remove(); grade(); barra(); });
    if (!codPix) window.open(waLink(loja.whatsapp, msg), '_blank');
  };
}

iniciar();

document.addEventListener('error', e => { const i = e.target; if (i && i.tagName === 'IMG') { const pai = i.parentElement; i.remove(); if (pai) pai.classList.add('sem-foto'); } }, true);
