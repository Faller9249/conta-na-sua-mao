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

// ---------- Código do produto (Fase 2) ----------

/** Código para mostrar ao casal: o EAN, "balança 1234" ou null (item entrou pelo nome). */
export function codigoDoProduto(produtoId: string): string | null {
  if (produtoId.startsWith('nome:')) return null
  if (produtoId.startsWith('balanca:')) return `balança ${produtoId.split(':')[2] ?? ''}`.trim()
  return produtoId
}

const PALAVRAS_VAZIAS = new Set(['com', 'sem', 'tipo', 'para', 'pct', 'und', 'unid'])

function palavras(nome: string): string[] {
  return normalizarNome(nome)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p) && !/^\d/.test(p))
}

/**
 * Os dois nomes parecem do mesmo produto? Basta dividirem uma palavra que importa
 * ("Arroz" e "Arroz branco Tio João" sim; "Feijão" e "Arroz Tio João" não).
 */
export function nomesCombinam(a: string, b: string): boolean {
  const pa = palavras(a)
  const pb = palavras(b)
  if (pa.length === 0 || pb.length === 0) return normalizarNome(a) === normalizarNome(b)
  return pa.some((p) => pb.some((q) => p === q || p.startsWith(q) || q.startsWith(p)))
}

/** Item da lista que o produto lido atende: pelo código já ligado ou pelo começo do nome. */
export function itemDaListaPara<T extends { produtoId?: string; nome: string }>(pendentes: T[], produto: { id: string; nome: string }): T | undefined {
  const alvo = normalizarNome(produto.nome)
  return (
    pendentes.find((i) => i.produtoId === produto.id) ??
    pendentes.find((i) => normalizarNome(i.nome) === alvo || alvo.startsWith(normalizarNome(i.nome)))
  )
}

// ---------- Comparação entre mercados (Fase 2) ----------

/** Último preço do produto em cada mercado. */
export function ultimoPrecoPorMercado(precos: Preco[], produtoId: string): Map<number, Preco> {
  const m = new Map<number, Preco>()
  for (const p of precos) {
    if (p.produtoId !== produtoId) continue
    const atual = m.get(p.mercadoId)
    m.set(p.mercadoId, atual ? maisRecente(atual, p) : p)
  }
  return m
}

/** Mercado onde o produto estava mais barato, se for outro e mais barato que o mercado atual. */
export function maisBaratoEmOutro(precos: Preco[], produtoId: string, mercadoId: number): Preco | null {
  const porMercado = ultimoPrecoPorMercado(precos, produtoId)
  const aqui = porMercado.get(mercadoId)
  let melhor: Preco | null = null
  for (const [id, p] of porMercado) if (id !== mercadoId && (!melhor || p.valor < melhor.valor)) melhor = p
  if (!melhor || (aqui && melhor.valor >= aqui.valor)) return null
  return melhor
}

export interface EstimativaMercado {
  mercadoId: number
  total: number
  /** Quantos itens da lista têm preço neste mercado. */
  comPreco: number
}

/**
 * Quanto a lista sairia em cada mercado, pelo último preço de cada item lá.
 * Ordena por quem tem mais itens com preço e, empatando, pelo menor total.
 */
export function estimarListaPorMercado(itens: { produtoId?: string; quantidade: number }[], precos: Preco[]): EstimativaMercado[] {
  const res = new Map<number, EstimativaMercado>()
  for (const i of itens) {
    if (!i.produtoId) continue
    for (const [mercadoId, p] of ultimoPrecoPorMercado(precos, i.produtoId)) {
      const e = res.get(mercadoId) ?? { mercadoId, total: 0, comPreco: 0 }
      e.total += p.valor * i.quantidade
      e.comPreco += 1
      res.set(mercadoId, e)
    }
  }
  return [...res.values()].sort((a, b) => b.comPreco - a.comPreco || a.total - b.total)
}

// ---------- Lista automática (Fase 2) ----------

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

export interface SugestaoCompra {
  produtoId: string
  nome: string
  marca?: string
  /** Em quantas compras diferentes o produto apareceu. */
  vezes: number
  /** De quantos em quantos dias costumam comprar. */
  intervaloDias: number
  /** Dias desde a última compra. */
  diasDesde: number
}

/**
 * Produtos que costumam comprar e que já devem estar acabando: comprados em pelo menos
 * 2 compras e com o tempo desde a última compra perto do intervalo de costume.
 */
export function sugerirParaLista(
  compras: { id?: number; fim?: string; inicio: string; status: string }[],
  itens: ItemCompra[],
  hoje: string,
  jaNaLista: { produtoId?: string; nome: string }[],
  limite = 8,
): SugestaoCompra[] {
  const dataDe = new Map(compras.filter((c) => c.status === 'finalizada').map((c) => [c.id!, c.fim ?? c.inicio]))
  const porProduto = new Map<string, { nome: string; marca?: string; datas: Set<string> }>()
  for (const i of itens) {
    const data = dataDe.get(i.compraId)
    if (!data) continue
    const p = porProduto.get(i.produtoId) ?? { nome: i.nome, marca: i.marca, datas: new Set<string>() }
    p.datas.add(data)
    porProduto.set(i.produtoId, p)
  }
  const ids = new Set(jaNaLista.map((i) => i.produtoId).filter(Boolean))
  const sugestoes: (SugestaoCompra & { urgencia: number })[] = []
  for (const [produtoId, p] of porProduto) {
    if (ids.has(produtoId) || jaNaLista.some((i) => nomesCombinam(i.nome, p.nome))) continue
    const datas = [...p.datas].sort()
    if (datas.length < 2) continue
    const intervaloDias = Math.max(1, Math.round(diasEntre(datas[0], datas[datas.length - 1]) / (datas.length - 1)))
    const diasDesde = diasEntre(datas[datas.length - 1], hoje)
    const urgencia = diasDesde / intervaloDias
    if (urgencia < 0.8) continue
    sugestoes.push({ produtoId, nome: p.nome, marca: p.marca, vezes: datas.length, intervaloDias, diasDesde, urgencia })
  }
  return sugestoes
    .sort((a, b) => b.urgencia - a.urgencia || b.vezes - a.vezes)
    .slice(0, limite)
    .map(({ urgencia, ...s }) => (void urgencia, s))
}
