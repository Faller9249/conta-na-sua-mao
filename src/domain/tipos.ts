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

export const TIPOS_CARTAO = ['Crédito', 'Débito', 'Pix / conta', 'Dinheiro', 'Vale-alimentação'] as const
export type TipoCartao = (typeof TIPOS_CARTAO)[number]

export interface Casa {
  id: 'casa'
  nome: string
  /** Porcentagem das entradas a guardar por mês (ex.: 5 = 5%). */
  reservaPct: number
  /** Limite mensal por categoria, em centavos. Categoria sem limite fica de fora. */
  limites: Partial<Record<CategoriaFinanceira, number>>
  /** Lista de compras aberta na tela Lista. */
  listaAtivaId?: number
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

/**
 * Cartão ou forma de pagamento. Guardamos só um apelido (ex.: "Inter crédito"),
 * nunca o número do cartão.
 */
export interface Cartao {
  id?: number
  nome: string
  tipo: TipoCartao
  pessoaId?: number
  /** 0 = removido (some das opções, mas continua no histórico). */
  ativo: 0 | 1
}

export interface Produto {
  /** Código de barras (EAN) quando existe; senão "nome:<nome normalizado>". */
  id: string
  ean?: string
  nome: string
  marca?: string
  quantidade?: string
  categoria: CategoriaProduto
  /** Códigos internos do mercado já ligados a este produto pela nota ("CNPJ:código"). */
  codigosNota?: string[]
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

/** Lista de compras com nome (ex.: "Compras da semana", "Churrasco de sábado"). */
export interface ListaCompras {
  id?: number
  nome: string
  criadaEm: string
}

export interface ItemLista {
  id?: number
  listaId: number
  nome: string
  /** Marca preferida (opcional). */
  marca?: string
  produtoId?: string
  quantidade: number
  categoria: CategoriaProduto
  /** 1 quando já foi pego no carrinho da compra aberta (Dexie indexa números, não booleanos). */
  pego: 0 | 1
  criadoEm: string
}

/** Nota fiscal do consumidor (NFC-e) lida pelo QR Code, depois da compra. */
export interface NotaFiscal {
  /** Chave de acesso de 44 dígitos. */
  chave: string
  /** Link de consulta da SEFAZ, quando veio do QR Code. */
  url?: string
  /** CNPJ do mercado (tirado da chave). */
  cnpj: string
  /** Mês de emissão AAAA-MM (tirado da chave). */
  emissao: string
  lidaEm: string
}

export interface Compra {
  id?: number
  mercadoId: number
  listaId?: number
  /** Nome da lista no momento da compra (fica no histórico mesmo se a lista for apagada). */
  nomeLista?: string
  cartaoId?: number
  inicio: string
  fim?: string
  status: 'aberta' | 'finalizada'
  /** Orçamento definido ao iniciar a compra, em centavos. */
  orcamento: number
  nota?: NotaFiscal
  /** Itens lidos da nota na SEFAZ, para conferir com o carrinho. */
  conferencia?: ConferenciaNota
}

export interface ItemNotaSalvo {
  codigo: string
  descricao: string
  quantidade: number
  unidade: string
  valorUnit: number
  valorTotal: number
}

export interface ConferenciaNota {
  emitente: string
  cnpj: string
  total: number
  pagamento?: string
  emissao?: string
  itens: ItemNotaSalvo[]
  lidaEm: string
  /** Data em que os valores da nota foram aplicados à compra. */
  aplicadaEm?: string
}

export interface ItemCompra {
  id?: number
  compraId: number
  produtoId: string
  nome: string
  marca?: string
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
  cartaoId?: number
}

export interface MovReserva {
  id?: number
  /** Mês de referência AAAA-MM. */
  mes: string
  valor: number
  data: string
}
