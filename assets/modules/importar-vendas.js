// Importa o histórico de vendas de outro sistema (ex.: Revendi) a partir de uma planilha CSV.
// Colunas: data; cliente; itens; total; pagamento; entrega; lucro; tipo; grupo
//   tipo = venda      → venda comum (total e lucro como no sistema antigo)
//   tipo = consorcio  → inscrição no consórcio (não vira venda: marca as parcelas no grupo quando "Pago")
//   tipo = resgate    → cliente usou o crédito do consórcio (grupo) e pagou a diferença (total)
import { esc, brl, parseNum, uid, r2, norm, parseCSV, lerArquivo } from '../utils.js';
import { S, modal, toast, commit, proxNumero, icon } from '../core.js';
import { mesesEntre, creditoGrupo, opsResgate } from './consorcios.js';

const dataISO = d => { const m = String(d || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; };
const statusPag = t => { const n = norm(t); return n.startsWith('pago parc') || n.includes('parcial') ? 'parcial' : n.startsWith('pago') || n === 'quitado' ? 'pago' : 'pendente'; };
const statusEnt = t => { const n = norm(t); return n.includes('a entregar') || n.includes('pendente') ? 'pendente' : n.includes('separ') ? 'separado' : n.includes('envi') ? 'enviado' : 'entregue'; };
const chave = r => [r.data, norm(r.cliente), r.total, norm(r.tipo || 'venda')].join('|');

export async function importarHistorico() {
  const txt = await lerArquivo('.csv,text/csv'); if (!txt) return;
  const rows = parseCSV(txt).map(r => ({ ...r, iso: dataISO(r.data) })).filter(r => r.iso && r.cliente);
  if (!rows.length) return toast('Nenhuma linha válida. Colunas: data; cliente; itens; total; pagamento; entrega; lucro; tipo; grupo', 'erro');
  rows.sort((a, b) => a.iso.localeCompare(b.iso));

  const jaImport = new Set(S.d.vendas.map(v => v.importKey).filter(Boolean));
  S.d.consorcios.forEach(g => (g.importados || []).forEach(k => jaImport.add(k)));
  const novas = rows.filter(r => !jaImport.has(chave(r)));
  const grupoDe = r => { const n = parseInt(String(r.grupo || '').replace(/\D/g, '')); return S.d.consorcios.find(g => g.grupo === n); };
  const precisaGrupo = novas.filter(r => /consorcio|resgate/.test(norm(r.tipo)));
  const semGrupo = [...new Set(precisaGrupo.filter(r => !grupoDe(r)).map(r => r.grupo))];

  const cont = { venda: 0, resgate: 0, consorcio: 0 };
  novas.forEach(r => { const t = norm(r.tipo || 'venda'); cont[t in cont ? t : 'venda']++; });
  const m = modal({
    titulo: 'Importar histórico de vendas',
    corpo: `<p>Encontrei <b>${rows.length}</b> linha(s)${rows.length - novas.length ? `, das quais ${rows.length - novas.length} já foram importadas antes` : ''}:</p>
      <ul><li><b>${cont.venda}</b> venda(s)</li><li><b>${cont.resgate}</b> venda(s) pagas com crédito de consórcio (resgate)</li><li><b>${cont.consorcio}</b> inscrição(ões) em consórcio — não viram venda: as quitadas têm todas as parcelas marcadas no grupo</li></ul>
      ${semGrupo.length ? `<div class="aviso-box">${icon('alert')}<span>Os grupos ${semGrupo.map(esc).join(', ')} ainda não existem. Importe as clientes e crie os grupos em <b>Consórcios</b> antes — essas linhas serão ignoradas.</span></div>` : ''}
      <p class="mudo pq">As vendas entram com o total e o lucro do sistema antigo, sem mexer no estoque e sem lançar no caixa. As que estão pendentes ou pagas parcialmente ficam em aberto em Cobranças.</p>`,
    rodape: `<button class="btn" data-fechar>Cancelar</button><button class="btn pri" id="ok" ${novas.length ? '' : 'disabled'}>${icon('check')}Importar</button>`
  });
  m.$('#ok').onclick = async () => {
    m.$('#ok').disabled = true;
    const ops = []; let numero = proxNumero('vendas');
    const clientes = new Map(S.d.clientes.map(c => [norm(c.nome), c]));
    const grupos = new Map(); // id → cópia editável
    const gEd = g => { if (!grupos.has(g.id)) grupos.set(g.id, { ...structuredClone(g), importados: [...(g.importados || [])] }); return grupos.get(g.id); };
    const res = { vendas: 0, resgates: 0, quitados: 0, parciais: [], ignoradas: 0 };

    for (const r of novas) {
      const tipo = norm(r.tipo || 'venda');
      let cli = clientes.get(norm(r.cliente));
      if (!cli) { cli = { id: uid(), nome: r.cliente.trim(), whatsapp: '', tags: [], criadoEm: Date.now() }; clientes.set(norm(cli.nome), cli); const { id, ...d } = cli; ops.push({ op: 'set', col: 'clientes', id, data: d }); }
      const pag = statusPag(r.pagamento), total = r2(parseNum(r.total)), lucro = r2(parseNum(r.lucro)), qtd = Math.max(1, parseInt(r.itens) || 1);
      const g0 = /consorcio|resgate/.test(tipo) ? grupoDe(r) : null;
      if (/consorcio|resgate/.test(tipo) && !g0) { res.ignoradas++; continue; }

      if (tipo === 'consorcio') {
        const g = gEd(g0); g.importados.push(chave(r));
        if (!(g.participantes || []).some(p => p.clienteId === cli.id)) { res.ignoradas++; continue; }
        if (pag === 'pago') {
          g.pagamentos = g.pagamentos || {}; g.pagamentos[cli.id] = g.pagamentos[cli.id] || {};
          mesesEntre(g.inicio, g.fim).forEach(x => { if (!g.pagamentos[cli.id][x]) g.pagamentos[cli.id][x] = { data: `${x}-${String(Math.min(Number(g.diaVencimento) || 10, 28)).padStart(2, '0')}`, valor: g.valor, forma: 'Antes do sistema', importado: true }; });
          res.quitados++;
        } else res.parciais.push(`${cli.nome.split(' ')[0]} (G${g.grupo})`);
        continue;
      }

      const id = uid(), num = numero++;
      let credito = 0, g = null;
      if (tipo === 'resgate') {
        g = gEd(g0);
        const p = (g.participantes || []).find(x => x.clienteId === cli.id);
        if (!p) { res.ignoradas++; numero--; continue; }
        credito = creditoGrupo(g);
      }
      const valorVenda = r2(total + credito), custo = r2(total - lucro);
      const venda = {
        numero: num, data: r.iso, clienteId: cli.id, clienteNome: cli.nome, clienteFone: cli.whatsapp || '',
        itens: [{ prodId: '', nome: 'Itens da venda (importado)', marca: '', categoria: '', qtd, preco: r2(valorVenda / qtd), custo, baixas: [] }],
        subtotal: valorVenda, desconto: 0, frete: 0, total: valorVenda, custoTotal: custo,
        forma: credito ? `Crédito consórcio G${g.grupo}${total > 0 ? ' + diferença' : ''}` : 'Importado', parcelas: 1,
        vendedorUid: S.user.uid, vendedorNome: S.membro.nome || '', comissaoPct: 0, comissaoValor: 0,
        statusEntrega: statusEnt(r.entrega), obs: pag === 'parcial' ? 'Estava "pago parcialmente" no sistema antigo: confira quanto já foi pago e registre em Cobranças.' : '',
        juros: 0, taxaCartaoPct: 0, taxaCartaoValor: 0, cupom: '', origem: 'balcao', pedidoId: '', cancelada: false,
        importado: true, importKey: chave(r), criadoEm: Date.now(), criadoPor: S.user.uid,
        ...(credito ? { consorcio: { grupo: g.grupo, grupoId: g.id, credito } } : {})
      };
      ops.push({ op: 'set', col: 'vendas', id, data: venda });
      const base = { vendaId: id, numeroVenda: num, clienteId: cli.id, clienteNome: cli.nome, clienteFone: cli.whatsapp || '', criadoEm: Date.now() };
      if (credito) {
        ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: 0, totalParcelas: 1, valor: credito, pago: credito, vencimento: r.iso, forma: 'Crédito de consórcio', consorcio: true, pagamentos: [{ data: r.iso, valor: credito, forma: 'Crédito de consórcio' }] } });
        const op = opsResgate(g, cli.id, { vendaId: id, numero: num, valor: credito, data: r.iso }); void op; // grupo é salvo no fim
        res.resgates++;
      } else res.vendas++;
      if (total > 0) {
        const pago = pag === 'pago' ? total : 0;
        ops.push({ op: 'set', col: 'recebiveis', id: uid(), data: { ...base, parcela: 1, totalParcelas: 1, valor: total, pago, vencimento: r.iso, forma: pag === 'pago' ? 'Importado' : 'Fiado / a prazo', pagamentos: pago ? [{ data: r.iso, valor: pago, forma: 'Importado' }] : [], ...(pag === 'parcial' ? { obs: 'Pago parcialmente no sistema antigo' } : {}) } });
      }
    }
    grupos.forEach(g => { const { id, ...d } = g; ops.push({ op: 'upd', col: 'consorcios', id, data: { participantes: d.participantes || [], pagamentos: d.pagamentos || {}, importados: d.importados } }); });
    if (!ops.length) { toast('Nada para importar.', 'aviso'); return m.fechar(); }
    if (await commit(ops, `Importou histórico: ${res.vendas} vendas, ${res.resgates} resgates de consórcio`)) {
      m.fechar();
      modal({
        titulo: 'Histórico importado',
        corpo: `<ul><li><b>${res.vendas}</b> venda(s) importada(s)</li><li><b>${res.resgates}</b> venda(s) com crédito de consórcio — as participantes ficaram marcadas como “crédito usado”</li><li><b>${res.quitados}</b> participante(s) de consórcio com todas as parcelas quitadas</li>${res.ignoradas ? `<li class="t-perigo">${res.ignoradas} linha(s) ignorada(s) (grupo ou participante não encontrado)</li>` : ''}</ul>
          ${res.parciais.length ? `<div class="aviso-box">${icon('alert')}<span><b>${res.parciais.length}</b> inscrição(ões) estavam “pagas parcialmente”: ${res.parciais.map(esc).join(', ')}. Em <b>Consórcios</b>, abra cada grupo e use <b>Marcar pagos até…</b>, depois toque no mês de quem estiver devendo para desfazer.</span></div>` : ''}`,
        rodape: '<button class="btn pri" data-fechar>Ok</button>'
      });
    } else m.$('#ok').disabled = false;
  };
}
