// A casa na nuvem: criar, convidar (limite de pessoas do plano), entrar, sair.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Membro {
  user_id: string
  nome: string | null
  papel: 'dono' | 'membro'
  entrou_em: string
}

export interface CasaRemota {
  id: string
  nome: string
  max_membros: number
  plano: string
}

/** Erros que vêm das funções do banco já estão em português; o resto vira mensagem amigável. */
export function erroDaCasa(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? ''
  if (/máximo de \d+ pessoas|Convite inválido|já participa|Só quem criou|Entre na sua conta|não tem uma casa/i.test(m)) return m
  if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Confira a internet.'
  return 'Não deu certo. Tente de novo.'
}

async function rpc<T>(cliente: SupabaseClient, nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente.rpc(nome, args)
  if (error) throw new Error(erroDaCasa(error))
  return data as T
}

export const minhaCasa = (c: SupabaseClient) => rpc<string | null>(c, 'minha_casa')
export const criarCasaNaNuvem = (c: SupabaseClient, nome: string, meuNome: string) => rpc<string>(c, 'criar_casa', { p_nome: nome, p_meu_nome: meuNome })
export const criarConvite = (c: SupabaseClient) => rpc<string>(c, 'criar_convite')
export const entrarComConvite = (c: SupabaseClient, codigo: string, meuNome: string) =>
  rpc<string>(c, 'entrar_na_casa', { p_codigo: codigo.trim().toUpperCase(), p_meu_nome: meuNome })
export const removerMembro = (c: SupabaseClient, userId: string) => rpc<void>(c, 'remover_membro', { p_user: userId })
export const mudarMeuNome = (c: SupabaseClient, nome: string) => rpc<void>(c, 'mudar_meu_nome', { p_nome: nome })

export async function dadosDaCasa(c: SupabaseClient): Promise<{ casa: CasaRemota | null; membros: Membro[] }> {
  const [casa, membros] = await Promise.all([
    c.from('casas').select('id,nome,max_membros,plano').maybeSingle(),
    c.from('membros').select('user_id,nome,papel,entrou_em').order('entrou_em'),
  ])
  if (casa.error) throw new Error(erroDaCasa(casa.error))
  if (membros.error) throw new Error(erroDaCasa(membros.error))
  return { casa: casa.data as CasaRemota | null, membros: (membros.data ?? []) as Membro[] }
}

export async function renomearCasaNaNuvem(c: SupabaseClient, id: string, nome: string) {
  const { error } = await c.from('casas').update({ nome }).eq('id', id)
  if (error) throw new Error(erroDaCasa(error))
}
