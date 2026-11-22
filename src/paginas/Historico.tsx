import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { brl, dataBR, normalizarNome, totalCarrinho } from '../domain/regras'
import type { ItemCompra } from '../domain/tipos'
import { Cabecalho } from '../ui/componentes'

export function Historico() {
  const navegar = useNavigate()
  const [aba, setAba] = useState<'compras' | 'produtos'>('compras')
  const [busca, setBusca] = useState('')
  const dados = useLiveQuery(async () => {
    const compras = (await db.compras.where('status').equals('finalizada').toArray()).sort((a, b) => (b.fim ?? '').localeCompare(a.fim ?? '') || b.id! - a.id!)
    return {
      compras,
      itens: await db.itensCompra.toArray(),
      mercados: await db.mercados.toArray(),
      cartoes: await db.cartoes.toArray(),
    }
  })
  if (!dados) return null
  const { compras, itens, mercados, cartoes } = dados
  const nomeMercado = (id: number) => mercados.find((m) => m.id === id)?.nome ?? 'Mercado'
  const porCompra = new Map<number, ItemCompra[]>()
  for (const i of itens) porCompra.set(i.compraId, [...(porCompra.get(i.compraId) ?? []), i])
  const finalizadas = new Set(compras.map((c) => c.id!))

  // Produtos: cada compra de cada produto, da mais nova para a mais antiga.
  const dataDe = new Map(compras.map((c) => [c.id!, c] as const))
  const produtos = new Map<string, { nome: string; marca?: string; vezes: { data: string; mercado: string; valor: number; qtd: number; compraId: number }[] }>()
  for (const i of itens) {
    if (!finalizadas.has(i.compraId)) continue
    const c = dataDe.get(i.compraId)!
    const p = produtos.get(i.produtoId) ?? { nome: i.nome, marca: i.marca, vezes: [] }
    p.marca ??= i.marca
    p.vezes.push({ data: c.fim ?? c.inicio, mercado: nomeMercado(c.mercadoId), valor: i.valorUnit, qtd: i.quantidade, compraId: c.id! })
    produtos.set(i.produtoId, p)
  }
  const termo = normalizarNome(busca)
  const listaProdutos = [...produtos.entries()]
    .map(([id, p]) => ({ id, ...p, vezes: p.vezes.sort((a, b) => b.data.localeCompare(a.data)) }))
    .filter((p) => !termo || normalizarNome(`${p.nome} ${p.marca ?? ''}`).includes(termo))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  return (
    <div className="conteudo">
      <button type="button" className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={() => navegar(-1)}>‹ Voltar</button>
      <Cabecalho titulo="Histórico" sub={`${compras.length} ${compras.length === 1 ? 'compra' : 'compras'} · ${produtos.size} ${produtos.size === 1 ? 'produto' : 'produtos'}`} />
      <div className="chips" role="tablist">
        <button role="tab" aria-selected={aba === 'compras'} className={`chip${aba === 'compras' ? ' ativo' : ''}`} onClick={() => setAba('compras')}>Compras</button>
        <button role="tab" aria-selected={aba === 'produtos'} className={`chip${aba === 'produtos' ? ' ativo' : ''}`} onClick={() => setAba('produtos')}>Produtos</button>
      </div>

      {aba === 'compras' ? (
        <section className="coluna">
          {compras.length === 0 && <p className="vazio">As compras finalizadas aparecem aqui.</p>}
          {compras.map((c) => {
            const its = porCompra.get(c.id!) ?? []
            const cartao = cartoes.find((k) => k.id === c.cartaoId)
            return (
              <Link key={c.id} to={`/historico/${c.id}`} className="item" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start' }}>
                <div className="cresce">
                  <div className="nome">{nomeMercado(c.mercadoId)} · {dataBR(c.fim)}</div>
                  <div className="detalhe">
                    {[c.nomeLista, `${its.length} ${its.length === 1 ? 'item' : 'itens'}`, cartao?.nome].filter(Boolean).join(' · ')}
                  </div>
                  <div className="detalhe" style={{ color: c.nota ? 'var(--verde)' : 'var(--alerta)' }}>{c.nota ? 'Nota fiscal lida' : 'Nota fiscal pendente'}</div>
                </div>
                <span className="preco">{brl(totalCarrinho(its))}</span>
              </Link>
            )
          })}
        </section>
      ) : (
        <section className="coluna">
          <input className="entrada" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou marca" aria-label="Buscar produto" />
          {listaProdutos.length === 0 && <p className="vazio">{busca ? 'Nada encontrado.' : 'Os produtos comprados aparecem aqui.'}</p>}
          {listaProdutos.map((p) => {
            const [ultima, anterior] = p.vezes
            const variou = anterior ? ultima.valor - anterior.valor : 0
            return (
              <div key={p.id} className="cartao" style={{ gap: 6 }}>
                <div className="linha entre">
                  <div className="cresce">
                    <strong style={{ fontSize: 15 }}>{p.nome}</strong>
                    {p.marca && <p className="pequeno">{p.marca}</p>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{brl(ultima.valor)}</strong>
                    {variou !== 0 && (
                      <p className="pequeno" style={{ color: variou > 0 ? 'var(--erro)' : 'var(--verde)' }}>
                        {variou > 0 ? '▲' : '▼'} {brl(Math.abs(variou))}
                      </p>
                    )}
                  </div>
                </div>
                {p.vezes.slice(0, 5).map((v, i) => (
                  <div key={i} className="linha entre pequeno">
                    <span>{dataBR(v.data)} · {v.mercado}{v.qtd > 1 ? ` · ${v.qtd} un` : ''}</span>
                    <span>{brl(v.valor)}</span>
                  </div>
                ))}
                {p.vezes.length > 5 && <p className="pequeno">e mais {p.vezes.length - 5} compras</p>}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
