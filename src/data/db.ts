import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type {
  Cartao,
  Casa,
  Compra,
  ItemCompra,
  ItemLista,
  Lancamento,
  ListaCompras,
  Mercado,
  MovReserva,
  Pessoa,
  Preco,
  Produto,
} from '../domain/tipos'

export const NOME_LISTA_PADRAO = 'Compras da semana'

/** Tabelas que vão para a nuvem e são compartilhadas entre os celulares da casa. */
export const TABELAS_SINCRONIZADAS = [
  'casa', 'pessoas', 'cartoes', 'produtos', 'mercados', 'precos', 'listas', 'lista', 'compras', 'itensCompra', 'lancamentos', 'reservas',
] as const
export type TabelaSincronizada = (typeof TABELAS_SINCRONIZADAS)[number]
/** Tabelas com id numérico gerado no aparelho. */
export const TABELAS_COM_ID: ReadonlySet<string> = new Set(TABELAS_SINCRONIZADAS.filter((t) => t !== 'casa' && t !== 'produtos'))

// Ids únicos entre aparelhos: milissegundos × 1000 + um "sal" fixo do aparelho (0–999).
// Dois celulares nunca geram o mesmo id (sal diferente) e o mesmo celular nunca repete (sempre crescente).
const SAL = Math.floor(Math.random() * 1000)
let ultimoId = 0
export function novoId(agora = Date.now()): number {
  let id = agora * 1000 + SAL
  if (id <= ultimoId) id = ultimoId + 1000
  ultimoId = id
  return id
}

/** Alteração local esperando para ir para a nuvem. */
export interface Pendente {
  tabela: TabelaSincronizada
  /** Chave do registro, sempre como texto. */
  chave: string
  op: 'gravar' | 'apagar'
  /** Muda a cada alteração: só sai da fila se não mudou durante o envio. */
  versao: number
}

/** Estado da sincronização deste aparelho. */
export interface EstadoSync {
  chave: 'sync'
  casaId: string
  userId: string
  /** Maior atualizado_em já recebido da nuvem (ISO). */
  cursor?: string
  ultimaSync?: string
}

type TransacaoMarcada = Transaction & { remoto?: boolean; lote?: Map<string, Pendente> }

/**
 * Banco local no celular (IndexedDB). Na Fase 1 os dados ficam só neste aparelho;
 * a sincronização entre os dois celulares entra com o Supabase.
 */
export class BancoCasa extends Dexie {
  casa!: EntityTable<Casa, 'id'>
  pessoas!: EntityTable<Pessoa, 'id'>
  cartoes!: EntityTable<Cartao, 'id'>
  produtos!: EntityTable<Produto, 'id'>
  mercados!: EntityTable<Mercado, 'id'>
  precos!: EntityTable<Preco, 'id'>
  listas!: EntityTable<ListaCompras, 'id'>
  lista!: EntityTable<ItemLista, 'id'>
  compras!: EntityTable<Compra, 'id'>
  itensCompra!: EntityTable<ItemCompra, 'id'>
  lancamentos!: EntityTable<Lancamento, 'id'>
  reservas!: EntityTable<MovReserva, 'id'>
  fila!: EntityTable<Pendente, 'tabela'>
  meta!: EntityTable<EstadoSync, 'chave'>
  /** Ligado quando o aparelho está numa casa da nuvem: as alterações entram na fila. */
  sincronizar = false

  constructor(nome = 'conta-na-sua-mao') {
    super(nome)
    this.version(1).stores({
      casa: 'id',
      pessoas: '++id',
      produtos: 'id, ean, nome',
      mercados: '++id, &nome',
      precos: '++id, produtoId, mercadoId, data',
      lista: '++id, produtoId, pego',
      compras: '++id, status, mercadoId',
      itensCompra: '++id, compraId, produtoId',
      lancamentos: '++id, data, categoria',
      reservas: '++id, mes',
    })
    // v2: listas com nome, cartões, nota fiscal e marca.
    this.version(2)
      .stores({
        cartoes: '++id, ativo',
        listas: '++id',
        lista: '++id, listaId, produtoId, pego, [listaId+pego]',
        compras: '++id, status, mercadoId, fim',
        lancamentos: '++id, data, categoria, cartaoId',
      })
      .upgrade(async (tx) => {
        // Itens que já existiam vão para uma lista "Compras da semana".
        const itens = await tx.table('lista').count()
        if (itens === 0) return
        const listaId = await tx.table('listas').add({ nome: NOME_LISTA_PADRAO, criadaEm: new Date().toISOString().slice(0, 10) })
        await tx.table('lista').toCollection().modify({ listaId })
        await tx.table('casa').toCollection().modify({ listaAtivaId: listaId })
      })
    // v3: sincronização entre os celulares da casa.
    this.version(3).stores({
      fila: '[tabela+chave]',
      meta: 'chave',
      // Sem "&": dois celulares podem criar o mesmo mercado ao mesmo tempo.
      mercados: '++id, nome',
    })

    for (const nome of TABELAS_SINCRONIZADAS) {
      const tabela = this.table(nome)
      const comId = TABELAS_COM_ID.has(nome)
      tabela.hook('creating', (pk, obj: { id?: unknown }, trans) => {
        if (comId && pk === undefined && obj.id === undefined) obj.id = novoId()
        this.registrar(trans, nome, pk ?? obj.id, 'gravar')
      })
      tabela.hook('updating', (_mods, pk, _obj, trans) => {
        this.registrar(trans, nome, pk, 'gravar')
      })
      tabela.hook('deleting', (pk, _obj, trans) => {
        this.registrar(trans, nome, pk, 'apagar')
      })
    }
  }

  /** Junta as alterações da transação e põe na fila quando ela termina. */
  private registrar(trans: Transaction, tabela: TabelaSincronizada, pk: unknown, op: Pendente['op']) {
    const t = trans as TransacaoMarcada
    if (!this.sincronizar || t.remoto || pk === undefined) return
    if (!t.lote) {
      const lote = new Map<string, Pendente>()
      t.lote = lote
      t.on('complete', () => {
        this.fila.bulkPut([...lote.values()]).then(() => this.aoEnfileirar?.())
      })
    }
    const chave = String(pk)
    t.lote.set(`${tabela}|${chave}`, { tabela, chave, op, versao: novoId() })
  }

  /** Avisado quando há alterações novas na fila (a sincronização agenda o envio). */
  aoEnfileirar?: () => void

  /** Grava o que veio da nuvem sem devolver para a fila. */
  async comoRemoto<T>(tabelas: string[], fn: () => Promise<T>): Promise<T> {
    return this.transaction('rw', tabelas, async (tx) => {
      ;(tx as TransacaoMarcada).remoto = true
      return fn()
    })
  }
}

export const db = new BancoCasa()
