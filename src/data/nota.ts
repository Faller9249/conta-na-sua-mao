import { lerPaginaNota, type NotaLida } from '../domain/nota'
import { supabase } from './supabase'

/** A busca automática da nota passa pela função "nota-sefaz" do Supabase (a SEFAZ não deixa o navegador ler direto). */
export const conferenciaAutomatica = supabase !== null

/** Parâmetro "p" do link do QR Code (CHAVE|versão|ambiente...). */
export function parametroDaNota(url: string): string | null {
  try {
    const p = new URL(url).searchParams.get('p')
    return p && /^\d{44}\|/.test(p) ? p : null
  } catch {
    return null
  }
}

/** Busca e lê os itens da nota, sem sair do app. */
export async function buscarNotaNaSefaz(url: string): Promise<NotaLida> {
  if (!supabase) throw new Error('A conferência automática liga quando o login (Supabase) estiver configurado.')
  const p = parametroDaNota(url)
  if (!p) throw new Error('Este QR Code não traz o link de consulta. Leia o QR Code impresso no cupom.')
  const { data, error } = await supabase.functions.invoke<string>(`nota-sefaz?p=${encodeURIComponent(p)}`, { method: 'GET' })
  if (error || typeof data !== 'string') throw new Error('Não consegui buscar a nota na SEFAZ agora. Tente de novo em alguns minutos.')
  const nota = lerPaginaNota(data)
  if (!nota) throw new Error('A SEFAZ não devolveu os itens desta nota. Ela pode ainda não ter sido autorizada: tente mais tarde.')
  return nota
}
