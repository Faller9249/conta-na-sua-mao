import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { abrirLista, adicionarNaLista, apagarLista, compraAberta, criarLista, iniciarCompra, lerListaAtiva, listaAtiva, removerDaLista, renomearLista } from '../data/repo'
import { brl, estimarListaPorMercado, hojeISO, lerValor, precoSugerido, sugerirParaLista, type SugestaoCompra } from '../domain/regras'
import { CATEGORIAS_PRODUTO, type CategoriaProduto, type ItemLista } from '../domain/tipos'
import { Check } from '../ui/componentes'

export function Lista() {
  const navegar = useNavigate()
  // Garante que existe uma lista (gravar não é permitido dentro do useLiveQuery).
  useEffect(() => {
    listaAtiva(db)
  }, [])
  const dados = useLiveQuery(async () => {
    const lista = await lerListaAtiva(db)
    if (!lista) return null
    const compras = await db.compras.orderBy('id').reverse().toArray()
    return {
      lista,
      listas: await db.listas.toArray(),
      itens: await db.lista.where('listaId').equals(lista.id!).toArray(),
      precos: await db.precos.toArray(),
      mercados: await db.mercados.toArray(),
      aberta: await compraAberta(db),
      ultimoMercadoId: compras[0]?.mercadoId,
      compras,
      itensCompra: await db.itensCompra.toArray(),
    }
  })
  const [nome, setNome] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState<CategoriaProduto>('Mercearia')
  const [iniciando, setIniciando] = useState(false)
  const [mercado, setMercado] = useState('')
  const [orcamento, setOrcamento] = useState('250')
  const [editandoNome, setEditandoNome] = useState<string | null>(null)
  const [novaLista, setNovaLista] = useState<string | null>(null)

  if (!dados) return null
  const { lista, listas, itens, precos, mercados, aberta, ultimoMercadoId, compras, itensCompra } = dados
  const mercadoPadrao = mercados.find((m) => m.id === ultimoMercadoId)?.nome ?? ''
  const sugestao = (i: ItemLista) => (i.produtoId && ultimoMercadoId ? precoSugerido(precos, i.produtoId, ultimoMercadoId) : null)

  const estimativa = itens.reduce((s, i) => s + (sugestao(i)?.valor ?? 0) * i.quantidade, 0)
  const semPreco = itens.filter((i) => !sugestao(i)).length
  const grupos = CATEGORIAS_PRODUTO.map((c) => [c, itens.filter((i) => i.categoria === c)] as const).filter(([, l]) => l.length)
  const abertaEmOutra = aberta && aberta.listaId !== lista.id
  const sugestoes = sugerirParaLista(compras, itensCompra, hojeISO(), itens)
  const comparacao = estimarListaPorMercado(itens, precos)
  const maiorCobertura = comparacao[0]?.comPreco ?? 0
  const comProduto = itens.filter((i) => i.produtoId).length
  const nomeMercado = (id: number) => mercados.find((m) => m.id === id)?.nome ?? 'Mercado'

  async function sugerir(s: SugestaoCompra) {
    await adicionarNaLista(db, lista.id!, s.nome, 'Outros', { produtoId: s.produtoId, marca: s.marca })
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    await adicionarNaLista(db, lista.id!, nome, categoria, { marca })
    setNome('')
    setMarca('')
  }

  async function comecar(e: React.FormEvent) {
    e.preventDefault()
    await iniciarCompra(db, mercado || mercadoPadrao, lerValor(orcamento) ?? 0, lista.id)
    navegar('/carrinho')
  }

  async function apagar() {
    if (!confirm(`Apagar a lista “${lista.nome}” e os ${itens.length} itens dela? O histórico das compras continua.`)) return
    await apagarLista(db, lista.id!)
  }

  const linha = (i: ItemLista) => {
    const sug = sugestao(i)
    return (
      <div key={i.id} className="item">
        <Check ok={i.pego === 1} rotulo={i.pego ? 'No carrinho' : 'Pendente'} />
        <div className="cresce">
          <div className="nome">{i.nome}</div>
          <div className="detalhe">
            {i.quantidade} un{i.marca ? ` · ${i.marca}` : ''}
            {sug ? ` · último ${brl(sug.valor)}` : ''}
          </div>
        </div>
        <button className="x" aria-label={`Tirar ${i.nome} da lista`} onClick={() => removerDaLista(db, i.id!)}>×</button>
      </div>
    )
  }

  return (
    <div className="conteudo">
      <header>
        {editandoNome !== null ? (
          <form className="linha" onSubmit={async (e) => { e.preventDefault(); await renomearLista(db, lista.id!, editandoNome); setEditandoNome(null) }}>
            <input className="entrada cresce" autoFocus value={editandoNome} onChange={(e) => setEditandoNome(e.target.value)} aria-label="Nome da lista" style={{ fontSize: 20, fontWeight: 700 }} />
            <button className="botao" style={{ width: 'auto' }}>OK</button>
          </form>
        ) : (
          <div className="linha entre">
            <h1>{lista.nome}</h1>
            <button className="botao texto" onClick={() => setEditandoNome(lista.nome)}>Renomear</button>
          </div>
        )}
        <p className="sub">
          {itens.length
            ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}${estimativa > 0 ? ` · estimativa ${brl(estimativa)}` : ''}${semPreco ? ` · ${semPreco} sem preço ainda` : ''}`
            : 'Comece pelo que está faltando em casa.'}
        </p>
      </header>

      <div className="chips" role="tablist" aria-label="Listas">
        {listas.map((l) => (
          <button key={l.id} role="tab" aria-selected={l.id === lista.id} className={`chip${l.id === lista.id ? ' ativo' : ''}`} onClick={() => abrirLista(db, l.id!)}>
            {l.nome}
          </button>
        ))}
        <button className="chip" onClick={() => setNovaLista('')}>+ Nova lista</button>
      </div>
      {novaLista !== null && (
        <form className="cartao destaque" onSubmit={async (e) => { e.preventDefault(); await criarLista(db, novaLista); setNovaLista(null) }}>
          <label className="campo">
            Nome da nova lista
            <input autoFocus value={novaLista} onChange={(e) => setNovaLista(e.target.value)} placeholder="Ex.: Churrasco de sábado" />
          </label>
          <div className="linha">
            <button type="button" className="botao secundario" onClick={() => setNovaLista(null)}>Cancelar</button>
            <button className="botao">Criar lista</button>
          </div>
        </form>
      )}

      <form className="cartao" onSubmit={adicionar} style={{ gap: 8 }}>
        <div className="linha">
          <input className="entrada cresce" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Arroz branco 5 kg" aria-label="Item" />
          <button className="botao" style={{ width: 'auto', padding: '12px 16px' }} disabled={!nome.trim()} aria-label="Adicionar item">+</button>
        </div>
        <div className="linha">
          <input className="entrada cresce" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca (opcional)" aria-label="Marca" />
          <select className="entrada cresce" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaProduto)} aria-label="Categoria">
            {CATEGORIAS_PRODUTO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </form>

      {sugestoes.length > 0 && (
        <section className="cartao" style={{ gap: 8 }}>
          <div className="linha entre">
            <h2>Deve estar acabando</h2>
            {sugestoes.length > 1 && (
              <button className="botao texto" style={{ padding: 0, fontSize: 14 }} onClick={async () => { for (const s of sugestoes) await sugerir(s) }}>
                + Todos
              </button>
            )}
          </div>
          <p className="pequeno">Pelo histórico: vocês costumam comprar e já passou o tempo de costume.</p>
          <div className="chips">
            {sugestoes.map((s) => (
              <button key={s.produtoId} className="chip" onClick={() => sugerir(s)} title={`Comprado ${s.vezes} vezes`}>
                + {s.nome} <span style={{ fontWeight: 400 }}>· a cada {s.intervaloDias} {s.intervaloDias === 1 ? 'dia' : 'dias'}, último há {s.diasDesde}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {comparacao.length > 1 && (
        <section className="cartao" style={{ gap: 6 }}>
          <h2>Onde a lista sai mais barata</h2>
          {comparacao.map((c, i) => (
            <div key={c.mercadoId} className="linha entre">
              <span style={{ fontSize: 14, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'var(--verde)' : undefined }}>{nomeMercado(c.mercadoId)}</span>
              <span className="pequeno">
                {brl(c.total)} · {c.comPreco} de {comProduto} {comProduto === 1 ? 'item' : 'itens'}
              </span>
            </div>
          ))}
          <p className="pequeno">
            Pelo último preço de cada item em cada mercado.{comparacao.some((c) => c.comPreco < maiorCobertura) ? ' Mercados com menos itens com preço ficam abaixo.' : ''}
          </p>
        </section>
      )}

      {grupos.length === 0 && <p className="vazio">A lista está vazia.</p>}
      {grupos.map(([cat, l]) => (
        <section key={cat} className="coluna">
          <p className="rotulo">{cat}</p>
          {l.map(linha)}
        </section>
      ))}

      {aberta ? (
        <>
          {abertaEmOutra && <p className="pequeno">Há uma compra em andamento de outra lista. Finalize ou cancele antes de começar esta.</p>}
          <button className="botao" onClick={() => navegar('/carrinho')}>Voltar ao carrinho</button>
        </>
      ) : iniciando ? (
        <form className="cartao destaque" onSubmit={comecar}>
          <h2>Iniciar compra · {lista.nome}</h2>
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

      <div className="linha entre">
        <Link to="/historico" className="botao texto" style={{ textDecoration: 'none' }}>Histórico de compras</Link>
        {listas.length > 1 && <button className="botao texto" style={{ color: 'var(--erro)' }} onClick={apagar}>Apagar lista</button>}
      </div>
    </div>
  )
}
