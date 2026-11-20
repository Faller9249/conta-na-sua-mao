// Valores em dinheiro são sempre inteiros em centavos (R$ 12,34 = 1234).

export const CATEGORIAS_FINANCEIRAS = [
  'Mercado',
  'Delivery',
  'Transporte',
  'Moradia e contas',
  'Saúde',
  'Assinaturas',
  'Lazer',
  'Outros',
] as const
export type CategoriaFinanceira = (typeof CATEGORIAS_FINANCEIRAS)[number]

export const CATEGORIAS_PRODUTO = [
  'Hortifrúti',
  'Carnes e frios',
  'Laticínios',
  'Grãos e massas',
  'Mercearia',
  'Bebidas',
  'Padaria',
  'Limpeza',
  'Higiene',
  'Outros',
] as const
export type CategoriaProduto = (typeof CATEGORIAS_PRODUTO)[number]

export interface Casa {
  id: 'casa'
  nome: string
  /** Porcentagem das entradas a guardar por mês (ex.: 5 = 5%). */
  reservaPct: number
  /** Limite mensal por categoria, em centavos. Categoria sem limite fica de fora. */
  limites: Partial<Record<CategoriaFinanceira, number>>
  criadaEm: string
}

export interface Pessoa {
  id?: number
  nome: string
  /** Entrada mensal em centavos. */
  entradaMensal: number
  /** Dias do mês em que a entrada cai (ex.: [6, 20]). */
  diasPagamento: number[]
}

export interface Produto {
  /** Código de barras (EAN) quando existe; senão "nome:<nome normalizado>". */
  id: string
  ean?: string
  nome: string
  marca?: string
  quantidade?: string
  categoria: CategoriaProduto
}

export interface Mercado {
  id?: number
  nome: string
}

export type OrigemPreco = 'digitado' | 'nota' | 'balanca'

export interface Preco {
  id?: number
  produtoId: string
  mercadoId: number
  /** Preço unitário em centavos. */
  valor: number
  /** Data ISO (AAAA-MM-DD). */
  data: string
  origem: OrigemPreco
}

export interface ItemLista {
  id?: number
  nome: string
  produtoId?: string
  quantidade: number
  categoria: CategoriaProduto
  /** 1 quando já foi pego no carrinho da compra aberta (Dexie indexa números, não booleanos). */
  pego: 0 | 1
  criadoEm: string
}

export interface Compra {
  id?: number
  mercadoId: number
  inicio: string
  fim?: string
  status: 'aberta' | 'finalizada'
  /** Orçamento definido ao iniciar a compra, em centavos. */
  orcamento: number
}

export interface ItemCompra {
  id?: number
  compraId: number
  produtoId: string
  nome: string
  quantidade: number
  /** Preço unitário em centavos. */
  valorUnit: number
  origemPreco: OrigemPreco
  /** Item estava na lista? Se não, conta como "extra". */
  naLista: boolean
  itemListaId?: number
}

export interface Lancamento {
  id?: number
  /** Data ISO (AAAA-MM-DD). */
  data: string
  valor: number
  categoria: CategoriaFinanceira
  descricao: string
  origem: 'compra' | 'manual'
  compraId?: number
  pessoaId?: number
}

export interface MovReserva {
  id?: number
  /** Mês de referência AAAA-MM. */
  mes: string
  valor: number
  data: string
}
