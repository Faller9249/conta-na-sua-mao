import { useState } from 'react'
import { enderecoDoSite, mensagemDeErro, supabase } from '../data/supabase'
import { Cabecalho } from '../ui/componentes'

type Modo = 'entrar' | 'criar' | 'esqueci'

const TEXTOS: Record<Modo, { titulo: string; sub: string; botao: string }> = {
  entrar: { titulo: 'Entrar', sub: 'Acesse as finanças da sua casa.', botao: 'Entrar' },
  criar: { titulo: 'Criar conta', sub: 'Cada pessoa da casa cria a sua.', botao: 'Criar conta' },
  esqueci: { titulo: 'Esqueci a senha', sub: 'Enviamos um link para criar uma senha nova.', botao: 'Enviar link' },
}

export function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  function trocar(m: Modo) {
    setModo(m)
    setErro('')
    setAviso('')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEnviando(true)
    setErro('')
    setAviso('')
    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) setErro(mensagemDeErro(error))
      } else if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { emailRedirectTo: enderecoDoSite() },
        })
        if (error) setErro(mensagemDeErro(error))
        else if (!data.session) setAviso('Conta criada. Abra o e-mail que enviamos e toque no link para confirmar.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: enderecoDoSite() })
        if (error) setErro(mensagemDeErro(error))
        else setAviso('Se o e-mail tiver conta, o link para nova senha chega em alguns minutos.')
      }
    } catch (falha) {
      setErro(mensagemDeErro(falha as Error))
    } finally {
      setEnviando(false)
    }
  }

  const t = TEXTOS[modo]
  return (
    <form className="conteudo" onSubmit={enviar} style={{ paddingTop: 48 }}>
      <div className="linha" style={{ gap: 10 }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--verde)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>R$</span>
        <strong style={{ fontSize: 22 }}>Conta na sua Mão</strong>
      </div>
      <Cabecalho titulo={t.titulo} sub={t.sub} />

      <label className="campo">
        E-mail
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" />
      </label>
      {modo !== 'esqueci' && (
        <label className="campo">
          Senha
          <input
            type="password"
            autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={modo === 'criar' ? 'Pelo menos 6 caracteres' : ''}
          />
        </label>
      )}

      {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
      {aviso && <p className="cartao verde pequeno" role="status" style={{ color: 'var(--texto)' }}>{aviso}</p>}

      <button className="botao" type="submit" disabled={enviando}>{enviando ? 'Aguarde…' : t.botao}</button>

      <div className="coluna" style={{ alignItems: 'center', gap: 4 }}>
        {modo !== 'entrar' && <button type="button" className="botao texto" onClick={() => trocar('entrar')}>Já tenho conta: entrar</button>}
        {modo !== 'criar' && <button type="button" className="botao texto" onClick={() => trocar('criar')}>Criar conta</button>}
        {modo !== 'esqueci' && <button type="button" className="botao texto" onClick={() => trocar('esqueci')}>Esqueci a senha</button>}
      </div>
    </form>
  )
}

/** Tela mostrada quando a pessoa chega pelo link de "esqueci a senha". */
export function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setEnviando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)
    if (error) setErro(mensagemDeErro(error))
    else aoConcluir()
  }
  return (
    <form className="conteudo" onSubmit={salvar} style={{ paddingTop: 48 }}>
      <Cabecalho titulo="Nova senha" sub="Escolha a senha que vai usar daqui pra frente." />
      <label className="campo">
        Nova senha
        <input type="password" autoComplete="new-password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
      </label>
      {erro && <p className="pequeno" role="alert" style={{ color: 'var(--erro)' }}>{erro}</p>}
      <button className="botao" disabled={enviando}>Salvar senha</button>
    </form>
  )
}
