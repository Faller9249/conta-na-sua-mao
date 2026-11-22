import Dexie, { type EntityTable } from 'dexie'
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
  }
}

export const db = new BancoCasa()
