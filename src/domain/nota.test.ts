import { describe, expect, it } from 'vitest'
import { conferirComNota, lerPaginaNota, semelhanca } from './nota'
import type { ItemCompra } from './tipos'

// Trecho no formato da página da SVRS (dados de exemplo).
const item = (n: number, desc: string, cod: string, qtd: string, unit: string, total: string) => `<tr id="Item + ${n}"><td valign="top"><span class="txtTit">${desc}</span><span class="RCod">
  (C&#243;digo:
  ${cod}
  )
  </span><br /><span class="Rqtd"><strong>Qtde.:</strong>${qtd}</span><span class="RUN"><strong>UN: </strong>UN</span><span class="RvlUnit"><strong>Vl. Unit.:</strong>
  &nbsp;
  ${unit}</span></td><td align="right" valign="top" class="txtTit noWrap">Vl. Total<br /><span class="valor">${total}</span></td></tr>`

const PAGINA = `<div id="conteudo"><div class="txtCenter"><div id="u20" class="txtTopo">MERCADO EXEMPLO S/A</div><div class="text">
  CNPJ:
  12.345.678/0001-95</div></div><table id="tabResult">
${item(1, 'ARROZ TIO JOAO T1 5kg', '1001', '1', '28,99', '28,99')}
${item(2, 'LEITE INTEG PIRACANJUBA 1L', '1002', '2', '5,49', '10,98')}
${item(3, 'COXA ASA FGO TEMP 600g', '1003', '3', '12,9', '38,70')}
${item(4, 'PAO FRANCES KG', '1004', '0,512', '14,9', '7,63')}
</table><div id="totalNota"><div id="linhaTotal" class="linhaShade"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">86,30</span></div>
<div id="linhaForma"><label>Forma de pagamento:</label><span class="totalNumb txtTitR">Valor pago R$:</span></div><div id="linhaTotal"><label class="tx">
  Cart&#227;o de D&#233;bito
  </label><span class="totalNumb">86,30</span></div></div>
<li><strong>Emiss&#227;o: </strong>20/11/2026 20:33:19 - Via Consumidor</li>`

describe('página da NFC-e', () => {
  it('lê emitente, itens, total e pagamento', () => {
    const n = lerPaginaNota(PAGINA)!
    expect(n.emitente).toBe('MERCADO EXEMPLO S/A')
    expect(n.cnpj).toBe('12345678000195')
    expect(n.itens).toHaveLength(4)
    expect(n.itens[0]).toEqual({ codigo: '1001', descricao: 'ARROZ TIO JOAO T1 5kg', quantidade: 1, unidade: 'UN', valorUnit: 2899, valorTotal: 2899 })
    expect(n.itens[3].quantidade).toBe(0.512)
    expect(n.total).toBe(8630)
    expect(n.pagamento).toBe('Cartão de Débito')
    expect(n.emissao).toBe('2026-11-20')
  })
  it('página sem itens → null', () => {
    expect(lerPaginaNota('<html>Nota não encontrada</html>')).toBeNull()
  })
})

describe('conferência', () => {
  it('entende abreviações do cupom', () => {
    expect(semelhanca('Coxa e asa de frango temperada', 'COXA ASA FGO TEMP 600g')).toBeGreaterThanOrEqual(3)
    expect(semelhanca('Feijão preto', 'ARROZ TIO JOAO T1 5kg')).toBe(0)
  })
  it('separa conferidos, preço diferente, esquecidos e não cobrados', () => {
    const nota = lerPaginaNota(PAGINA)!
    const ic = (id: number, produtoId: string, nome: string, valorUnit: number, quantidade = 1): ItemCompra => ({ id, compraId: 1, produtoId, nome, quantidade, valorUnit, origemPreco: 'digitado', naLista: true })
    const itens = [
      ic(1, '7896006716112', 'Arroz Tio João 5 kg', 2899),
      ic(2, '7891000315507', 'Leite integral 1 L', 549, 2),
      ic(3, 'nome:coxa', 'Coxa e asa de frango', 1190, 3),
      ic(4, '7890000000001', 'Detergente Ypê', 299),
    ]
    const r = conferirComNota(itens, nota)
    const por = (s: string) => r.linhas.filter((l) => l.situacao === s)
    expect(por('ok').map((l) => l.item!.id).sort()).toEqual([1, 2])
    expect(por('preco').map((l) => [l.item!.id, l.nota!.valorUnit])).toEqual([[3, 1290]])
    expect(por('soNaNota').map((l) => l.nota!.codigo)).toEqual(['1004'])
    expect(por('soNoCarrinho').map((l) => l.item!.id)).toEqual([4])
    expect(r.totalNota).toBe(8630)
  })
  it('usa o código do mercado aprendido antes', () => {
    const nota = lerPaginaNota(PAGINA)!
    const itens: ItemCompra[] = [{ id: 9, compraId: 1, produtoId: 'p-pao', nome: 'Cacetinho', quantidade: 1, valorUnit: 0, origemPreco: 'digitado', naLista: true }]
    const r = conferirComNota(itens, nota, new Map([['12345678000195:1004', 'p-pao']]))
    expect(r.linhas.find((l) => l.item?.id === 9)?.nota?.codigo).toBe('1004')
  })
})
