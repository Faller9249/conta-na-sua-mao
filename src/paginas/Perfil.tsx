import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { criarConvite, dadosDaCasa, mudarMeuNome, removerMembro, renomearCasaNaNuvem, type CasaRemota, type Membro } from '../data/casaRemota'
import { db } from '../data/db'
import { nomeDoUsuario, sincronizador } from '../data/nuvem'
import { enderecoDoSite, loginAtivo, mensagemDeErro, sair, supabase, useSessao } from '../data/supabase'
import { desligarDaCasa, useStatusSync } from '../data/sync'
import { Cabecalho } from '../ui/componentes'

const hora = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

export function Perfil() {
  const navegar = useNavigate()
  const login = useSessao()
  const voltar = <button type="button" className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={() => navegar(-1)}>‹ Voltar</button>

  if (!loginAtivo) {
    return (
      <div className="conteudo">
        {voltar}
        <Cabecalho titulo="Perfil" sub="Modo sem login" />
        <p className="cartao pequeno">Os dados ficam só neste celular. O login e a casa compartilhada ligam quando o app é publicado com o Supabase.</p>
      </div>
    )
  }
  if (login.carregando || !login.sessao) return null
  return (
    <div className="conteudo">
      {voltar}
      <Cabecalho titulo="Perfil" />
      <Conta key={login.sessao.user.id} />
      <TrocarSenha />
      <CasaCompartilhada meuId={login.sessao.user.id} />
      <Sincronizacao />
      <button className="botao secundario" onClick={() => sair()}>Sair da conta</button>
    </div>
  )
}

function Conta() {
  const login = useSessao()
  const user = !login.carregando ? login.sessao?.user : undefined
  const [nome, setNome] = useState(nomeDoUsuario(user))
  const [editando, setEditando] = useState(false)
  const [msg, setMsg] = useState('')
  if (!user) return null

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase!.auth.updateUser({ data: { nome: nome.trim() } })
    if (error) return setMsg(mensagemDeErro(error))
    await mudarMeuNome(supabase!, nome).catch(() => undefined)
    setEditando(false)
    setMsg('')
  }

  return (
    <section className="cartao">
      <div className="linha" style={{ gap: 12 }}>
        <span className="avatar grande" aria-hidden="true">{(nomeDoUsuario(user)[0] ?? '?').toUpperCase()}</span>
        <div className="cresce" style={{ minWidth: 0 }}>
          {editando ? (
            <form className="linha" onSubmit={salvar}>
              <input className="entrada cresce" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Seu nome" />
              <button className="botao" style={{ width: 'auto', padding: '10px 14px' }} disabled={!nome.trim()}>OK</button>
            </form>
          ) : (
            <div className="linha entre">
              <strong style={{ fontSize: 17 }}>{nomeDoUsuario(user)}</strong>
              <button className="botao texto" style={{ padding: 0, fontSize: 14 }} onClick={() => setEditando(true)}>Editar nome</button>
            </div>
          )}
          <p className="pequeno" style={{ overflowWrap: 'anywhere' }}>{user.email}</p>
        </div>
      </div>
      {msg && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{msg}</p>}
    </section>
  )
}

function TrocarSenha() {
  const [aberto, setAberto] = useState(false)
  const [senha, setSenha] = useState('')
  const [repetir, setRepetir] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (senha.length < 6) return setMsg({ ok: false, texto: 'A senha precisa ter pelo menos 6 caracteres.' })
    if (senha !== repetir) return setMsg({ ok: false, texto: 'As duas senhas não são iguais.' })
    setEnviando(true)
    const { error } = await supabase!.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) {
      const m = `${error.code ?? ''} ${error.message}`.toLowerCase()
      return setMsg({
        ok: false,
        texto: m.includes('same_password') || m.includes('different from the old')
          ? 'A nova senha precisa ser diferente da atual.'
          : m.includes('reauthentication')
            ? 'Por segurança, saia e entre de novo antes de trocar a senha.'
            : mensagemDeErro(error),
      })
    }
    setSenha('')
    setRepetir('')
    setAberto(false)
    setMsg({ ok: true, texto: 'Senha trocada. Use a nova na próxima vez que entrar.' })
  }

  return (
    <section className="cartao">
      <div className="linha entre">
        <h2>Senha</h2>
        {!aberto && <button className="botao texto" style={{ padding: 0, fontSize: 14 }} onClick={() => { setAberto(true); setMsg(null) }}>Trocar senha</button>}
      </div>
      {aberto && (
        <form className="coluna" onSubmit={salvar}>
          <label className="campo">
            Nova senha
            <input type="password" autoComplete="new-password" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Pelo menos 6 caracteres" />
          </label>
          <label className="campo">
            Repita a nova senha
            <input type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </label>
          <div className="linha">
            <button type="button" className="botao secundario" onClick={() => { setAberto(false); setMsg(null) }}>Cancelar</button>
            <button className="botao" disabled={enviando || !senha || !repetir}>{enviando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </form>
      )}
      {msg && <p className="pequeno" role={msg.ok ? 'status' : 'alert'} style={{ color: msg.ok ? 'var(--verde)' : 'var(--erro)' }}>{msg.texto}</p>}
    </section>
  )
}

function CasaCompartilhada({ meuId }: { meuId: string }) {
  const [dados, setDados] = useState<{ casa: CasaRemota | null; membros: Membro[] } | null>(null)
  const [erro, setErro] = useState('')
  const [convite, setConvite] = useState('')
  const [recarregar, setRecarregar] = useState(0)
  const [renomeando, setRenomeando] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    dadosDaCasa(supabase!)
      .then((d) => vivo && setDados(d))
      .catch((e: Error) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [recarregar])

  if (!dados) {
    return (
      <section className="cartao">
        <h2>Casa</h2>
        <p className="pequeno" style={{ color: erro ? 'var(--erro)' : undefined }}>{erro || 'Carregando…'}</p>
      </section>
    )
  }
  const { casa, membros } = dados
  if (!casa) return null
  const souDono = membros.some((m) => m.user_id === meuId && m.papel === 'dono')
  const cheia = membros.length >= casa.max_membros

  async function convidar() {
    setErro('')
    try {
      setConvite(await criarConvite(supabase!))
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function compartilhar() {
    const texto = `Entre na nossa casa no Conta na sua Mão: ${enderecoDoSite()}\nCrie sua conta e use o código de convite ${convite} (vale 7 dias).`
    if (navigator.share) await navigator.share({ text: texto }).catch(() => undefined)
    else await navigator.clipboard?.writeText(texto)
  }

  async function tirar(m: Membro) {
    if (!confirm(`Tirar ${m.nome ?? 'esta pessoa'} da casa? Ela deixa de ver os dados.`)) return
    try {
      await removerMembro(supabase!, m.user_id)
      setRecarregar((r) => r + 1)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function sairDaCasa() {
    const aviso = membros.length === 1 ? 'Você é a única pessoa: a casa e os dados dela na nuvem serão apagados.' : 'Você deixa de ver os dados da casa. Os dados deste celular continuam aqui, sem sincronizar.'
    if (!confirm(`Sair da casa “${casa!.nome}”? ${aviso}`)) return
    try {
      await removerMembro(supabase!, meuId)
      sincronizador?.parar()
      await desligarDaCasa(db)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  return (
    <section className="cartao">
      {renomeando !== null ? (
        <form className="linha" onSubmit={async (e) => { e.preventDefault(); await renomearCasaNaNuvem(supabase!, casa.id, renomeando).catch((x: Error) => setErro(x.message)); await db.casa.update('casa', { nome: renomeando.trim() }); setRenomeando(null); setRecarregar((r) => r + 1) }}>
          <input className="entrada cresce" autoFocus value={renomeando} onChange={(e) => setRenomeando(e.target.value)} aria-label="Nome da casa" />
          <button className="botao" style={{ width: 'auto', padding: '10px 14px' }} disabled={!renomeando.trim()}>OK</button>
        </form>
      ) : (
        <div className="linha entre">
          <h2>{casa.nome}</h2>
          <button className="botao texto" style={{ padding: 0, fontSize: 14 }} onClick={() => setRenomeando(casa.nome)}>Renomear</button>
        </div>
      )}
      <p className="rotulo">Pessoas · {membros.length} de {casa.max_membros}</p>
      {membros.map((m) => (
        <div key={m.user_id} className="linha entre">
          <div className="linha" style={{ gap: 10 }}>
            <span className="avatar" aria-hidden="true">{(m.nome?.[0] ?? '?').toUpperCase()}</span>
            <div>
              <strong style={{ fontSize: 15 }}>{m.nome ?? 'Sem nome'}{m.user_id === meuId ? ' (você)' : ''}</strong>
              <p className="pequeno">{m.papel === 'dono' ? 'Criou a casa' : 'Membro'}</p>
            </div>
          </div>
          {souDono && m.user_id !== meuId && <button className="botao texto" style={{ padding: 0, fontSize: 14, color: 'var(--erro)' }} onClick={() => tirar(m)}>Tirar</button>}
        </div>
      ))}

      {convite ? (
        <div className="cartao verde" style={{ gap: 8, alignItems: 'center' }}>
          <p className="pequeno">Código de convite (vale 7 dias, uma pessoa)</p>
          <strong style={{ fontSize: 30, letterSpacing: '0.25em' }}>{convite}</strong>
          <p className="pequeno" style={{ textAlign: 'center' }}>A outra pessoa cria a conta no app e escolhe “Tenho um código de convite”.</p>
          <button className="botao" onClick={compartilhar}>Enviar o convite</button>
        </div>
      ) : cheia ? (
        <p className="pequeno">
          A casa está completa: o plano {casa.plano === 'gratis' ? 'grátis' : casa.plano} permite até {casa.max_membros} pessoas.
          {casa.plano === 'gratis' ? ' Planos com mais pessoas virão na assinatura.' : ''}
        </p>
      ) : (
        <button className="botao secundario" onClick={convidar}>+ Convidar pessoa</button>
      )}
      {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
      <button className="botao texto" style={{ color: 'var(--erro)', alignSelf: 'flex-start' }} onClick={sairDaCasa}>Sair da casa</button>
    </section>
  )
}

function Sincronizacao() {
  const status = useStatusSync(sincronizador)
  const pendentes = useLiveQuery(() => db.fila.count()) ?? 0
  const vinculo = useLiveQuery(() => db.meta.get('sync'))
  const texto = {
    desligada: 'Desligada',
    sincronizando: 'Sincronizando…',
    ok: `Em dia${status.ultima ? ` · ${hora(status.ultima)}` : ''}`,
    offline: 'Sem internet: as alterações vão quando a conexão voltar',
    erro: `Não sincronizou${status.erro ? `: ${status.erro}` : ''}`,
  }[status.situacao]
  const cor = status.situacao === 'ok' ? 'var(--verde)' : status.situacao === 'erro' ? 'var(--erro)' : status.situacao === 'offline' ? 'var(--alerta)' : undefined
  return (
    <section className="cartao">
      <h2>Sincronização</h2>
      <p className="pequeno" style={{ color: cor }}>{texto}</p>
      {pendentes > 0 && <p className="pequeno">{pendentes} {pendentes === 1 ? 'alteração esperando' : 'alterações esperando'} envio</p>}
      {!status.ultima && vinculo?.ultimaSync && <p className="pequeno">Última vez: {hora(vinculo.ultimaSync)}</p>}
      <button className="botao secundario" disabled={status.situacao === 'sincronizando'} onClick={() => sincronizador?.agora()}>Sincronizar agora</button>
    </section>
  )
}
