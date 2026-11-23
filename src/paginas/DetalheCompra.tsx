import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { db } from '../data/db'
import { buscarNotaNaSefaz, conferenciaAutomatica, parametroDaNota } from '../data/nota'
import { aplicarConferencia, codigosAprendidos, salvarNotaLida, trocarCartaoDaCompra, vincularNota } from '../data/repo'
import { conferirComNota, type LinhaConferencia } from '../domain/nota'
import { brl, codigoDoProduto, dataBR, formatarCNPJ, lerNotaFiscal, totalCarrinho } from '../domain/regras'
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
      aprendidos: await codigosAprendidos(db),
    }
  }, [compraId])
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState('')
  const [trocandoCartao, setTrocandoCartao] = useState(false)
  const [vendoNota, setVendoNota] = useState(false)
  const [conferindo, setConferindo] = useState(false)
  const [tirarNaoCobrados, setTirarNaoCobrados] = useState(false)

  if (!dados) return null
  if (!dados.compra) {
    return (
      <div className="conteudo">
        <Cabecalho titulo="Compra não encontrada" />
        <button className="botao" onClick={() => navegar('/historico')}>Ver histórico</button>
      </div>
    )
  }
  const { compra, mercado, itens, cartoes, aprendidos } = dados
  const total = totalCarrinho(itens!)
  const cartao = cartoes!.find((c) => c.id === compra.cartaoId)

  const conf = compra.conferencia
  const resultado = conf && !conf.aplicadaEm ? conferirComNota(itens!, { emitente: conf.emitente, cnpj: conf.cnpj, itens: conf.itens, total: conf.total }, aprendidos) : null
  const grupo = (s: LinhaConferencia['situacao']) => resultado?.linhas.filter((l) => l.situacao === s) ?? []
  const podeBuscar = conferenciaAutomatica && !!compra.nota?.url && !!parametroDaNota(compra.nota.url)

  async function conferir() {
    setErro('')
    setConferindo(true)
    try {
      await salvarNotaLida(db, compraId, await buscarNotaNaSefaz(compra.nota!.url!))
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setConferindo(false)
    }
  }

  async function aplicar() {
    await aplicarConferencia(db, compraId, { incluirSoNaNota: true, tirarSoNoCarrinho: tirarNaoCobrados })
  }

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
            {compra.nota.url && (
              <button className="botao secundario" onClick={() => setVendoNota((v) => !v)}>{vendoNota ? 'Fechar a nota' : 'Ver a nota aqui'}</button>
            )}
            {vendoNota && compra.nota.url && (
              <iframe className="nota-sefaz" src={compra.nota.url} title="Nota fiscal na SEFAZ" referrerPolicy="no-referrer" />
            )}
            {conf?.aplicadaEm ? (
              <p className="pequeno" style={{ color: 'var(--verde)' }}>✓ Conferida com a nota em {dataBR(conf.aplicadaEm)}: preços e itens da compra seguem a nota.</p>
            ) : !conf && podeBuscar ? (
              <button className="botao" onClick={conferir} disabled={conferindo}>{conferindo ? 'Buscando a nota na SEFAZ…' : 'Conferir itens com a nota'}</button>
            ) : !conf ? (
              <p className="pequeno">
                {compra.nota.url
                  ? 'A conferência automática dos itens liga quando o login (Supabase) estiver configurado. Por enquanto, veja a nota aqui e compare.'
                  : 'Para conferir os itens, leia o QR Code do cupom (a chave digitada não traz o link de consulta).'}
              </p>
            ) : null}
            {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
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

      {resultado && conf && (
        <section className="cartao destaque" style={{ gap: 10 }}>
          <h2>Conferência com a nota</h2>
          <div className="linha entre">
            <span className="pequeno">Carrinho</span>
            <strong>{brl(resultado.totalCarrinho)}</strong>
          </div>
          <div className="linha entre">
            <span className="pequeno">Nota ({conf.itens.length} {conf.itens.length === 1 ? 'item' : 'itens'}{conf.pagamento ? ` · ${conf.pagamento}` : ''})</span>
            <strong style={{ color: resultado.totalNota !== resultado.totalCarrinho ? 'var(--alerta)' : 'var(--verde)' }}>{brl(resultado.totalNota)}</strong>
          </div>
          <GrupoConferencia titulo="Na nota, mas não no carrinho" dica="Esqueceram de escanear? Entram na compra como extra." linhas={grupo('soNaNota')} cor="var(--alerta)" />
          <GrupoConferencia titulo="No carrinho, mas não na nota" dica="Pode não ter sido cobrado, ou o nome na nota é bem diferente." linhas={grupo('soNoCarrinho')} cor="var(--erro)" />
          <GrupoConferencia titulo="Preço diferente" linhas={grupo('preco')} cor="var(--alerta)" />
          <GrupoConferencia titulo="Quantidade diferente" linhas={grupo('quantidade')} cor="var(--alerta)" />
          <GrupoConferencia titulo="Conferidos" linhas={grupo('ok')} cor="var(--verde)" fechado />
          {grupo('soNoCarrinho').length > 0 && (
            <label className="linha pequeno" style={{ gap: 8 }}>
              <input type="checkbox" checked={tirarNaoCobrados} onChange={(e) => setTirarNaoCobrados(e.target.checked)} />
              Tirar da compra o que não está na nota
            </label>
          )}
          <button className="botao" onClick={aplicar}>Usar os valores da nota</button>
          <p className="pequeno">A nota é a fonte oficial: os preços dela vão para o histórico e o gasto do mês é acertado.</p>
        </section>
      )}

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
              {codigoDoProduto(i.produtoId) && <div className="detalhe codigo">{codigoDoProduto(i.produtoId)}</div>}
            </div>
            <span className="preco">{brl(Math.round(i.valorUnit * i.quantidade))}</span>
          </div>
        ))}
      </section>
    </div>
  )
}

function GrupoConferencia({ titulo, dica, linhas, cor, fechado }: { titulo: string; dica?: string; linhas: LinhaConferencia[]; cor: string; fechado?: boolean }) {
  const [aberto, setAberto] = useState(!fechado)
  if (linhas.length === 0) return null
  return (
    <div className="coluna" style={{ gap: 4 }}>
      <button type="button" className="botao texto" style={{ padding: 0, textAlign: 'left', color: cor, fontWeight: 600 }} onClick={() => setAberto((v) => !v)}>
        {aberto ? '▾' : '▸'} {titulo} · {linhas.length}
      </button>
      {aberto && dica && <p className="pequeno">{dica}</p>}
      {aberto &&
        linhas.map((l, k) => (
          <div key={k} className="linha entre pequeno" style={{ alignItems: 'flex-start', gap: 8 }}>
            <span className="cresce">
              {l.item?.nome ?? l.nota!.descricao}
              {l.item && l.nota && <span style={{ display: 'block', fontSize: 11 }}>nota: {l.nota.descricao}</span>}
            </span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {l.situacao === 'preco' ? (
                <>
                  {brl(l.item!.valorUnit)} → <strong>{brl(l.nota!.valorUnit)}</strong>
                </>
              ) : l.situacao === 'quantidade' ? (
                <>
                  {l.item!.quantidade} → <strong>{l.nota!.quantidade}</strong> un
                </>
              ) : l.nota ? (
                <>
                  {l.nota.quantidade} × {brl(l.nota.valorUnit)}
                </>
              ) : (
                <>
                  {l.item!.quantidade} × {brl(l.item!.valorUnit)}
                </>
              )}
            </span>
          </div>
        ))}
    </div>
  )
}
