// Leitura da página da NFC-e (SEFAZ / SVRS) e conferência com o carrinho.
import { normalizarNome } from './regras'
import type { ItemCompra, ItemNotaSalvo } from './tipos'

/** Item da nota. O código é interno do mercado (não é o código de barras). */
export type ItemNota = ItemNotaSalvo

export interface NotaLida {
  emitente: string
  cnpj: string
  itens: ItemNota[]
  /** Valor a pagar, em centavos. */
  total: number
  pagamento?: string
  /** AAAA-MM-DD */
  emissao?: string
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function texto(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** "1.234,56" / "12,9" / "2" → centavos */
function centavos(v: string): number {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function numero(v: string): number {
  const n = Number(v.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function classe(html: string, nome: string): string | undefined {
  const m = html.match(new RegExp(`class="[^"]*\\b${nome}\\b[^"]*"[^>]*>([\\s\\S]*?)</(?:span|div|label)>`, 'i'))
  return m ? texto(m[1]) : undefined
}

/**
 * Lê o HTML da consulta da NFC-e (layout da SVRS, usado no RS e em outros estados).
 * Retorna null se a página não tiver itens (nota inválida, fora do ar, layout diferente).
 */
export function lerPaginaNota(html: string): NotaLida | null {
  const itens: ItemNota[] = []
  for (const linha of html.match(/<tr[^>]*id="Item[\s\S]*?<\/tr>/gi) ?? []) {
    const descricao = classe(linha, 'txtTit')
    const codigo = (classe(linha, 'RCod') ?? '').replace(/\D/g, '')
    const qtd = (classe(linha, 'Rqtd') ?? '').replace(/Qtde\.?:/i, '').trim()
    const un = (classe(linha, 'RUN') ?? '').replace(/UN:/i, '').trim()
    const unit = (classe(linha, 'RvlUnit') ?? '').replace(/Vl\. Unit\.:/i, '').trim()
    const total = classe(linha, 'valor') ?? ''
    if (!descricao) continue
    itens.push({ codigo, descricao, quantidade: numero(qtd) || 1, unidade: un || 'UN', valorUnit: centavos(unit), valorTotal: centavos(total) })
  }
  if (itens.length === 0) return null
  const emitente = texto(html.match(/class="txtTopo"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '')
  const cnpj = (html.match(/CNPJ:\s*([\d./-]+)/i)?.[1] ?? '').replace(/\D/g, '')
  const total = centavos(html.match(/Valor a pagar R\$:\s*<\/label>\s*<span[^>]*>([\d.,]+)/i)?.[1] ?? '') || itens.reduce((s, i) => s + i.valorTotal, 0)
  const pagamento = texto(html.match(/id="linhaForma"[\s\S]*?<label class="tx">([\s\S]*?)<\/label>/i)?.[1] ?? '') || undefined
  const em = html.match(/Emiss[ãa]o:\s*<\/strong>\s*(\d{2})\/(\d{2})\/(\d{4})/i) ?? texto(html).match(/Emiss[ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i)
  return { emitente, cnpj, itens, total, pagamento, emissao: em ? `${em[3]}-${em[2]}-${em[1]}` : undefined }
}

// ---------- Conferência ----------

/** Abreviações comuns dos cupons → palavra inteira, para casar com o nome do carrinho. */
const ABREVIACOES: Record<string, string> = {
  fgo: 'frango', frg: 'frango', refri: 'refrigerante', refrig: 'refrigerante', salg: 'salgadinho', biscs: 'biscoito', bisc: 'biscoito',
  choc: 'chocolate', integ: 'integral', desn: 'desnatado', trad: 'tradicional', pct: '', cx: '', lt: 'leite', qj: 'queijo', mus: 'mussarela', muss: 'mussarela',
  sab: 'sabonete', deterg: 'detergente', amac: 'amaciante', cr: 'creme', ext: 'extrato', molho: 'molho', tom: 'tomate', azeit: 'azeite', marg: 'margarina',
}

function palavrasCupom(nome: string): string[] {
  return normalizarNome(nome)
    .split(/[^a-z0-9]+/)
    .map((p) => ABREVIACOES[p] ?? p)
    .filter((p) => p.length >= 3 && !/^\d/.test(p))
}

/** Quantas palavras dos dois nomes combinam (igual ou uma começa com a outra). */
export function semelhanca(a: string, b: string): number {
  const pa = palavrasCupom(a)
  const pb = palavrasCupom(b)
  return pa.filter((p) => pb.some((q) => p === q || (p.length >= 4 && q.startsWith(p)) || (q.length >= 4 && p.startsWith(q)))).length
}

export type SituacaoConferencia = 'ok' | 'preco' | 'quantidade' | 'soNaNota' | 'soNoCarrinho'

export interface LinhaConferencia {
  situacao: SituacaoConferencia
  item?: ItemCompra
  nota?: ItemNota
}

export interface ResultadoConferencia {
  linhas: LinhaConferencia[]
  totalCarrinho: number
  totalNota: number
}

/**
 * Cruza o carrinho com a nota. O código da nota é interno do mercado (não é o código de barras),
 * então casamos pelo código já aprendido em compras anteriores, pelo nome e pelo preço.
 */
export function conferirComNota(
  itens: ItemCompra[],
  nota: NotaLida,
  codigosAprendidos: Map<string, string> = new Map(),
): ResultadoConferencia {
  type Par = { i: number; n: number; pontos: number }
  const pares: Par[] = []
  itens.forEach((item, i) => {
    nota.itens.forEach((ni, n) => {
      let pontos = 0
      if (codigosAprendidos.get(`${nota.cnpj}:${ni.codigo}`) === item.produtoId) pontos += 100
      const nome = semelhanca(`${item.nome} ${item.marca ?? ''}`, ni.descricao)
      pontos += nome * 10
      const mesmoPreco = item.valorUnit > 0 && item.valorUnit === ni.valorUnit
      if (mesmoPreco) pontos += 8
      if (item.quantidade === ni.quantidade) pontos += 2
      // Só nome fraco e preço diferente não basta.
      if (pontos >= 100 || nome >= 2 || (nome >= 1 && (mesmoPreco || item.valorUnit === 0)) || (mesmoPreco && item.quantidade === ni.quantidade)) pares.push({ i, n, pontos })
    })
  })
  pares.sort((a, b) => b.pontos - a.pontos)
  const usadosI = new Set<number>()
  const usadosN = new Set<number>()
  const linhas: LinhaConferencia[] = []
  for (const p of pares) {
    if (usadosI.has(p.i) || usadosN.has(p.n)) continue
    usadosI.add(p.i)
    usadosN.add(p.n)
    const item = itens[p.i]
    const ni = nota.itens[p.n]
    const situacao: SituacaoConferencia = item.valorUnit !== ni.valorUnit ? 'preco' : item.quantidade !== ni.quantidade ? 'quantidade' : 'ok'
    linhas.push({ situacao, item, nota: ni })
  }
  nota.itens.forEach((ni, n) => !usadosN.has(n) && linhas.push({ situacao: 'soNaNota', nota: ni }))
  itens.forEach((item, i) => !usadosI.has(i) && linhas.push({ situacao: 'soNoCarrinho', item }))
  const ordem: SituacaoConferencia[] = ['soNaNota', 'soNoCarrinho', 'preco', 'quantidade', 'ok']
  linhas.sort((a, b) => ordem.indexOf(a.situacao) - ordem.indexOf(b.situacao))
  return {
    linhas,
    totalCarrinho: itens.reduce((s, i) => s + Math.round(i.valorUnit * i.quantidade), 0),
    totalNota: nota.total,
  }
}
