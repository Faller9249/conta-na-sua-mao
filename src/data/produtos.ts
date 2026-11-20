import type { CategoriaProduto, Produto } from '../domain/tipos'
import type { BancoCasa } from './db'

export interface ProdutoEncontrado {
  nome: string
  marca?: string
  quantidade?: string
  categoria: CategoriaProduto
}

/** Palavras das categorias do Open Food Facts → categoria do app. */
const MAPA: [RegExp, CategoriaProduto][] = [
  [/beverage|bebida|drink|soda|refrigerante|juice|suco|water|agua/i, 'Bebidas'],
  [/dair|milk|leite|cheese|queijo|yogurt|iogurte/i, 'Laticínios'],
  [/meat|carne|chicken|frango|sausage|linguica|ham|presunto/i, 'Carnes e frios'],
  [/rice|arroz|bean|feij|pasta|macarr|cereal|grain/i, 'Grãos e massas'],
  [/fruit|vegetable|fruta|legume|verdura/i, 'Hortifrúti'],
  [/bread|pao|bakery|biscuit|biscoito/i, 'Padaria'],
  [/clean|limpeza|detergent|deterg/i, 'Limpeza'],
  [/hygien|higiene|toilet|shampoo|soap|sabonete/i, 'Higiene'],
]

export function categoriaPorTexto(texto: string): CategoriaProduto {
  for (const [re, cat] of MAPA) if (re.test(texto)) return cat
  return 'Mercearia'
}

/**
 * Busca o nome do produto pelo código de barras na base pública Open Food Facts.
 * Só o código de barras sai do celular. Retorna null se não achar ou se estiver sem internet.
 */
export async function buscarNoOpenFoodFacts(
  ean: string,
  fetcher: typeof fetch = fetch,
): Promise<ProdutoEncontrado | null> {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=product_name,product_name_pt,brands,quantity,categories`
    const r = await fetcher(url)
    if (!r.ok) return null
    const j = (await r.json()) as {
      status?: number
      product?: { product_name?: string; product_name_pt?: string; brands?: string; quantity?: string; categories?: string }
    }
    const p = j.product
    const nome = p?.product_name_pt || p?.product_name
    if (j.status !== 1 || !nome) return null
    return {
      nome: nome.trim(),
      marca: p?.brands?.split(',')[0]?.trim() || undefined,
      quantidade: p?.quantity?.trim() || undefined,
      categoria: categoriaPorTexto(`${p?.categories ?? ''} ${nome}`),
    }
  } catch {
    return null
  }
}

/** Procura primeiro no catálogo da casa; depois na base pública (e salva no catálogo). */
export async function buscarProduto(banco: BancoCasa, ean: string): Promise<Produto | null> {
  const local = await banco.produtos.get(ean)
  if (local) return local
  const achado = await buscarNoOpenFoodFacts(ean)
  if (!achado) return null
  const produto: Produto = { id: ean, ean, ...achado }
  await banco.produtos.put(produto)
  return produto
}
