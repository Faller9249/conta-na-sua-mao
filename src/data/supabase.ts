import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'

/**
 * URL e chave pública (anon/publishable) do projeto Supabase.
 * A chave pública pode ficar no site: quem protege os dados são as regras de acesso do Supabase.
 * Local: arquivo .env.local. GitHub Pages: variáveis do repositório (ver README).
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// PKCE: os links de e-mail voltam com ?code=..., o que não briga com as rotas em #/ do app.
export const supabase: SupabaseClient | null =
  url && chave ? createClient(url, chave, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } }) : null

/** Sem as chaves o app roda sem login (modo local), como antes. */
export const loginAtivo = supabase !== null

/** Endereço do site, para os links de confirmação e de nova senha voltarem para cá. */
export function enderecoDoSite() {
  return `${window.location.origin}${import.meta.env.BASE_URL}`
}

export type EstadoSessao =
  | { carregando: true }
  | { carregando: false; sessao: Session | null; recuperandoSenha: boolean; concluirRecuperacao: () => void }

/** Tira o ?code=... da barra de endereço depois que o login pelo link foi feito. */
function limparEndereco() {
  const u = new URL(window.location.href)
  if (u.searchParams.has('code')) {
    u.searchParams.delete('code')
    window.history.replaceState(null, '', u.toString())
  }
}

export function useSessao(): EstadoSessao {
  const [sessao, setSessao] = useState<Session | null | undefined>(loginAtivo ? undefined : null)
  const [recuperandoSenha, setRecuperando] = useState(false)
  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      limparEndereco()
    })
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
      setSessao(s)
      limparEndereco()
    })
    return () => data.subscription.unsubscribe()
  }, [])
  if (sessao === undefined) return { carregando: true }
  return { carregando: false, sessao, recuperandoSenha, concluirRecuperacao: () => setRecuperando(false) }
}

export async function sair() {
  await supabase?.auth.signOut()
}

/** Traduz as mensagens de erro mais comuns do Supabase. */
export function mensagemDeErro(erro: { message?: string; code?: string } | null | undefined): string {
  const m = `${erro?.code ?? ''} ${erro?.message ?? ''}`.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid_credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) return 'Confirme o e-mail pelo link que enviamos antes de entrar.'
  if (m.includes('already registered') || m.includes('user_already_exists')) return 'Este e-mail já tem conta. Use “Entrar”.'
  if (m.includes('signups not allowed') || m.includes('signup_disabled')) return 'Cadastros fechados. Peça um convite para quem administra a casa.'
  if (m.includes('password') && (m.includes('6') || m.includes('weak'))) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit')) return 'Muitas tentativas. Espere um pouco e tente de novo.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão com o servidor. Confira a internet.'
  return 'Não deu certo. Tente de novo.'
}
