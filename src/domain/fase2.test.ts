import { describe, expect, it } from 'vitest'
import {
  codigoDoProduto,
  estimarListaPorMercado,
  itemDaListaPara,
  maisBaratoEmOutro,
  nomesCombinam,
  sugerirParaLista,
  ultimoPrecoPorMercado,
} from './regras'
import type { ItemCompra, Preco } from './tipos'

describe('código do produto', () => {
  it('mostra EAN, balança ou nada', () => {
    expect(codigoDoProduto('7891000100103')).toBe('7891000100103')
    expect(codigoDoProduto('balanca:1:0123')).toBe('balança 0123')
    expect(codigoDoProduto('nome:pao frances')).toBeNull()
  })
})

describe('nome × código', () => {
  it('reconhece quando o nome combina', () => {
    expect(nomesCombinam('Arroz', 'Arroz branco Tio João 5 kg')).toBe(true)
    expect(nomesCombinam('Tomates', 'Tomate italiano')).toBe(true)
    expect(nomesCombinam('Feijão', 'Arroz Tio João')).toBe(false)
    expect(nomesCombinam('Café', 'Café')).toBe(true)
  })
  it('acha o item da lista pelo código ligado ou pelo nome', () => {
    const pend = [{ id: 1, nome: 'Feijão' }, { id: 2, nome: 'Leite', produtoId: '789' }]
    expect(itemDaListaPara(pend, { id: '789', nome: 'Leite integral' })?.id).toBe(2)
    expect(itemDaListaPara(pend, { id: '111', nome: 'Feijão preto' })?.id).toBe(1)
    expect(itemDaListaPara(pend, { id: '222', nome: 'Arroz' })).toBeUndefined()
  })
})

const p = (produtoId: string, mercadoId: number, valor: number, data: string, id = 0): Preco => ({ id, produtoId, mercadoId, valor, data, origem: 'digitado' })

describe('comparação entre mercados', () => {
  const precos = [p('a', 1, 900, '2026-11-01'), p('a', 1, 950, '2026-11-10'), p('a', 2, 799, '2026-11-05'), p('b', 1, 500, '2026-11-10')]
  it('pega o último preço de cada mercado', () => {
    const m = ultimoPrecoPorMercado(precos, 'a')
    expect(m.get(1)?.valor).toBe(950)
    expect(m.get(2)?.valor).toBe(799)
  })
  it('avisa só quando outro mercado é mais barato', () => {
    expect(maisBaratoEmOutro(precos, 'a', 1)?.mercadoId).toBe(2)
    expect(maisBaratoEmOutro(precos, 'a', 2)).toBeNull()
  })
  it('estima a lista por mercado, quem tem mais itens com preço primeiro', () => {
    const est = estimarListaPorMercado([{ produtoId: 'a', quantidade: 2 }, { produtoId: 'b', quantidade: 1 }, { quantidade: 1 }], precos)
    expect(est).toEqual([
      { mercadoId: 1, total: 2400, comPreco: 2 },
      { mercadoId: 2, total: 1598, comPreco: 1 },
    ])
  })
})

describe('lista automática', () => {
  const compras = [
    { id: 1, inicio: '2026-10-01', fim: '2026-10-01', status: 'finalizada' },
    { id: 2, inicio: '2026-10-08', fim: '2026-10-08', status: 'finalizada' },
    { id: 3, inicio: '2026-10-15', fim: '2026-10-15', status: 'finalizada' },
    { id: 4, inicio: '2026-10-20', status: 'aberta' },
  ]
  const item = (compraId: number, produtoId: string, nome: string): ItemCompra => ({ compraId, produtoId, nome, quantidade: 1, valorUnit: 100, origemPreco: 'digitado', naLista: true })
  const itens = [
    item(1, 'leite', 'Leite'), item(2, 'leite', 'Leite'), item(3, 'leite', 'Leite'),
    item(1, 'cafe', 'Café'), item(3, 'cafe', 'Café'),
    item(2, 'sal', 'Sal'),
    item(4, 'pao', 'Pão'), item(3, 'pao', 'Pão'),
  ]
  it('sugere o que costumam comprar e já passou do tempo', () => {
    const s = sugerirParaLista(compras, itens, '2026-10-22', [])
    expect(s.map((x) => x.produtoId)).toEqual(['leite'])
    expect(s[0]).toMatchObject({ intervaloDias: 7, diasDesde: 7, vezes: 3 })
  })
  it('com mais tempo inclui o café e ignora o que já está na lista', () => {
    const s = sugerirParaLista(compras, itens, '2026-10-30', [{ nome: 'leite integral' }])
    expect(s.map((x) => x.produtoId)).toEqual(['cafe'])
  })
})
