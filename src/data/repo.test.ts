import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { precoSugerido } from '../domain/regras'
import { BancoCasa } from './db'
import {
  adicionarNaLista,
  cancelarCompra,
  colocarNoCarrinho,
  finalizarCompra,
  garantirProduto,
  iniciarCompra,
} from './repo'

let banco: BancoCasa
let n = 0
beforeEach(async () => {
  banco = new BancoCasa(`teste-${n++}`)
  await banco.open()
})

describe('fluxo de compra', () => {
  it('lista → carrinho → finalizar grava preço, gasto e limpa a lista', async () => {
    await adicionarNaLista(banco, 'Feijão preto', 'Grãos e massas')
    await adicionarNaLista(banco, 'Tomate', 'Hortifrúti')
    const compraId = await iniciarCompra(banco, 'Rissul', 25000)

    const feijao = await garantirProduto(banco, { ean: '7891000100103', nome: 'Feijão preto 1 kg', categoria: 'Grãos e massas' })
    const refri = await garantirProduto(banco, { nome: 'Refrigerante 2 L', categoria: 'Bebidas' })
    await colocarNoCarrinho(banco, compraId, feijao, 879)
    await colocarNoCarrinho(banco, compraId, refri, 949, 2)

    const itens = await banco.itensCompra.toArray()
    expect(itens.map((i) => i.naLista)).toEqual([true, false])

    const total = await finalizarCompra(banco, compraId, new Date(2026, 10, 20))
    expect(total).toBe(879 + 2 * 949)

    const [lanc] = await banco.lancamentos.toArray()
    expect(lanc).toMatchObject({ categoria: 'Mercado', valor: 2777, data: '2026-11-20' })
    expect((await banco.lista.toArray()).map((i) => i.nome)).toEqual(['Tomate'])

    const precos = await banco.precos.toArray()
    const mercado = await banco.mercados.where('nome').equals('Rissul').first()
    expect(precoSugerido(precos, feijao.id, mercado!.id!)).toMatchObject({ valor: 879, outroMercado: false })
    expect((await banco.compras.get(compraId))?.status).toBe('finalizada')
  })

  it('só existe uma compra aberta por vez', async () => {
    const a = await iniciarCompra(banco, 'Rissul', 0)
    const b = await iniciarCompra(banco, 'Unidasul', 0)
    expect(b).toBe(a)
  })

  it('cancelar devolve os itens para a lista', async () => {
    await adicionarNaLista(banco, 'Arroz', 'Grãos e massas')
    const compraId = await iniciarCompra(banco, 'Rissul', 0)
    const arroz = await garantirProduto(banco, { nome: 'Arroz branco 5 kg', categoria: 'Grãos e massas' })
    await colocarNoCarrinho(banco, compraId, arroz, 2490)
    expect((await banco.lista.toArray())[0].pego).toBe(1)
    await cancelarCompra(banco, compraId)
    expect((await banco.lista.toArray())[0].pego).toBe(0)
    expect(await banco.compras.count()).toBe(0)
  })
})
