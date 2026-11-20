import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { adicionarNaLista, compraAberta, iniciarCompra, removerDaLista } from '../data/repo'
import { brl, lerValor, precoSugerido } from '../domain/regras'
import { CATEGORIAS_PRODUTO, type CategoriaProduto, type ItemLista } from '../domain/tipos'
import { Cabecalho, Check } from '../ui/componentes'

export function Lista() {
  const navegar = useNavigate()
  const dados = useLiveQuery(async () => {
    const compras = await db.compras.orderBy('id').reverse().toArray()
    return {
      itens: await db.lista.toArray(),
      precos: await db.precos.toArray(),
      mercados: await db.mercados.toArray(),
      aberta: await compraAberta(db),
      ultimoMercadoId: compras[0]?.mercadoId,
    }
  })
  const [nome, setNome] = useState('')
  const [categoria, setCategoria] = useState<CategoriaProduto>('Mercearia')
  const [iniciando, setIniciando] = useState(false)
  const [mercado, setMercado] = useState('')
  const [orcamento, setOrcamento] = useState('250')

  if (!dados) return null
  const { itens, precos, mercados, aberta, ultimoMercadoId } = dados
  const mercadoPadrao = mercados.find((m) => m.id === ultimoMercadoId)?.nome ?? ''

  const estimativa = itens.reduce((s, i) => {
    const sug = i.produtoId && ultimoMercadoId ? precoSugerido(precos, i.produtoId, ultimoMercadoId) : null
    return s + (sug ? sug.valor * i.quantidade : 0)
  }, 0)
  const semPreco = itens.filter((i) => !i.produtoId || !ultimoMercadoId || !precoSugerido(precos, i.produtoId, ultimoMercadoId)).length

  const grupos = CATEGORIAS_PRODUTO.map((c) => [c, itens.filter((i) => i.categoria === c)] as const).filter(([, l]) => l.length)

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    await adicionarNaLista(db, nome, categoria)
    setNome('')
  }

  async function comecar(e: React.FormEvent) {
    e.preventDefault()
    await iniciarCompra(db, mercado || mercadoPadrao, lerValor(orcamento) ?? 0)
    navegar('/carrinho')
  }

  const linha = (i: ItemLista) => {
    const sug = i.produtoId && ultimoMercadoId ? precoSugerido(precos, i.produtoId, ultimoMercadoId) : null
    return (
      <div key={i.id} className="item">
        <Check ok={i.pego === 1} rotulo={i.pego ? 'No carrinho' : 'Pendente'} />
        <div className="cresce">
          <div className="nome">{i.nome}</div>
          <div className="detalhe">
            {i.quantidade} un{sug ? ` · último ${brl(sug.valor)}` : ''}
          </div>
        </div>
        <button className="x" aria-label={`Tirar ${i.nome} da lista`} onClick={() => removerDaLista(db, i.id!)}>×</button>
      </div>
    )
  }

  return (
    <div className="conteudo">
      <Cabecalho
        titulo="Lista de compras"
        sub={
          itens.length
            ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}${estimativa > 0 ? ` · estimativa ${brl(estimativa)}` : ''}${semPreco ? ` · ${semPreco} sem preço ainda` : ''}`
            : 'Comece pelo que está faltando em casa.'
        }
      />

      <form className="cartao" onSubmit={adicionar} style={{ gap: 8 }}>
        <div className="linha">
          <input className="entrada cresce" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Arroz branco 5 kg" aria-label="Item" />
          <button className="botao" style={{ width: 'auto', padding: '12px 16px' }} disabled={!nome.trim()}>+</button>
        </div>
        <select className="entrada" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProduto)} aria-label="Categoria">
          {CATEGORIAS_PRODUTO.map((c) => <option key={c}>{c}</option>)}
        </select>
      </form>

      {grupos.length === 0 && <p className="vazio">A lista está vazia.</p>}
      {grupos.map(([cat, lista]) => (
        <section key={cat} className="coluna">
          <p className="rotulo">{cat}</p>
          {lista.map(linha)}
        </section>
      ))}

      {aberta ? (
        <button className="botao" onClick={() => navegar('/carrinho')}>Voltar ao carrinho</button>
      ) : iniciando ? (
        <form className="cartao destaque" onSubmit={comecar}>
          <h2>Iniciar compra</h2>
          <label className="campo">
            Mercado
            <input list="mercados" value={mercado} onChange={(e) => setMercado(e.target.value)} placeholder={mercadoPadrao || 'Ex.: Rissul'} />
            <datalist id="mercados">{mercados.map((m) => <option key={m.id} value={m.nome} />)}</datalist>
          </label>
          <label className="campo">
            Orçamento desta compra (R$)
            <input inputMode="decimal" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} />
          </label>
          <button className="botao" disabled={!(mercado || mercadoPadrao)}>Ir para o carrinho</button>
        </form>
      ) : (
        <button className="botao" onClick={() => setIniciando(true)}>Iniciar compra</button>
      )}
    </div>
  )
}
