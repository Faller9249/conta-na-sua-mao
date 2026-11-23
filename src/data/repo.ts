import { hojeISO, itemDaListaPara, mesDe, normalizarNome, totalCarrinho, type LeituraNota } from '../domain/regras'
import type {
  Cartao,
  Casa,
  CategoriaFinanceira,
  CategoriaProduto,
  ItemCompra,
  OrigemPreco,
  Pessoa,
  Produto,
  TipoCartao,
} from '../domain/tipos'
import { conferirComNota, type NotaLida } from '../domain/nota'
import { NOME_LISTA_PADRAO, type BancoCasa } from './db'
import { categoriaPorTexto } from './produtos'

// ---------- Casa ----------

export async function criarCasa(
  banco: BancoCasa,
  dados: { nome: string; reservaPct: number; limiteMercado?: number; pessoas: Omit<Pessoa, 'id'>[] },
) {
  await banco.transaction('rw', banco.casa, banco.pessoas, banco.listas, async () => {
    const listaId = (await banco.listas.toCollection().first())?.id ?? (await banco.listas.add({ nome: NOME_LISTA_PADRAO, criadaEm: hojeISO() }))
    const casa: Casa = {
      id: 'casa',
      nome: dados.nome.trim() || 'Minha casa',
      reservaPct: dados.reservaPct,
      limites: dados.limiteMercado ? { Mercado: dados.limiteMercado } : {},
      listaAtivaId: listaId,
      criadaEm: hojeISO(),
    }
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

// ---------- Cartões ----------

export async function salvarCartao(banco: BancoCasa, dados: { nome: string; tipo: TipoCartao; pessoaId?: number }) {
  const nome = dados.nome.trim()
  if (!nome) return
  return banco.cartoes.add({ nome, tipo: dados.tipo, pessoaId: dados.pessoaId, ativo: 1 })
}

/** Remove das opções, mas mantém no histórico. */
export async function removerCartao(banco: BancoCasa, id: number) {
  await banco.cartoes.update(id, { ativo: 0 })
}

export async function cartoesAtivos(banco: BancoCasa): Promise<Cartao[]> {
  return banco.cartoes.where('ativo').equals(1).toArray()
}

// ---------- Listas ----------

/** Só lê a lista aberta (pode ser usada dentro de useLiveQuery, que não permite gravar). */
export async function lerListaAtiva(banco: BancoCasa) {
  const casa = await banco.casa.get('casa')
  return (casa?.listaAtivaId ? await banco.listas.get(casa.listaAtivaId) : undefined) ?? (await banco.listas.toCollection().first())
}

/** Lista aberta na tela Lista; cria "Compras da semana" se não houver nenhuma. */
export async function listaAtiva(banco: BancoCasa) {
  const casa = await banco.casa.get('casa')
  const atual = casa?.listaAtivaId ? await banco.listas.get(casa.listaAtivaId) : undefined
  if (atual) return atual
  const primeira = await banco.listas.toCollection().first()
  if (primeira) {
    await banco.casa.update('casa', { listaAtivaId: primeira.id })
    return primeira
  }
  const id = await banco.listas.add({ nome: NOME_LISTA_PADRAO, criadaEm: hojeISO() })
  await banco.casa.update('casa', { listaAtivaId: id })
  return (await banco.listas.get(id))!
}

export async function criarLista(banco: BancoCasa, nome: string) {
  const id = await banco.listas.add({ nome: nome.trim() || NOME_LISTA_PADRAO, criadaEm: hojeISO() })
  await banco.casa.update('casa', { listaAtivaId: id })
  return id as number
}

export async function renomearLista(banco: BancoCasa, id: number, nome: string) {
  if (nome.trim()) await banco.listas.update(id, { nome: nome.trim() })
}

export async function abrirLista(banco: BancoCasa, id: number) {
  await banco.casa.update('casa', { listaAtivaId: id })
}

/** Apaga a lista e os itens dela. O histórico das compras guarda o nome. */
export async function apagarLista(banco: BancoCasa, id: number) {
  await banco.transaction('rw', banco.listas, banco.lista, banco.casa, async () => {
    await banco.lista.where('listaId').equals(id).delete()
    await banco.listas.delete(id)
    const casa = await banco.casa.get('casa')
    if (casa?.listaAtivaId === id) {
      const outra = await banco.listas.toCollection().first()
      await banco.casa.update('casa', { listaAtivaId: outra?.id })
    }
  })
}

export async function adicionarNaLista(
  banco: BancoCasa,
  listaId: number,
  nome: string,
  categoria: CategoriaProduto,
  opcoes: { quantidade?: number; marca?: string; produtoId?: string } = {},
) {
  const n = nome.trim()
  if (!n) return
  const alvo = normalizarNome(n)
  const produto =
    (opcoes.produtoId ? await banco.produtos.get(opcoes.produtoId) : undefined) ??
    (await banco.produtos.toArray()).find((p) => normalizarNome(p.nome) === alvo)
  await banco.lista.add({
    listaId,
    nome: n,
    marca: opcoes.marca?.trim() || produto?.marca,
    produtoId: produto?.id,
    quantidade: opcoes.quantidade ?? 1,
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

export async function iniciarCompra(banco: BancoCasa, nomeMercado: string, orcamento: number, listaId?: number): Promise<number> {
  const aberta = await compraAberta(banco)
  if (aberta) return aberta.id!
  const nome = nomeMercado.trim() || 'Mercado'
  const existente = await banco.mercados.where('nome').equals(nome).first()
  const mercadoId = existente?.id ?? (await banco.mercados.add({ nome }))
  const lista = listaId ? await banco.listas.get(listaId) : undefined
  return (await banco.compras.add({
    mercadoId: mercadoId!,
    listaId: lista?.id,
    nomeLista: lista?.nome,
    inicio: hojeISO(),
    status: 'aberta',
    orcamento,
  })) as number
}

/** Garante o produto no catálogo (cria por nome quando não há código de barras). */
export async function garantirProduto(
  banco: BancoCasa,
  dados: { id?: string; ean?: string; nome: string; categoria: CategoriaProduto; marca?: string; quantidade?: string },
): Promise<Produto> {
  const { id: idDado, ...resto } = dados
  const id = idDado ?? dados.ean ?? `nome:${normalizarNome(dados.nome)}`
  const existente = await banco.produtos.get(id)
  if (existente) {
    // Completa a marca se o catálogo ainda não tinha.
    if (!existente.marca && dados.marca?.trim()) {
      await banco.produtos.update(id, { marca: dados.marca.trim() })
      return { ...existente, marca: dados.marca.trim() }
    }
    return existente
  }
  const produto: Produto = { id, ...resto, nome: dados.nome.trim(), marca: dados.marca?.trim() || undefined }
  await banco.produtos.put(produto)
  return produto
}

/** Itens ainda não pegos da lista da compra. */
export async function pendentesDaCompra(banco: BancoCasa, compraId: number) {
  const compra = await banco.compras.get(compraId)
  if (!compra?.listaId) return []
  return banco.lista.where('[listaId+pego]').equals([compra.listaId, 0]).toArray()
}

/**
 * Põe um item no carrinho e marca o item correspondente da lista como pego.
 * `vinculo` deixa o casal escolher o item da lista (ou 'extra') quando o nome do código não bate.
 */
export async function colocarNoCarrinho(
  banco: BancoCasa,
  compraId: number,
  produto: Produto,
  valorUnit: number,
  quantidade = 1,
  origemPreco: OrigemPreco = 'digitado',
  vinculo?: number | 'extra',
) {
  return banco.transaction('rw', banco.compras, banco.lista, banco.itensCompra, async () => {
    const pendentes = await pendentesDaCompra(banco, compraId)
    const daLista =
      vinculo === 'extra' ? undefined : vinculo !== undefined ? pendentes.find((i) => i.id === vinculo) : itemDaListaPara(pendentes, produto)
    if (daLista) await banco.lista.update(daLista.id!, { pego: 1, produtoId: produto.id })
    return banco.itensCompra.add({
      compraId,
      produtoId: produto.id,
      nome: produto.nome,
      marca: produto.marca,
      quantidade,
      valorUnit,
      origemPreco,
      naLista: !!daLista,
      itemListaId: daLista?.id,
    })
  })
}

/**
 * Corrige nome/marca de um produto do catálogo (ex.: o código é de "Arroz", mas foi salvo como "Feijão").
 * Atualiza também as compras e listas que usam esse código.
 */
export async function corrigirProduto(banco: BancoCasa, produtoId: string, dados: { nome: string; marca?: string }) {
  const nome = dados.nome.trim()
  if (!nome) return
  const marca = dados.marca?.trim() || undefined
  await banco.transaction('rw', banco.produtos, banco.itensCompra, banco.lista, async () => {
    await banco.produtos.update(produtoId, { nome, marca })
    await banco.itensCompra.where('produtoId').equals(produtoId).modify({ nome, marca })
    await banco.lista.where('produtoId').equals(produtoId).modify({ nome, marca })
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
 * (com o cartão usado) e tira da lista os itens que foram pegos.
 */
export async function finalizarCompra(banco: BancoCasa, compraId: number, opcoes: { cartaoId?: number; agora?: Date } = {}) {
  const data = hojeISO(opcoes.agora)
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
          descricao: `${compra.nomeLista ? `${compra.nomeLista} · ` : ''}${mercado?.nome ?? 'mercado'} (${itens.length} itens)`,
          origem: 'compra',
          compraId,
          cartaoId: opcoes.cartaoId,
        })
      }
      if (compra.listaId) await banco.lista.where('[listaId+pego]').equals([compra.listaId, 1]).delete()
      await banco.compras.update(compraId, { status: 'finalizada', fim: data, cartaoId: opcoes.cartaoId })
      return total
    },
  )
}

export async function cancelarCompra(banco: BancoCasa, compraId: number) {
  await banco.transaction('rw', banco.compras, banco.itensCompra, banco.lista, async () => {
    const compra = await banco.compras.get(compraId)
    await banco.itensCompra.where('compraId').equals(compraId).delete()
    if (compra?.listaId) await banco.lista.where('[listaId+pego]').equals([compra.listaId, 1]).modify({ pego: 0 })
    await banco.compras.delete(compraId)
  })
}

/** Liga a nota fiscal lida (QR Code ou chave) a uma compra já finalizada. */
export async function vincularNota(banco: BancoCasa, compraId: number, nota: LeituraNota, agora = new Date()) {
  const outra = (await banco.compras.toArray()).find((c) => c.nota?.chave === nota.chave && c.id !== compraId)
  if (outra) throw new Error('Esta nota já está ligada a outra compra.')
  await banco.compras.update(compraId, {
    nota: { chave: nota.chave, url: nota.url, cnpj: nota.cnpj, emissao: nota.emissao, lidaEm: hojeISO(agora) },
  })
}

/** Troca o cartão de uma compra já feita (e do gasto lançado por ela). */
export async function trocarCartaoDaCompra(banco: BancoCasa, compraId: number, cartaoId?: number) {
  await banco.transaction('rw', banco.compras, banco.lancamentos, async () => {
    await banco.compras.update(compraId, { cartaoId })
    await banco.lancamentos.filter((l) => l.compraId === compraId).modify({ cartaoId })
  })
}

// ---------- Lançamentos ----------

export async function lancarGasto(
  banco: BancoCasa,
  dados: { valor: number; categoria: CategoriaFinanceira; descricao: string; data?: string; pessoaId?: number; cartaoId?: number },
) {
  await banco.lancamentos.add({
    data: dados.data ?? hojeISO(),
    valor: dados.valor,
    categoria: dados.categoria,
    descricao: dados.descricao.trim() || dados.categoria,
    origem: 'manual',
    pessoaId: dados.pessoaId,
    cartaoId: dados.cartaoId,
  })
}

// ---------- Conferência pela nota (Fase 2) ----------

/** Guarda os itens lidos da nota na SEFAZ junto com a compra. */
export async function salvarNotaLida(banco: BancoCasa, compraId: number, nota: NotaLida, agora = new Date()) {
  await banco.compras.update(compraId, {
    conferencia: { emitente: nota.emitente, cnpj: nota.cnpj, total: nota.total, pagamento: nota.pagamento, emissao: nota.emissao, itens: nota.itens, lidaEm: hojeISO(agora) },
  })
}

/** "CNPJ:código do mercado" → produto, aprendido nas conferências anteriores. */
export async function codigosAprendidos(banco: BancoCasa): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  for (const p of await banco.produtos.toArray()) for (const c of p.codigosNota ?? []) m.set(c, p.id)
  return m
}

/**
 * Usa os valores da nota (fonte oficial): corrige preço e quantidade dos itens,
 * grava os preços como "nota", inclui o que só estava na nota, tira (se pedido) o que
 * não foi cobrado e acerta o gasto lançado no mês.
 */
export async function aplicarConferencia(
  banco: BancoCasa,
  compraId: number,
  opcoes: { incluirSoNaNota?: boolean; tirarSoNoCarrinho?: boolean } = {},
  agora = new Date(),
) {
  const { incluirSoNaNota = true, tirarSoNoCarrinho = false } = opcoes
  return banco.transaction('rw', [banco.compras, banco.itensCompra, banco.precos, banco.lancamentos, banco.produtos], async () => {
    const compra = await banco.compras.get(compraId)
    const conf = compra?.conferencia
    if (!compra || !conf) throw new Error('Leia a nota antes de conferir.')
    const itens = await banco.itensCompra.where('compraId').equals(compraId).toArray()
    const nota: NotaLida = { emitente: conf.emitente, cnpj: conf.cnpj, itens: conf.itens, total: conf.total }
    const res = conferirComNota(itens, nota, await codigosAprendidos(banco))
    const data = compra.fim ?? hojeISO(agora)
    for (const l of res.linhas) {
      if (l.item && l.nota) {
        await banco.itensCompra.update(l.item.id!, { valorUnit: l.nota.valorUnit, quantidade: l.nota.quantidade, origemPreco: 'nota' })
        await banco.precos.add({ produtoId: l.item.produtoId, mercadoId: compra.mercadoId, valor: l.nota.valorUnit, data, origem: 'nota' })
        const chave = `${conf.cnpj}:${l.nota.codigo}`
        const produto = await banco.produtos.get(l.item.produtoId)
        if (produto && l.nota.codigo && !produto.codigosNota?.includes(chave)) {
          await banco.produtos.update(produto.id, { codigosNota: [...(produto.codigosNota ?? []), chave] })
        }
      } else if (l.nota && incluirSoNaNota) {
        const id = `loja:${conf.cnpj}:${l.nota.codigo || normalizarNome(l.nota.descricao)}`
        if (!(await banco.produtos.get(id))) {
          await banco.produtos.put({ id, nome: l.nota.descricao, categoria: categoriaPorTexto(l.nota.descricao), codigosNota: [`${conf.cnpj}:${l.nota.codigo}`] })
        }
        await banco.itensCompra.add({ compraId, produtoId: id, nome: l.nota.descricao, quantidade: l.nota.quantidade, valorUnit: l.nota.valorUnit, origemPreco: 'nota', naLista: false })
        await banco.precos.add({ produtoId: id, mercadoId: compra.mercadoId, valor: l.nota.valorUnit, data, origem: 'nota' })
      } else if (l.item && tirarSoNoCarrinho) {
        await banco.itensCompra.delete(l.item.id!)
      }
    }
    const total = totalCarrinho(await banco.itensCompra.where('compraId').equals(compraId).toArray())
    await banco.lancamentos.filter((x) => x.compraId === compraId).modify({ valor: total })
    await banco.compras.update(compraId, { conferencia: { ...conf, aplicadaEm: hojeISO(agora) } })
    return total
  })
}
