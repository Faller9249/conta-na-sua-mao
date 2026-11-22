import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { dvChaveNFe, lerNotaFiscal, precoSugerido } from '../domain/regras'
import { BancoCasa } from './db'
import {
  adicionarNaLista,
  apagarLista,
  cancelarCompra,
  colocarNoCarrinho,
  criarLista,
  finalizarCompra,
  garantirProduto,
  iniciarCompra,
  listaAtiva,
  salvarCartao,
  trocarCartaoDaCompra,
  vincularNota,
} from './repo'

let banco: BancoCasa
let n = 0
beforeEach(async () => {
  banco = new BancoCasa(`teste-${n++}`)
  await banco.open()
  await banco.casa.put({ id: 'casa', nome: 'Teste', reservaPct: 5, limites: {}, criadaEm: '2026-11-01' })
})

describe('fluxo de compra', () => {
  it('lista → carrinho → finalizar grava preço, gasto com cartão e limpa a lista', async () => {
    const lista = await listaAtiva(banco)
    expect(lista.nome).toBe('Compras da semana')
    await adicionarNaLista(banco, lista.id!, 'Feijão preto', 'Grãos e massas', { marca: 'Kicaldo' })
    await adicionarNaLista(banco, lista.id!, 'Tomate', 'Hortifrúti')
    const cartaoId = (await salvarCartao(banco, { nome: 'Inter crédito', tipo: 'Crédito' })) as number
    const compraId = await iniciarCompra(banco, 'Rissul', 25000, lista.id)

    const feijao = await garantirProduto(banco, { ean: '7891000100103', nome: 'Feijão preto 1 kg', categoria: 'Grãos e massas', marca: 'Kicaldo' })
    const refri = await garantirProduto(banco, { nome: 'Refrigerante 2 L', categoria: 'Bebidas' })
    await colocarNoCarrinho(banco, compraId, feijao, 879)
    await colocarNoCarrinho(banco, compraId, refri, 949, 2)

    const itens = await banco.itensCompra.toArray()
    expect(itens.map((i) => [i.naLista, i.marca])).toEqual([[true, 'Kicaldo'], [false, undefined]])

    const total = await finalizarCompra(banco, compraId, { cartaoId, agora: new Date(2026, 10, 20) })
    expect(total).toBe(879 + 2 * 949)

    const [lanc] = await banco.lancamentos.toArray()
    expect(lanc).toMatchObject({ categoria: 'Mercado', valor: 2777, data: '2026-11-20', cartaoId })
    expect(lanc.descricao).toContain('Compras da semana')
    expect((await banco.lista.toArray()).map((i) => i.nome)).toEqual(['Tomate'])

    const compra = await banco.compras.get(compraId)
    expect(compra).toMatchObject({ status: 'finalizada', cartaoId, nomeLista: 'Compras da semana' })

    const precos = await banco.precos.toArray()
    expect(precoSugerido(precos, feijao.id, compra!.mercadoId)).toMatchObject({ valor: 879, outroMercado: false })
  })

  it('só existe uma compra aberta por vez', async () => {
    const a = await iniciarCompra(banco, 'Rissul', 0)
    const b = await iniciarCompra(banco, 'Unidasul', 0)
    expect(b).toBe(a)
  })

  it('cancelar devolve os itens para a lista', async () => {
    const listaId = (await listaAtiva(banco)).id!
    await adicionarNaLista(banco, listaId, 'Arroz', 'Grãos e massas')
    const compraId = await iniciarCompra(banco, 'Rissul', 0, listaId)
    const arroz = await garantirProduto(banco, { nome: 'Arroz branco 5 kg', categoria: 'Grãos e massas' })
    await colocarNoCarrinho(banco, compraId, arroz, 2490)
    expect((await banco.lista.toArray())[0].pego).toBe(1)
    await cancelarCompra(banco, compraId)
    expect((await banco.lista.toArray())[0].pego).toBe(0)
    expect(await banco.compras.count()).toBe(0)
  })

  it('o carrinho só marca itens da lista da compra', async () => {
    const semana = (await listaAtiva(banco)).id!
    const churras = await criarLista(banco, 'Churrasco')
    await adicionarNaLista(banco, semana, 'Carvão', 'Outros')
    await adicionarNaLista(banco, churras, 'Carvão', 'Outros')
    const compraId = await iniciarCompra(banco, 'Rissul', 0, churras)
    await colocarNoCarrinho(banco, compraId, await garantirProduto(banco, { nome: 'Carvão', categoria: 'Outros' }), 1990)
    const itens = await banco.lista.toArray()
    expect(itens.find((i) => i.listaId === churras)?.pego).toBe(1)
    expect(itens.find((i) => i.listaId === semana)?.pego).toBe(0)
  })

  it('apagar lista leva os itens junto e abre outra lista', async () => {
    const semana = (await listaAtiva(banco)).id!
    const churras = await criarLista(banco, 'Churrasco')
    await adicionarNaLista(banco, churras, 'Carvão', 'Outros')
    await apagarLista(banco, churras)
    expect(await banco.lista.count()).toBe(0)
    expect((await banco.casa.get('casa'))?.listaAtivaId).toBe(semana)
  })
})

describe('depois da compra', () => {
  it('liga a nota fiscal e não deixa a mesma nota em duas compras', async () => {
    const base = '4326111234567800019065001000012345112345678'
    const nota = lerNotaFiscal(base + dvChaveNFe(base))!
    const a = await iniciarCompra(banco, 'Rissul', 0)
    await finalizarCompra(banco, a)
    await vincularNota(banco, a, nota)
    expect((await banco.compras.get(a))?.nota?.cnpj).toBe('12345678000190')
    const b = await iniciarCompra(banco, 'Rissul', 0)
    await finalizarCompra(banco, b)
    await expect(vincularNota(banco, b, nota)).rejects.toThrow(/outra compra/)
  })

  it('troca o cartão da compra e do gasto', async () => {
    const c1 = (await salvarCartao(banco, { nome: 'Itaú débito', tipo: 'Débito' })) as number
    const c2 = (await salvarCartao(banco, { nome: 'Inter crédito', tipo: 'Crédito' })) as number
    const id = await iniciarCompra(banco, 'Rissul', 0)
    await colocarNoCarrinho(banco, id, await garantirProduto(banco, { nome: 'Pão', categoria: 'Padaria' }), 500)
    await finalizarCompra(banco, id, { cartaoId: c1 })
    await trocarCartaoDaCompra(banco, id, c2)
    expect((await banco.compras.get(id))?.cartaoId).toBe(c2)
    expect((await banco.lancamentos.toArray())[0].cartaoId).toBe(c2)
  })
})

describe('atualização do banco (v1 → v2)', () => {
  it('itens antigos vão para a lista "Compras da semana"', async () => {
    const nome = `migra-${n++}`
    const v1 = new Dexie(nome)
    v1.version(1).stores({ casa: 'id', lista: '++id, produtoId, pego' })
    await v1.open()
    await v1.table('casa').put({ id: 'casa', nome: 'X', reservaPct: 5, limites: {}, criadaEm: '2026-11-01' })
    await v1.table('lista').add({ nome: 'Arroz', quantidade: 1, categoria: 'Grãos e massas', pego: 0, criadoEm: '2026-11-01' })
    v1.close()

    const v2 = new BancoCasa(nome)
    await v2.open()
    const listas = await v2.listas.toArray()
    expect(listas.map((l) => l.nome)).toEqual(['Compras da semana'])
    expect((await v2.lista.toArray())[0].listaId).toBe(listas[0].id)
    expect((await v2.casa.get('casa'))?.listaAtivaId).toBe(listas[0].id)
  })
})
