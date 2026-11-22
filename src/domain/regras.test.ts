import { describe, expect, it } from 'vitest'
import {
  brl,
  diasAteProximaEntrada,
  dvChaveNFe,
  formatarCNPJ,
  gastoPorCartao,
  lerNotaFiscal,
  eanValido,
  lerEtiquetaBalanca,
  lerValor,
  metaReserva,
  precoSugerido,
  resumoDoMes,
  totalCarrinho,
  totalExtras,
} from './regras'
import type { ItemCompra, Lancamento, Pessoa, Preco } from './tipos'

describe('dinheiro', () => {
  it('formata em reais', () => {
    expect(brl(123456)).toBe('R$ 1.234,56')
    expect(brl(879)).toBe('R$ 8,79')
  })
  it('lê o que a pessoa digita', () => {
    expect(lerValor('8,79')).toBe(879)
    expect(lerValor('R$ 1.234,56')).toBe(123456)
    expect(lerValor('9.9')).toBe(990)
    expect(lerValor('12')).toBe(1200)
    expect(lerValor('1.500')).toBe(150000)
    expect(lerValor('2.090.000')).toBe(209000000)
    expect(lerValor('abc')).toBeNull()
    expect(lerValor('')).toBeNull()
  })
})

describe('código de barras', () => {
  it('confere o dígito verificador', () => {
    expect(eanValido('7891000100103')).toBe(true)
    expect(eanValido('7891000100104')).toBe(false)
    expect(eanValido('123')).toBe(false)
  })
  it('lê etiqueta de balança (2 CCCC X VVVVVV D)', () => {
    // código 0123, valor R$ 9,98 → 2 0123 0 000998 + DV
    const base = '201230000998'
    const dv = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => eanValido(base + d))!
    expect(lerEtiquetaBalanca(base + dv)).toEqual({ codigo: '0123', valor: 998 })
  })
  it('ignora EAN comum e etiqueta com verificador errado', () => {
    expect(lerEtiquetaBalanca('7891000100103')).toBeNull()
    expect(lerEtiquetaBalanca('2012300009980')).toBeNull()
  })
})

describe('preço sugerido', () => {
  const precos: Preco[] = [
    { id: 1, produtoId: 'feijao', mercadoId: 1, valor: 849, data: '2026-10-01', origem: 'digitado' },
    { id: 2, produtoId: 'feijao', mercadoId: 1, valor: 879, data: '2026-11-12', origem: 'digitado' },
    { id: 3, produtoId: 'feijao', mercadoId: 2, valor: 849, data: '2026-11-15', origem: 'nota' },
    { id: 4, produtoId: 'arroz', mercadoId: 2, valor: 2490, data: '2026-11-01', origem: 'digitado' },
  ]
  it('usa o último preço neste mercado', () => {
    expect(precoSugerido(precos, 'feijao', 1)).toMatchObject({ valor: 879, outroMercado: false })
  })
  it('sem registro aqui, usa outro mercado e avisa', () => {
    expect(precoSugerido(precos, 'arroz', 1)).toMatchObject({ valor: 2490, outroMercado: true, mercadoId: 2 })
  })
  it('no mesmo dia, o preço da nota vence o digitado', () => {
    const mesmoDia: Preco[] = [
      { id: 9, produtoId: 'x', mercadoId: 1, valor: 949, data: '2026-11-20', origem: 'digitado' },
      { id: 8, produtoId: 'x', mercadoId: 1, valor: 999, data: '2026-11-20', origem: 'nota' },
    ]
    expect(precoSugerido(mesmoDia, 'x', 1)?.valor).toBe(999)
  })
  it('produto nunca comprado', () => {
    expect(precoSugerido(precos, 'cafe', 1)).toBeNull()
  })
})

describe('carrinho', () => {
  const itens: ItemCompra[] = [
    { compraId: 1, produtoId: 'a', nome: 'Arroz', quantidade: 1, valorUnit: 2490, origemPreco: 'digitado', naLista: true },
    { compraId: 1, produtoId: 'b', nome: 'Refri', quantidade: 2, valorUnit: 949, origemPreco: 'digitado', naLista: false },
  ]
  it('soma quantidade × preço', () => expect(totalCarrinho(itens)).toBe(4388))
  it('separa o que foi comprado fora da lista', () => expect(totalExtras(itens)).toBe(1898))
})

describe('painel do mês', () => {
  const pessoas: Pessoa[] = [
    { nome: 'A', entradaMensal: 186000, diasPagamento: [6] },
    { nome: 'B', entradaMensal: 209000, diasPagamento: [6, 20] },
  ]
  const lanc: Lancamento[] = [
    { data: '2026-11-03', valor: 129000, categoria: 'Mercado', descricao: '', origem: 'compra' },
    { data: '2026-11-10', valor: 18000, categoria: 'Delivery', descricao: '', origem: 'manual' },
    { data: '2026-10-28', valor: 99999, categoria: 'Mercado', descricao: '', origem: 'compra' },
  ]
  it('soma só o mês pedido e alerta a partir de 80% do limite', () => {
    const r = resumoDoMes('2026-11', lanc, pessoas, { Mercado: 150000, Lazer: 20000 })
    expect(r.entradas).toBe(395000)
    expect(r.gasto).toBe(147000)
    expect(r.alertas.map((a) => a.categoria)).toEqual(['Mercado'])
    expect(r.categorias.find((c) => c.categoria === 'Lazer')).toMatchObject({ gasto: 0, uso: 0 })
  })
  it('reserva de 5% das entradas', () => expect(metaReserva(395000, 5)).toBe(19750))
  it('dias até a próxima entrada', () => {
    expect(diasAteProximaEntrada(pessoas, new Date(2026, 10, 14))).toBe(6)
    expect(diasAteProximaEntrada(pessoas, new Date(2026, 10, 20))).toBe(0)
    expect(diasAteProximaEntrada(pessoas, new Date(2026, 10, 25))).toBe(11)
  })
})

describe('nota fiscal', () => {
  // Chave de teste: UF 43 (RS), 2611, CNPJ 12345678000190, modelo 65.
  const base = '4326111234567800019065001000012345112345678'
  const chave = base + dvChaveNFe(base)

  it('aceita a chave de 44 dígitos e tira CNPJ e mês', () => {
    expect(lerNotaFiscal(chave)).toMatchObject({ chave, cnpj: '12345678000190', emissao: '2026-11', modelo: '65' })
  })
  it('lê o link do QR Code da SEFAZ', () => {
    const url = `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=${chave}|2|1|1|ABCDEF`
    expect(lerNotaFiscal(url)).toMatchObject({ chave, url })
  })
  it('recusa chave com dígito errado ou texto qualquer', () => {
    expect(lerNotaFiscal(base + ((dvChaveNFe(base) + 1) % 10))).toBeNull()
    expect(lerNotaFiscal('7891000100103')).toBeNull()
    expect(lerNotaFiscal('https://exemplo.com')).toBeNull()
  })
  it('formata o CNPJ', () => expect(formatarCNPJ('12345678000190')).toBe('12.345.678/0001-90'))
})

describe('gasto por cartão', () => {
  it('soma o mês por cartão e separa o que não tem cartão', () => {
    const l: Lancamento[] = [
      { data: '2026-11-03', valor: 1000, categoria: 'Mercado', descricao: '', origem: 'compra', cartaoId: 1 },
      { data: '2026-11-05', valor: 500, categoria: 'Mercado', descricao: '', origem: 'compra', cartaoId: 1 },
      { data: '2026-11-06', valor: 300, categoria: 'Delivery', descricao: '', origem: 'manual' },
      { data: '2026-10-06', valor: 999, categoria: 'Delivery', descricao: '', origem: 'manual', cartaoId: 1 },
    ]
    const g = gastoPorCartao(l, '2026-11')
    expect(g.get(1)).toBe(1500)
    expect(g.get('sem')).toBe(300)
  })
})
