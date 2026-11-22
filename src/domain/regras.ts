import type {
  CategoriaFinanceira,
  ItemCompra,
  Lancamento,
  MovReserva,
  Pessoa,
  Preco,
} from './tipos'

// ---------- Dinheiro ----------

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 123456 → "R$ 1.234,56" */
export function brl(centavos: number): string {
  return fmt.format(centavos / 100).replace(/ /g, ' ')
}

/** Aceita "12,34", "12.34", "1.234,56", "R$ 9,9" → centavos. Retorna null se inválido. */
export function lerValor(texto: string): number | null {
  let t = texto.replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  // "1.500" ou "12.345.678" sem vírgula: ponto é separador de milhar.
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Math.round(parseFloat(t) * 100)
}

// ---------- Datas ----------

export function hojeISO(agora = new Date()): string {
  const y = agora.getFullYear()
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  const d = String(agora.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 2026-11-20 → 20/11/2026 */
export function dataBR(iso?: string): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
}

export function mesDe(dataISO: string): string {
  return dataISO.slice(0, 7)
}

/** Dias até a próxima entrada de qualquer pessoa (0 = hoje). null se ninguém tem dia definido. */
export function diasAteProximaEntrada(pessoas: Pessoa[], agora = new Date()): number | null {
  const dias = pessoas.flatMap((p) => p.diasPagamento).filter((d) => d >= 1 && d <= 31)
  if (dias.length === 0) return null
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  let menor = Infinity
  for (const d of dias) {
    for (const deslocMes of [0, 1]) {
      const ano = hoje.getFullYear()
      const mes = hoje.getMonth() + deslocMes
      const ultimoDia = new Date(ano, mes + 1, 0).getDate()
      const alvo = new Date(ano, mes, Math.min(d, ultimoDia))
      const diff = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000)
      if (diff >= 0 && diff < menor) menor = diff
    }
  }
  return menor
}

// ---------- Código de barras ----------

/** Confere o dígito verificador de um EAN-8, EAN-13 ou GTIN-14. */
export function eanValido(codigo: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(codigo)) return false
  const digitos = codigo.split('').map(Number)
  const dv = digitos.pop()!
  const soma = digitos
    .reverse()
    .reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === dv
}

export interface EtiquetaBalanca {
  /** Código do produto na balança do mercado. */
  codigo: string
  /** Valor total da etiqueta, em centavos. */
  valor: number
}

/**
 * Etiqueta de balança (EAN-13 que começa com "2").
 * Formato padrão usado aqui: 2 CCCC X VVVVVV D
 *   C = código do produto (4 dígitos), X = ignorado, V = valor total em centavos, D = verificador.
 * O formato varia por mercado/balança: conferir com uma etiqueta real do Rissul.
 */
export function lerEtiquetaBalanca(codigo: string): EtiquetaBalanca | null {
  if (codigo.length !== 13 || codigo[0] !== '2' || !eanValido(codigo)) return null
  return { codigo: codigo.slice(1, 5), valor: Number(codigo.slice(6, 12)) }
}

// ---------- Preços ----------

export interface Sugestao {
  valor: number
  data: string
  mercadoId: number
  /** true quando o preço é de outro mercado (não há registro no mercado atual). */
  outroMercado: boolean
}

function maisRecente(a: Preco, b: Preco): Preco {
  if (a.data !== b.data) return a.data > b.data ? a : b
  // Mesmo dia: preço da nota fiscal vale mais que o digitado.
  if (a.origem === 'nota' && b.origem !== 'nota') return a
  if (b.origem === 'nota' && a.origem !== 'nota') return b
  return (a.id ?? 0) > (b.id ?? 0) ? a : b
}

/** Último preço do produto neste mercado; se não houver, o último em qualquer mercado. */
export function precoSugerido(precos: Preco[], produtoId: string, mercadoId: number): Sugestao | null {
  const doProduto = precos.filter((p) => p.produtoId === produtoId)
  if (doProduto.length === 0) return null
  const aqui = doProduto.filter((p) => p.mercadoId === mercadoId)
  const base = aqui.length > 0 ? aqui : doProduto
  const p = base.reduce(maisRecente)
  return { valor: p.valor, data: p.data, mercadoId: p.mercadoId, outroMercado: aqui.length === 0 }
}

// ---------- Carrinho ----------

export function totalCarrinho(itens: ItemCompra[]): number {
  return itens.reduce((s, i) => s + Math.round(i.valorUnit * i.quantidade), 0)
}

export function totalExtras(itens: ItemCompra[]): number {
  return totalCarrinho(itens.filter((i) => !i.naLista))
}

/** "Arroz Branco  5kg" → "arroz branco 5kg" (para casar item da lista com produto lido). */
export function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- Painel do mês ----------

export interface LinhaCategoria {
  categoria: CategoriaFinanceira
  gasto: number
  limite?: number
  /** gasto / limite (0–n), só quando há limite. */
  uso?: number
}

export interface ResumoMes {
  mes: string
  entradas: number
  gasto: number
  categorias: LinhaCategoria[]
  alertas: { categoria: CategoriaFinanceira; uso: number; gasto: number; limite: number }[]
}

export const LIMIAR_ALERTA = 0.8

export function resumoDoMes(
  mes: string,
  lancamentos: Lancamento[],
  pessoas: Pessoa[],
  limites: Partial<Record<CategoriaFinanceira, number>>,
): ResumoMes {
  const doMes = lancamentos.filter((l) => mesDe(l.data) === mes)
  const porCat = new Map<CategoriaFinanceira, number>()
  for (const l of doMes) porCat.set(l.categoria, (porCat.get(l.categoria) ?? 0) + l.valor)
  for (const c of Object.keys(limites) as CategoriaFinanceira[]) if (!porCat.has(c)) porCat.set(c, 0)

  const categorias: LinhaCategoria[] = [...porCat.entries()]
    .map(([categoria, gasto]) => {
      const limite = limites[categoria]
      return limite ? { categoria, gasto, limite, uso: gasto / limite } : { categoria, gasto }
    })
    .sort((a, b) => b.gasto - a.gasto)

  const alertas = categorias
    .filter((c) => c.limite && c.uso! >= LIMIAR_ALERTA)
    .map((c) => ({ categoria: c.categoria, uso: c.uso!, gasto: c.gasto, limite: c.limite! }))
    .sort((a, b) => b.uso - a.uso)

  return {
    mes,
    entradas: pessoas.reduce((s, p) => s + p.entradaMensal, 0),
    gasto: doMes.reduce((s, l) => s + l.valor, 0),
    categorias,
    alertas,
  }
}

// ---------- Reserva ----------

export function metaReserva(entradas: number, pct: number): number {
  return Math.round((entradas * pct) / 100)
}

export function separadoNoMes(movs: MovReserva[], mes: string): number {
  return movs.filter((m) => m.mes === mes).reduce((s, m) => s + m.valor, 0)
}

// ---------- Nota fiscal (NFC-e) ----------

/** Dígito verificador da chave de acesso (módulo 11, pesos 2 a 9 da direita para a esquerda). */
export function dvChaveNFe(chave43: string): number {
  let soma = 0
  let peso = 2
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso
    peso = peso === 9 ? 2 : peso + 1
  }
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export interface LeituraNota {
  chave: string
  url?: string
  cnpj: string
  /** AAAA-MM */
  emissao: string
  /** 65 = NFC-e (cupom do consumidor), 55 = NF-e. */
  modelo: string
}

/**
 * Lê o QR Code da nota (link da SEFAZ com ?p=CHAVE|...) ou a chave de 44 dígitos digitada.
 * Retorna null se não houver uma chave válida.
 */
export function lerNotaFiscal(texto: string): LeituraNota | null {
  const t = texto.trim()
  let url: string | undefined
  let candidato = t.replace(/\s/g, '')
  if (/^https?:\/\//i.test(t)) {
    url = t
    try {
      const p = new URL(t).searchParams.get('p') ?? new URL(t).searchParams.get('chNFe') ?? ''
      candidato = p.split('|')[0]
    } catch {
      return null
    }
    if (!/^\d{44}$/.test(candidato)) candidato = (t.match(/\d{44}/) ?? [''])[0]
  }
  if (!/^\d{44}$/.test(candidato)) return null
  if (dvChaveNFe(candidato.slice(0, 43)) !== Number(candidato[43])) return null
  return {
    chave: candidato,
    url,
    cnpj: candidato.slice(6, 20),
    emissao: `20${candidato.slice(2, 4)}-${candidato.slice(4, 6)}`,
    modelo: candidato.slice(20, 22),
  }
}

/** 12345678000190 → 12.345.678/0001-90 */
export function formatarCNPJ(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

// ---------- Cartões ----------

/** Gasto do mês por cartão (id); lançamentos sem cartão ficam em "sem". */
export function gastoPorCartao(lancamentos: Lancamento[], mes: string): Map<number | 'sem', number> {
  const m = new Map<number | 'sem', number>()
  for (const l of lancamentos) {
    if (mesDe(l.data) !== mes) continue
    const k = l.cartaoId ?? 'sem'
    m.set(k, (m.get(k) ?? 0) + l.valor)
  }
  return m
}
