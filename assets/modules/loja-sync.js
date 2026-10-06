// Gera as operações para manter a vitrine pública (loja virtual) sincronizada com o estoque
import { S, qtdProduto, promoAtiva } from '../core.js';

export function opsItemLoja(p, apagar = false, qtdForcada = null) {
  const lj = S.conta.loja || {};
  if (!lj.slug || !lj.ativa || !p || !p.id) return [];
  const path = `lojas/${lj.slug}/itens/${p.id}`;
  if (apagar || !p.naLoja || p.ativo === false) return [{ op: 'del', path }];
  const q = qtdForcada != null ? qtdForcada : qtdProduto(p);
  const base = Number(p.precoLoja) || Number(p.preco) || 0;
  const pr = promoAtiva(p, 'loja');
  return [{
    op: 'set', path, data: {
      nome: p.nome, marca: p.marca || '', categoria: p.categoria || '', descricao: p.descricao || '', ref: p.sku || '',
      preco: base, precoPromo: pr ? pr.preco : 0, promoNome: pr ? pr.promo.nome : '', promoAte: pr ? (pr.promo.fim || '') : '', promoDe: pr ? (pr.promo.inicio || '') : '',
      foto: p.foto || '', fotos: (p.fotos || []).slice(0, 4),
      disponivel: q > 0, qtd: lj.mostrarEstoque ? q : null, atualizadoEm: Date.now()
    }
  }];
}
