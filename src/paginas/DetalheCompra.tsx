import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { trocarCartaoDaCompra, vincularNota } from '../data/repo'
import { brl, dataBR, formatarCNPJ, lerNotaFiscal, totalCarrinho } from '../domain/regras'
import { Cabecalho } from '../ui/componentes'
import { LeitorCodigo } from '../ui/LeitorCodigo'

export function DetalheCompra() {
  const navegar = useNavigate()
  const { id } = useParams()
  const [params] = useSearchParams()
  const recemFinalizada = params.has('nova')
  const compraId = Number(id)
  const dados = useLiveQuery(async () => {
    const compra = await db.compras.get(compraId)
    if (!compra) return { compra: null }
    return {
      compra,
      mercado: await db.mercados.get(compra.mercadoId),
      itens: await db.itensCompra.where('compraId').equals(compraId).toArray(),
      cartoes: await db.cartoes.toArray(),
    }
  }, [compraId])
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [trocandoCartao, setTrocandoCartao] = useState(false)

  if (!dados) return null
  if (!dados.compra) {
    return (
      <div className="conteudo">
        <Cabecalho titulo="Compra não encontrada" />
        <button className="botao" onClick={() => navegar('/historico')}>Ver histórico</button>
      </div>
    )
  }
  const { compra, mercado, itens, cartoes } = dados
  const total = totalCarrinho(itens!)
  const cartao = cartoes!.find((c) => c.id === compra.cartaoId)

  async function aoLerNota(texto: string) {
    setErro('')
    const nota = lerNotaFiscal(texto)
    if (!nota) return setErro('Não reconheci uma nota fiscal. Aponte para o QR Code no fim do cupom ou cole a chave de 44 números.')
    if (nota.modelo !== '65' && nota.modelo !== '55') return setErro('Isso não parece uma nota fiscal de compra.')
    try {
      await vincularNota(db, compraId, nota)
      setLendo(false)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  return (
    <div className="conteudo">
      <button type="button" className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={() => (recemFinalizada ? navegar('/') : navegar(-1))}>
        ‹ {recemFinalizada ? 'Início' : 'Voltar'}
      </button>
      <Cabecalho titulo={mercado?.nome ?? 'Compra'} sub={[dataBR(compra.fim ?? compra.inicio), compra.nomeLista].filter(Boolean).join(' · ')} />

      {recemFinalizada && (
        <section className="cartao verde">
          <strong style={{ color: 'var(--verde)' }}>Compra salva: {brl(total)}</strong>
          <p className="pequeno">Pode ler a nota fiscal agora ou depois, pelo Histórico.</p>
        </section>
      )}

      <section className="cartao" style={{ gap: 8 }}>
        <div className="linha entre">
          <span className="pequeno">Total</span>
          <strong style={{ fontSize: 20 }}>{brl(total)}</strong>
        </div>
        <div className="linha entre">
          <span className="pequeno">Pagamento</span>
          <button className="botao texto" style={{ padding: 0 }} onClick={() => setTrocandoCartao((v) => !v)}>
            {cartao ? `${cartao.nome} · ${cartao.tipo}` : 'Não informado'} ✎
          </button>
        </div>
        {trocandoCartao && (
          <div className="chips">
            {cartoes!.filter((c) => c.ativo || c.id === compra.cartaoId).map((c) => (
              <button key={c.id} className={`chip${c.id === compra.cartaoId ? ' ativo' : ''}`} onClick={async () => { await trocarCartaoDaCompra(db, compraId, c.id); setTrocandoCartao(false) }}>
                {c.nome}
              </button>
            ))}
            <button className={`chip${compra.cartaoId === undefined ? ' ativo' : ''}`} onClick={async () => { await trocarCartaoDaCompra(db, compraId, undefined); setTrocandoCartao(false) }}>Não informar</button>
          </div>
        )}
      </section>

      <section className={`cartao ${compra.nota ? 'verde' : 'alerta'}`} style={{ gap: 8 }}>
        <p className="rotulo" style={{ color: compra.nota ? 'var(--verde)' : 'var(--alerta)' }}>{compra.nota ? 'Nota fiscal lida' : 'Nota fiscal pendente'}</p>
        {compra.nota ? (
          <>
            <p className="pequeno">CNPJ do mercado: {formatarCNPJ(compra.nota.cnpj)} · emitida em {compra.nota.emissao.slice(5)}/{compra.nota.emissao.slice(0, 4)}</p>
            <p className="pequeno" style={{ overflowWrap: 'anywhere' }}>Chave: {compra.nota.chave.replace(/(\d{4})/g, '$1 ').trim()}</p>
            {compra.nota.url && <a className="botao secundario" style={{ textAlign: 'center', textDecoration: 'none' }} href={compra.nota.url} target="_blank" rel="noreferrer">Abrir a nota na SEFAZ</a>}
            <p className="pequeno">A conferência item a item (esquecidos, preços diferentes) chega na Fase 2.</p>
          </>
        ) : lendo ? (
          <>
            <LeitorCodigo modo="nota" aoLer={aoLerNota} />
            {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
            <button className="botao texto" onClick={() => setLendo(false)}>Deixar para depois</button>
          </>
        ) : (
          <>
            <p className="pequeno">Leia o QR Code no fim do cupom para guardar a nota junto com a compra.</p>
            <button className="botao" onClick={() => setLendo(true)}>Ler nota fiscal</button>
          </>
        )}
      </section>

      <section className="coluna">
        <p className="rotulo">{itens!.length} {itens!.length === 1 ? 'item' : 'itens'}</p>
        {itens!.map((i) => (
          <div key={i.id} className="item">
            <div className="cresce">
              <div className="nome">{i.nome}</div>
              <div className="detalhe">
                {i.marca ? `${i.marca} · ` : ''}
                {i.quantidade} × {brl(i.valorUnit)}
                {!i.naLista && ' · extra'}
              </div>
            </div>
            <span className="preco">{brl(Math.round(i.valorUnit * i.quantidade))}</span>
          </div>
        ))}
      </section>
    </div>
  )
}
