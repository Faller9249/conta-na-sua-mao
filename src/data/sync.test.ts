import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { BancoCasa, novoId } from './db'
import { mesclarComCasa } from './mesclar'
import { adicionarNaLista, colocarNoCarrinho, criarCasa, finalizarCompra, garantirProduto, iniciarCompra, listaAtiva, removerDaLista } from './repo'
import { ligarNaCasa, sincronizarUmaVez } from './sync'

// Servidor de mentira: guarda a tabela "registros" em memória, como o Supabase.
interface Linha { casa_id: string; tabela: string; chave: string; dados: unknown; apagado: boolean; atualizado_em: string }
function servidorFalso() {
  const linhas = new Map<string, Linha>()
  let relogio = Date.parse('2026-11-23T10:00:00Z')
  const cliente = {
    from() {
      return {
        upsert(rows: Omit<Linha, 'atualizado_em'>[]) {
          for (const r of rows) {
            relogio += 1000
            linhas.set(`${r.casa_id}|${r.tabela}|${r.chave}`, { ...structuredClone(r), atualizado_em: new Date(relogio).toISOString() })
          }
          return Promise.resolve({ error: null })
        },
        select() {
          const filtros: ((l: Linha) => boolean)[] = []
          let limite = Infinity
          const q = {
            eq(_c: string, v: string) { filtros.push((l) => l.casa_id === v); return q },
            gt(_c: string, v: string) { filtros.push((l) => l.atualizado_em > v); return q },
            order() { return q },
            limit(n: number) { limite = n; return q },
            then(ok: (r: { data: Linha[]; error: null }) => void) {
              const data = [...linhas.values()].filter((l) => filtros.every((f) => f(l))).sort((a, b) => a.atualizado_em.localeCompare(b.atualizado_em)).slice(0, limite)
              ok({ data: structuredClone(data), error: null })
            },
          }
          return q
        },
      }
    },
  }
  return { cliente: cliente as unknown as SupabaseClient, linhas }
}

let n = 0
async function celular() {
  const b = new BancoCasa(`sync-${n++}`)
  await b.open()
  return b
}
const sync = async (b: BancoCasa, cliente: SupabaseClient) => sincronizarUmaVez(b, cliente, (await b.meta.get('sync'))!)

describe('sincronização entre dois celulares', () => {
  let servidor: ReturnType<typeof servidorFalso>
  beforeEach(() => {
    servidor = servidorFalso()
  })

  it('quem cria sobe tudo; quem entra junta sem duplicar nomes; alterações e exclusões chegam no outro', async () => {
    const pessoas = [{ nome: 'Eduardo', entradaMensal: 200000, diasPagamento: [5] }, { nome: 'Milene', entradaMensal: 186000, diasPagamento: [6, 20] }]

    // Celular A: cria a casa e faz uma compra antes de ligar a nuvem.
    const a = await celular()
    await criarCasa(a, { nome: 'Nossa casa', reservaPct: 5, pessoas })
    const listaA = await listaAtiva(a)
    const compraA = await iniciarCompra(a, 'Rissul', 0, listaA.id)
    await colocarNoCarrinho(a, compraA, await garantirProduto(a, { ean: '7891000315507', nome: 'Leite', categoria: 'Laticínios' }), 549)
    await finalizarCompra(a, compraA)
    await ligarNaCasa(a, servidor.cliente, { casaId: 'c1', userId: 'u-a' }, 'subir')
    a.sincronizar = true
    await sync(a, servidor.cliente)

    // Celular B: também tinha criado a casa (mesmos nomes) e feito outra compra no Rissul.
    const b = await celular()
    await criarCasa(b, { nome: 'Casa da Milene', reservaPct: 10, pessoas })
    const listaB = await listaAtiva(b)
    await adicionarNaLista(b, listaB.id!, 'Café', 'Mercearia')
    const compraB = await iniciarCompra(b, 'Rissul', 0)
    await colocarNoCarrinho(b, compraB, await garantirProduto(b, { ean: '7896089011234', nome: 'Café', categoria: 'Mercearia' }), 2290)
    await finalizarCompra(b, compraB)
    await ligarNaCasa(b, servidor.cliente, { casaId: 'c1', userId: 'u-b' }, 'juntar')
    await sync(b, servidor.cliente)
    await sync(a, servidor.cliente)

    for (const cel of [a, b]) {
      expect((await cel.casa.get('casa'))?.nome).toBe('Nossa casa') // vale a da casa
      expect((await cel.pessoas.toArray()).map((p) => p.nome).sort()).toEqual(['Eduardo', 'Milene'])
      expect(await cel.mercados.count()).toBe(1)
      expect(await cel.listas.count()).toBe(1) // "Compras da semana" dos dois virou uma só
      expect(await cel.compras.count()).toBe(2)
      expect(await cel.lancamentos.count()).toBe(2)
      expect((await cel.lista.toArray()).map((i) => i.nome)).toEqual(['Café'])
      const mercadoId = (await cel.mercados.toArray())[0].id
      expect((await cel.compras.toArray()).every((c) => c.mercadoId === mercadoId)).toBe(true)
    }

    // A tira o café da lista → some no B.
    const cafe = (await a.lista.toArray())[0]
    await removerDaLista(a, cafe.id!)
    await new Promise((r) => setTimeout(r, 10)) // fila grava ao fim da transação
    expect(await a.fila.count()).toBe(1)
    await sync(a, servidor.cliente)
    expect(await a.fila.count()).toBe(0)
    await sync(b, servidor.cliente)
    expect(await b.lista.count()).toBe(0)

    // O que chega da nuvem não volta para a fila.
    expect(await b.fila.count()).toBe(0)
  })

  it('descartar: o celular fica só com os dados da casa', async () => {
    const a = await celular()
    await criarCasa(a, { nome: 'Nossa casa', reservaPct: 5, pessoas: [{ nome: 'Eduardo', entradaMensal: 0, diasPagamento: [] }] })
    await ligarNaCasa(a, servidor.cliente, { casaId: 'c1', userId: 'u-a' }, 'subir')
    await sync(a, servidor.cliente)

    const b = await celular()
    await criarCasa(b, { nome: 'Teste', reservaPct: 5, pessoas: [{ nome: 'Fulano', entradaMensal: 0, diasPagamento: [] }] })
    await ligarNaCasa(b, servidor.cliente, { casaId: 'c1', userId: 'u-b' }, 'descartar')
    expect((await b.pessoas.toArray()).map((p) => p.nome)).toEqual(['Eduardo'])
    expect(await b.fila.count()).toBe(0)
  })
})

describe('ids e mesclagem', () => {
  it('ids novos nunca repetem', () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoId(1_700_000_000_000)))
    expect(ids.size).toBe(500)
  })
  it('remapeia referências e a etiqueta de balança', () => {
    let i = 100
    const r = mesclarComCasa(
      {
        mercados: [{ id: 1, nome: 'Asun' }],
        produtos: [{ id: 'balanca:1:0123', nome: 'Banana' }],
        compras: [{ id: 5, mercadoId: 1, cartaoId: 9 }],
        precos: [{ id: 7, produtoId: 'balanca:1:0123', mercadoId: 1 }],
      },
      { mercados: [{ id: 50, nome: 'asun' }] },
      () => i++,
    )
    expect(r.mercados).toEqual([])
    expect(r.produtos).toEqual([{ id: 'balanca:50:0123', nome: 'Banana' }])
    expect(r.compras).toEqual([{ id: 100, mercadoId: 50, cartaoId: undefined }])
    expect(r.precos).toEqual([{ id: 101, produtoId: 'balanca:50:0123', mercadoId: 50 }])
  })
})
