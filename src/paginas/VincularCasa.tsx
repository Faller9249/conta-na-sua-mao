import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { criarCasaNaNuvem, entrarComConvite, minhaCasa } from '../data/casaRemota'
import { db } from '../data/db'
import { nomeDoUsuario } from '../data/nuvem'
import { sair, supabase } from '../data/supabase'
import { apagarDadosDoCelular, ligarNaCasa } from '../data/sync'
import { Cabecalho } from '../ui/componentes'
import { CriarCasa } from './CriarCasa'

interface Situacao {
  /** Casa da nuvem em que a conta já está (ex.: celular novo). */
  casaDaConta: string | null
  /** O celular tem dados de outra conta? */
  outraConta: boolean
  casaLocal?: string
  compras: number
  itensLista: number
  gastos: number
}

type Escolha = 'juntar' | 'descartar'

/** Liga este celular à casa da nuvem: criar a casa, entrar com convite ou baixar a casa da conta. */
export function VincularCasa({ sessao }: { sessao: Session }) {
  const [sit, setSit] = useState<Situacao | null>(null)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const [modo, setModo] = useState<'inicio' | 'criar' | 'convite'>('inicio')
  const [meuNome, setMeuNome] = useState(nomeDoUsuario(sessao.user))
  const [codigo, setCodigo] = useState('')
  const [escolha, setEscolha] = useState<Escolha>('juntar')
  const [enviando, setEnviando] = useState(false)
  const userId = sessao.user.id

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        setErro('')
        const vinculo = await db.meta.get('sync')
        const [casaDaConta, casa, compras, itensLista, gastos] = await Promise.all([
          minhaCasa(supabase!),
          db.casa.get('casa'),
          db.compras.count(),
          db.lista.count(),
          db.lancamentos.count(),
        ])
        if (vivo) setSit({ casaDaConta, outraConta: !!vinculo && vinculo.userId !== userId, casaLocal: casa?.nome, compras, itensLista, gastos })
      } catch (e) {
        if (vivo) setErro((e as Error).message)
      }
    })()
    return () => {
      vivo = false
    }
  }, [userId, tentativa])

  async function executar(fn: () => Promise<void>) {
    setEnviando(true)
    setErro('')
    try {
      await fn()
    } catch (e) {
      setErro((e as Error).message)
      setEnviando(false)
    }
  }

  if (erro && !sit) {
    return (
      <div className="conteudo" style={{ paddingTop: 48 }}>
        <Cabecalho titulo="Sem conexão" sub="Para ligar este celular à casa, precisa de internet só desta vez." />
        <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>
        <button className="botao" onClick={() => setTentativa((t) => t + 1)}>Tentar de novo</button>
        <button className="botao texto" onClick={() => sair()}>Sair da conta</button>
      </div>
    )
  }
  if (!sit) return <p className="vazio">Procurando a sua casa…</p>

  const temDados = !!sit.casaLocal || sit.compras + sit.itensLista + sit.gastos > 0
  const resumo = [
    sit.compras && `${sit.compras} ${sit.compras === 1 ? 'compra' : 'compras'}`,
    sit.itensLista && `${sit.itensLista} ${sit.itensLista === 1 ? 'item' : 'itens'} de lista`,
    sit.gastos && `${sit.gastos} ${sit.gastos === 1 ? 'gasto' : 'gastos'}`,
  ].filter(Boolean).join(', ')

  // Dados de outra conta neste celular: não se misturam.
  if (sit.outraConta) {
    return (
      <div className="conteudo" style={{ paddingTop: 48 }}>
        <Cabecalho titulo="Outra conta neste celular" sub="Os dados guardados aqui são da casa de outra conta e já estão na nuvem dela." />
        <button className="botao" disabled={enviando} onClick={() => executar(async () => { await apagarDadosDoCelular(db); setTentativa((t) => t + 1); setEnviando(false) })}>
          Limpar este celular e continuar
        </button>
        <button className="botao texto" onClick={() => sair()}>Voltar e entrar com a outra conta</button>
        {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
      </div>
    )
  }

  const opcoesDados =
    temDados ? (
      <div className="cartao" style={{ gap: 8 }}>
        <p className="pequeno">Este celular já tem {resumo || 'a configuração de uma casa'}. O que fazer com isso?</p>
        <div className="chips">
          <button type="button" className={`chip${escolha === 'juntar' ? ' ativo' : ''}`} onClick={() => setEscolha('juntar')}>Juntar com os da casa</button>
          <button type="button" className={`chip${escolha === 'descartar' ? ' ativo' : ''}`} onClick={() => setEscolha('descartar')}>Usar só os da casa</button>
        </div>
        <p className="pequeno">
          {escolha === 'juntar'
            ? 'Pessoas, cartões, mercados e listas com o mesmo nome viram um só. Compras e gastos se somam.'
            : 'O que só existe neste celular será apagado.'}
        </p>
      </div>
    ) : null

  // A conta já está numa casa: só baixar.
  if (sit.casaDaConta) {
    return (
      <div className="conteudo" style={{ paddingTop: 48 }}>
        <Cabecalho titulo="Sua casa está na nuvem" sub="Vamos trazer os dados dela para este celular." />
        {opcoesDados}
        {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
        <button className="botao" disabled={enviando} onClick={() => executar(() => ligarNaCasa(db, supabase!, { casaId: sit.casaDaConta!, userId }, temDados ? escolha : 'descartar'))}>
          {enviando ? 'Baixando…' : 'Continuar'}
        </button>
      </div>
    )
  }

  const campoNome = (
    <label className="campo">
      Seu nome
      <input value={meuNome} onChange={(e) => setMeuNome(e.target.value)} placeholder="Como a casa te chama" />
    </label>
  )

  async function criarNaNuvem(nomeCasa: string) {
    const casaId = await criarCasaNaNuvem(supabase!, nomeCasa, meuNome)
    await ligarNaCasa(db, supabase!, { casaId, userId }, 'subir')
  }

  if (modo === 'criar' && !sit.casaLocal) {
    return (
      <CriarCasa
        aoCriar={criarNaNuvem}
        rodape={
          <>
            {campoNome}
            <p className="pequeno" style={{ textAlign: 'center' }}>A casa fica na nuvem: depois é só convidar a outra pessoa pelo Perfil.</p>
            <button type="button" className="botao texto" onClick={() => setModo('inicio')}>Voltar</button>
          </>
        }
      />
    )
  }

  return (
    <div className="conteudo" style={{ paddingTop: 48 }}>
      <div className="linha" style={{ gap: 10 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--verde)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>R$</span>
        <strong style={{ fontSize: 22 }}>Conta na sua Mão</strong>
      </div>
      <Cabecalho titulo={`Olá${meuNome ? `, ${meuNome}` : ''}!`} sub="A casa junta os dados de vocês dois nos dois celulares." />

      {modo === 'inicio' && (
        <>
          <button className="botao" onClick={() => setModo('criar')}>Criar a nossa casa</button>
          <button className="botao secundario" onClick={() => setModo('convite')}>Tenho um código de convite</button>
          <p className="pequeno" style={{ textAlign: 'center' }}>Quem cria a casa convida a outra pessoa depois, pelo Perfil.</p>
        </>
      )}

      {modo === 'criar' && sit.casaLocal && (
        <section className="cartao destaque" style={{ gap: 10 }}>
          <h2>Criar “{sit.casaLocal}” na nuvem</h2>
          <p className="pequeno">Tudo o que já está neste celular{resumo ? ` (${resumo})` : ''} vai junto.</p>
          {campoNome}
          {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
          <button className="botao" disabled={enviando} onClick={() => executar(() => criarNaNuvem(sit.casaLocal!))}>{enviando ? 'Criando…' : 'Criar a casa'}</button>
          <button className="botao texto" onClick={() => setModo('inicio')}>Voltar</button>
        </section>
      )}

      {modo === 'convite' && (
        <form
          className="cartao destaque"
          style={{ gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault()
            executar(async () => {
              const casaId = await entrarComConvite(supabase!, codigo, meuNome)
              await ligarNaCasa(db, supabase!, { casaId, userId }, temDados ? escolha : 'descartar')
            })
          }}
        >
          <h2>Entrar com convite</h2>
          <label className="campo">
            Código de convite
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="Ex.: K7M2QP"
              autoCapitalize="characters"
              autoComplete="off"
              style={{ letterSpacing: '0.2em', fontWeight: 700 }}
            />
          </label>
          {campoNome}
          {opcoesDados}
          {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
          <button className="botao" disabled={enviando || codigo.length !== 6}>{enviando ? 'Entrando…' : 'Entrar na casa'}</button>
          <button type="button" className="botao texto" onClick={() => setModo('inicio')}>Voltar</button>
        </form>
      )}

      <button className="botao texto" onClick={() => sair()}>Sair da conta</button>
    </div>
  )
}
