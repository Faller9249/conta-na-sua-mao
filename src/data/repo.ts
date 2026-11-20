import { hojeISO, mesDe, normalizarNome, totalCarrinho } from '../domain/regras'
import type {
  Casa,
  CategoriaFinanceira,
  CategoriaProduto,
  ItemCompra,
  OrigemPreco,
  Pessoa,
  Produto,
} from '../domain/tipos'
import type { BancoCasa } from './db'

// ---------- Casa ----------

export async function criarCasa(
  banco: BancoCasa,
  dados: { nome: string; reservaPct: number; limiteMercado?: number; pessoas: Omit<Pessoa, 'id'>[] },
) {
  const casa: Casa = {
    id: 'casa',
    nome: dados.nome.trim() || 'Minha casa',
    reservaPct: dados.reservaPct,
    limites: dados.limiteMercado ? { Mercado: dados.limiteMercado } : {},
    criadaEm: hojeISO(),
  }
  await banco.transaction('rw', banco.casa, banco.pessoas, async () => {
    await banco.casa.put(casa)
    await banco.pessoas.clear()
    await banco.pessoas.bulkAdd(dados.pessoas.filter((p) => p.nome.trim()))
  })
}

export async function definirReservaPct(banco: BancoCasa, pct: number) {
  await banco.casa.update('casa', { reservaPct: pct })
}

export async function separarReserva(banco: BancoCasa, valor: number, agora = new Date()) {
  const data = hojeISO(agora)
  await banco.reservas.add({ mes: mesDe(data), valor, data })
}

// ---------- Lista ----------

export async function adicionarNaLista(
  banco: BancoCasa,
  nome: string,
  categoria: CategoriaProduto,
  quantidade = 1,
) {
  const n = nome.trim()
  if (!n) return
  const alvo = normalizarNome(n)
  const produto = (await banco.produtos.toArray()).find((p) => normalizarNome(p.nome) === alvo)
  await banco.lista.add({
    nome: n,
    produtoId: produto?.id,
    quantidade,
    categoria: produto?.categoria ?? categoria,
    pego: 0,
    criadoEm: hojeISO(),
  })
}

export async function removerDaLista(banco: BancoCasa, id: number) {
  await banco.lista.delete(id)
}

// ---------- Compra ----------

export async function compraAberta(banco: BancoCasa) {
  return banco.compras.where('status').equals('aberta').first()
}

export async function iniciarCompra(banco: BancoCasa, nomeMercado: string, orcamento: number): Promise<number> {
  const aberta = await compraAberta(banco)
  if (aberta) return aberta.id!
  const nome = nomeMercado.trim() || 'Mercado'
  const existente = await banco.mercados.where('nome').equals(nome).first()
  const mercadoId = existente?.id ?? (await banco.mercados.add({ nome }))
  return (await banco.compras.add({ mercadoId: mercadoId!, inicio: hojeISO(), status: 'aberta', orcamento })) as number
}

/** Garante o produto no catálogo (cria por nome quando não há código de barras). */
export async function garantirProduto(
  banco: BancoCasa,
  dados: { id?: string; ean?: string; nome: string; categoria: CategoriaProduto; marca?: string; quantidade?: string },
): Promise<Produto> {
  const { id: idDado, ...resto } = dados
  const id = idDado ?? dados.ean ?? `nome:${normalizarNome(dados.nome)}`
  const existente = await banco.produtos.get(id)
  if (existente) return existente
  const produto: Produto = { id, ...resto, nome: dados.nome.trim() }
  await banco.produtos.put(produto)
  return produto
}

/** Põe um item no carrinho e marca o item correspondente da lista como pego. */
export async function colocarNoCarrinho(
  banco: BancoCasa,
  compraId: number,
  produto: Produto,
  valorUnit: number,
  quantidade = 1,
  origemPreco: OrigemPreco = 'digitado',
) {
  return banco.transaction('rw', banco.lista, banco.itensCompra, async () => {
    const pendentes = await banco.lista.where('pego').equals(0).toArray()
    const alvo = normalizarNome(produto.nome)
    const daLista =
      pendentes.find((i) => i.produtoId === produto.id) ??
      pendentes.find((i) => normalizarNome(i.nome) === alvo || alvo.startsWith(normalizarNome(i.nome)))
    if (daLista) await banco.lista.update(daLista.id!, { pego: 1, produtoId: produto.id })
    return banco.itensCompra.add({
      compraId,
      produtoId: produto.id,
      nome: produto.nome,
      quantidade,
      valorUnit,
      origemPreco,
      naLista: !!daLista,
      itemListaId: daLista?.id,
    })
  })
}

export async function tirarDoCarrinho(banco: BancoCasa, item: ItemCompra) {
  await banco.transaction('rw', banco.lista, banco.itensCompra, async () => {
    await banco.itensCompra.delete(item.id!)
    if (item.itemListaId) await banco.lista.update(item.itemListaId, { pego: 0 })
  })
}

/**
 * Fecha a compra: grava os preços no histórico, lança o gasto em "Mercado"
 * e tira da lista os itens que foram pegos.
 */
export async function finalizarCompra(banco: BancoCasa, compraId: number, agora = new Date()) {
  const data = hojeISO(agora)
  return banco.transaction(
    'rw',
    [banco.compras, banco.itensCompra, banco.precos, banco.lancamentos, banco.lista, banco.mercados],
    async () => {
      const compra = await banco.compras.get(compraId)
      if (!compra || compra.status !== 'aberta') throw new Error('Compra não está aberta')
      const itens = await banco.itensCompra.where('compraId').equals(compraId).toArray()
      const total = totalCarrinho(itens)
      await banco.precos.bulkAdd(
        itens.map((i) => ({ produtoId: i.produtoId, mercadoId: compra.mercadoId, valor: i.valorUnit, data, origem: i.origemPreco })),
      )
      const mercado = await banco.mercados.get(compra.mercadoId)
      if (total > 0) {
        await banco.lancamentos.add({
          data,
          valor: total,
          categoria: 'Mercado',
          descricao: `Compra no ${mercado?.nome ?? 'mercado'} (${itens.length} itens)`,
          origem: 'compra',
          compraId,
        })
      }
      await banco.lista.where('pego').equals(1).delete()
      await banco.compras.update(compraId, { status: 'finalizada', fim: data })
      return total
    },
  )
}

export async function cancelarCompra(banco: BancoCasa, compraId: number) {
  await banco.transaction('rw', banco.compras, banco.itensCompra, banco.lista, async () => {
    await banco.itensCompra.where('compraId').equals(compraId).delete()
    await banco.lista.where('pego').equals(1).modify({ pego: 0 })
    await banco.compras.delete(compraId)
  })
}

// ---------- Lançamentos ----------

export async function lancarGasto(
  banco: BancoCasa,
  dados: { valor: number; categoria: CategoriaFinanceira; descricao: string; data?: string; pessoaId?: number },
) {
  await banco.lancamentos.add({
    data: dados.data ?? hojeISO(),
    valor: dados.valor,
    categoria: dados.categoria,
    descricao: dados.descricao.trim() || dados.categoria,
    origem: 'manual',
    pessoaId: dados.pessoaId,
  })
}
