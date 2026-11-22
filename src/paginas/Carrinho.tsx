import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../data/db'
import { buscarProduto } from '../data/produtos'
import {
  cancelarCompra,
  cartoesAtivos,
  colocarNoCarrinho,
  compraAberta,
  finalizarCompra,
  garantirProduto,
  pendentesDaCompra,
  tirarDoCarrinho,
} from '../data/repo'
import { brl, lerEtiquetaBalanca, lerValor, precoSugerido, totalCarrinho, totalExtras } from '../domain/regras'
import { CATEGORIAS_PRODUTO, type CategoriaProduto, type OrigemPreco, type Produto } from '../domain/tipos'
import { Barra, Cabecalho, Check, corDoUso } from '../ui/componentes'
import { LeitorCodigo } from '../ui/LeitorCodigo'

/** Item lido e ainda não confirmado. */
interface Lido {
  produto?: Produto
  /** Código lido, para cadastrar o produto quando a base não conhece. */
  id?: string
  ean?: string
  valorEtiqueta?: number
}

function dataCurta(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

export function Carrinho() {
  const navegar = useNavigate()
  const dados = useLiveQuery(async () => {
    const compra = await compraAberta(db)
    if (!compra) return { compra: null }
    return {
      compra,
      mercado: await db.mercados.get(compra.mercadoId),
      mercados: await db.mercados.toArray(),
      itens: await db.itensCompra.where('compraId').equals(compra.id!).toArray(),
      pendentes: await pendentesDaCompra(db, compra.id!),
      precos: await db.precos.toArray(),
      cartoes: await cartoesAtivos(db),
    }
  })
  const [lido, setLido] = useState<Lido | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [marca, setMarca] = useState('')
  const [catNova, setCatNova] = useState<CategoriaProduto>('Mercearia')
  const [preco, setPreco] = useState('')
  const [qtd, setQtd] = useState(1)
  const [semCodigo, setSemCodigo] = useState(false)
  const [finalizando, setFinalizando] = useState(false)
  const [cartaoId, setCartaoId] = useState<number | undefined>()
  const [aviso, setAviso] = useState('')

  if (!dados) return null
  if (!dados.compra) {
    return (
      <div className="conteudo">
        <Cabecalho titulo="Carrinho" sub="Nenhuma compra em andamento." />
        <p className="vazio">Monte a lista e toque em “Iniciar compra” quando chegar no mercado.</p>
        <button className="botao" onClick={() => navegar('/lista')}>Ir para a lista</button>
        <Link to="/historico" className="botao texto" style={{ textAlign: 'center', textDecoration: 'none' }}>Ver compras anteriores</Link>
      </div>
    )
  }
  const { compra, mercado, mercados, itens, pendentes, precos, cartoes } = dados
  const total = totalCarrinho(itens!)
  const extras = totalExtras(itens!)
  const sug = lido?.produto ? precoSugerido(precos!, lido.produto.id, compra.mercadoId) : null
  const balanca = lido?.valorEtiqueta !== undefined
  const usarUltimo = !!sug && !sug.outroMercado && !balanca

  function mostrar(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 2500)
  }

  function preparar(produto: Produto | undefined, valorEtiqueta?: number) {
    setQtd(1)
    setMarca(produto?.marca ?? '')
    if (valorEtiqueta !== undefined) return setPreco((valorEtiqueta / 100).toFixed(2).replace('.', ','))
    const s = produto ? precoSugerido(precos!, produto.id, compra.mercadoId) : null
    setPreco(s ? (s.valor / 100).toFixed(2).replace('.', ',') : '')
  }

  async function aoLer(codigo: string) {
    if (lido) return
    const etiqueta = lerEtiquetaBalanca(codigo)
    setNomeNovo('')
    if (etiqueta) {
      const id = `balanca:${compra.mercadoId}:${etiqueta.codigo}`
      const produto = await db.produtos.get(id)
      setLido({ produto, id, valorEtiqueta: etiqueta.valor })
      setCatNova('Hortifrúti')
      preparar(produto, etiqueta.valor)
      return
    }
    setBuscando(true)
    const produto = await buscarProduto(db, codigo)
    setBuscando(false)
    setLido({ produto: produto ?? undefined, id: codigo, ean: codigo })
    setCatNova('Mercearia')
    preparar(produto ?? undefined)
  }

  async function escolherSemCodigo(nome: string, categoria: CategoriaProduto, produtoId?: string, marcaDaLista?: string) {
    const produto = (produtoId && (await db.produtos.get(produtoId))) || (await garantirProduto(db, { nome, categoria, marca: marcaDaLista }))
    setSemCodigo(false)
    setLido({ produto })
    preparar(produto)
    if (!produto.marca && marcaDaLista) setMarca(marcaDaLista)
  }

  async function confirmar(valorForcado?: number) {
    if (!lido) return
    const valor = valorForcado ?? lerValor(preco)
    if (valor === null || valor === undefined) return mostrar('Digite o preço (ou deixe para depois com R$ 0,00).')
    let produto = lido.produto
    if (!produto) {
      if (!nomeNovo.trim()) return mostrar('Dê um nome ao produto.')
      produto = await garantirProduto(db, { id: lido.id, ean: lido.ean, nome: nomeNovo, categoria: catNova, marca })
    } else if (!produto.marca && marca.trim()) {
      produto = await garantirProduto(db, { id: produto.id, nome: produto.nome, categoria: produto.categoria, marca })
    }
    const origem: OrigemPreco = balanca ? 'balanca' : 'digitado'
    await colocarNoCarrinho(db, compra.id!, produto, valor, qtd, origem)
    mostrar(`${produto.nome} no carrinho`)
    setLido(null)
  }

  async function finalizar() {
    await finalizarCompra(db, compra.id!, { cartaoId })
    navegar(`/historico/${compra.id}?nova=1`)
  }

  async function cancelar() {
    if (!confirm('Cancelar esta compra? Os itens voltam para a lista.')) return
    await cancelarCompra(db, compra.id!)
    navegar('/lista')
  }

  return (
    <div className="conteudo">
      <Cabecalho titulo="Carrinho" sub={[mercado?.nome, compra.nomeLista].filter(Boolean).join(' · ')} />

      <section className="cartao" style={{ gap: 8 }}>
        <div className="linha entre" style={{ alignItems: 'baseline' }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{brl(total)}</span>
          {compra.orcamento > 0 && <span className="pequeno">de {brl(compra.orcamento)} do orçamento</span>}
        </div>
        {compra.orcamento > 0 && <Barra uso={total / compra.orcamento} cor={corDoUso(total / compra.orcamento)} />}
        {extras > 0 && <p className="pequeno">{brl(extras)} em itens fora da lista</p>}
      </section>

      {!finalizando && <LeitorCodigo aoLer={aoLer} pausado={!!lido || buscando} />}
      {buscando && <p className="pequeno" style={{ textAlign: 'center' }}>Procurando o produto…</p>}

      {lido && (
        <section className="cartao destaque" style={{ gap: 8 }}>
          <p className="rotulo" style={{ color: 'var(--verde)' }}>Lido agora</p>
          {lido.produto ? (
            <div>
              <strong style={{ fontSize: 16 }}>{lido.produto.nome}</strong>
              {(lido.produto.marca || lido.produto.quantidade) && (
                <p className="pequeno">{[lido.produto.marca && `Marca: ${lido.produto.marca}`, lido.produto.quantidade].filter(Boolean).join(' · ')}</p>
              )}
            </div>
          ) : (
            <>
              <p className="pequeno">{balanca ? 'Etiqueta de balança nova: qual é o produto?' : `Não achei o código ${lido.ean}. Qual é o produto? (fica salvo para a próxima)`}</p>
              <input className="entrada" autoFocus value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome do produto" aria-label="Nome do produto" />
              <select className="entrada" value={catNova} onChange={(e) => setCatNova(e.target.value as CategoriaProduto)} aria-label="Categoria">
                {CATEGORIAS_PRODUTO.map((c) => <option key={c}>{c}</option>)}
              </select>
            </>
          )}
          {!lido.produto?.marca && (
            <input className="entrada" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Marca (opcional)" aria-label="Marca" />
          )}
          {sug && (
            <p className="pequeno">
              Último preço {sug.outroMercado ? `no ${mercados!.find((m) => m.id === sug.mercadoId)?.nome ?? 'outro mercado'}` : 'aqui'}: {brl(sug.valor)} em {dataCurta(sug.data)}
            </p>
          )}
          {balanca && <p className="pequeno">Valor lido da etiqueta: {brl(lido.valorEtiqueta!)}</p>}
          <div className="linha">
            <label className="campo cresce">
              Preço (R$)
              <input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
            </label>
            <label className="campo" style={{ width: 110 }}>
              Quantidade
              <div className="linha">
                <button type="button" className="chip" onClick={() => setQtd((q) => Math.max(1, q - 1))} aria-label="Menos">−</button>
                <strong>{qtd}</strong>
                <button type="button" className="chip" onClick={() => setQtd((q) => q + 1)} aria-label="Mais">+</button>
              </div>
            </label>
          </div>
          <div className="linha">
            {usarUltimo && <button className="botao" onClick={() => confirmar(sug!.valor)}>Igual ao último</button>}
            <button className={`botao${usarUltimo ? ' secundario' : ''}`} onClick={() => confirmar()}>{usarUltimo ? 'Outro preço' : 'Pôr no carrinho'}</button>
          </div>
          <button className="botao texto" onClick={() => setLido(null)}>Descartar leitura</button>
        </section>
      )}

      {!lido && !finalizando && (semCodigo ? (
        <section className="cartao">
          <h2>Item sem código de barras</h2>
          {pendentes!.length > 0 && <p className="pequeno">Da lista:</p>}
          <div className="chips">
            {pendentes!.map((i) => (
              <button key={i.id} className="chip" onClick={() => escolherSemCodigo(i.nome, i.categoria, i.produtoId, i.marca)}>
                {i.nome}{i.marca ? ` · ${i.marca}` : ''}
              </button>
            ))}
          </div>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (nomeNovo.trim()) escolherSemCodigo(nomeNovo, catNova) }}>
            <input className="entrada cresce" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Ou digite o nome" aria-label="Nome do item" />
            <button className="botao" style={{ width: 'auto', padding: '12px 14px' }} disabled={!nomeNovo.trim()}>OK</button>
          </form>
          <button className="botao texto" onClick={() => setSemCodigo(false)}>Fechar</button>
        </section>
      ) : (
        <button className="botao secundario" onClick={() => { setNomeNovo(''); setSemCodigo(true) }}>Item sem código (pão, feira…)</button>
      ))}

      <section className="coluna">
        <p className="rotulo">No carrinho · {itens!.length} {pendentes!.length ? `· faltam ${pendentes!.length} da lista` : ''}</p>
        {itens!.length === 0 && <p className="vazio">Escaneie o primeiro produto.</p>}
        {[...itens!].reverse().map((i) => (
          <div key={i.id} className="item">
            <Check ok rotulo="No carrinho" />
            <div className="cresce">
              <div className="nome">{i.nome}</div>
              <div className="detalhe">
                {i.marca ? `${i.marca} · ` : ''}
                {i.quantidade} × {brl(i.valorUnit)}
                {!i.naLista && ' · extra'}
                {i.origemPreco === 'balanca' && ' · balança'}
              </div>
            </div>
            <span className="preco">{brl(Math.round(i.valorUnit * i.quantidade))}</span>
            <button className="x" aria-label={`Tirar ${i.nome} do carrinho`} onClick={() => tirarDoCarrinho(db, i)}>×</button>
          </div>
        ))}
      </section>

      {pendentes!.length > 0 && (
        <section className="cartao">
          <p className="rotulo">Faltam da lista</p>
          <p className="pequeno">{pendentes!.map((i) => (i.marca ? `${i.nome} (${i.marca})` : i.nome)).join(' · ')}</p>
        </section>
      )}

      {finalizando ? (
        <section className="cartao destaque">
          <h2>Como vocês pagaram?</h2>
          <div className="chips">
            {cartoes!.map((c) => (
              <button key={c.id} className={`chip${cartaoId === c.id ? ' ativo' : ''}`} onClick={() => setCartaoId(c.id)}>
                {c.nome} <span style={{ fontWeight: 400 }}>· {c.tipo}</span>
              </button>
            ))}
            <button className={`chip${cartaoId === undefined ? ' ativo' : ''}`} onClick={() => setCartaoId(undefined)}>Não informar</button>
          </div>
          {cartoes!.length === 0 && <p className="pequeno">Nenhum cartão cadastrado ainda.</p>}
          <Link to="/cartoes" className="botao texto" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>+ Cadastrar cartão</Link>
          <button className="botao" onClick={finalizar}>Confirmar compra de {brl(total)}</button>
          <button className="botao texto" onClick={() => setFinalizando(false)}>Voltar ao carrinho</button>
        </section>
      ) : (
        <>
          <button className="botao" onClick={() => { setLido(null); setFinalizando(true) }} disabled={itens!.length === 0}>Finalizar compra</button>
          <button className="botao perigo" onClick={cancelar}>Cancelar compra</button>
        </>
      )}
      {aviso && <div className="toast" role="status">{aviso}</div>}
    </div>
  )
}
