import type { User } from '@supabase/supabase-js'
import { db } from './db'
import { supabase } from './supabase'
import { Sincronizador } from './sync'

/** Uma só sincronização rodando no app. Null no modo sem login. */
export const sincronizador = supabase ? new Sincronizador(db, supabase) : null

export function nomeDoUsuario(user?: User | null): string {
  const nome = (user?.user_metadata as { nome?: string } | undefined)?.nome?.trim()
  return nome || user?.email?.split('@')[0] || ''
}
