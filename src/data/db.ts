import Dexie, { type EntityTable } from 'dexie'
import type {
  Casa,
  Compra,
  ItemCompra,
  ItemLista,
  Lancamento,
  Mercado,
  MovReserva,
  Pessoa,
  Preco,
  Produto,
} from '../domain/tipos'

/**
 * Banco local no celular (IndexedDB). Na Fase 1 os dados ficam só neste aparelho;
 * a sincronização entre os dois celulares entra com o Supabase.
 */
export class BancoCasa extends Dexie {
  casa!: EntityTable<Casa, 'id'>
  pessoas!: EntityTable<Pessoa, 'id'>
  produtos!: EntityTable<Produto, 'id'>
  mercados!: EntityTable<Mercado, 'id'>
  precos!: EntityTable<Preco, 'id'>
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
  }
}

export const db = new BancoCasa()
