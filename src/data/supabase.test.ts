import { describe, expect, it } from 'vitest'
import { loginAtivo, mensagemDeErro } from './supabase'

describe('login', () => {
  it('o login só liga quando as chaves do Supabase existem', () => {
    expect(loginAtivo).toBe(!!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY))
  })
  it('traduz os erros mais comuns', () => {
    expect(mensagemDeErro({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.')
    expect(mensagemDeErro({ code: 'email_not_confirmed' })).toMatch(/Confirme o e-mail/)
    expect(mensagemDeErro({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toMatch(/Cadastros fechados/)
    expect(mensagemDeErro({ message: 'Failed to fetch' })).toMatch(/Sem conexão/)
    expect(mensagemDeErro({ message: 'algo estranho' })).toBe('Não deu certo. Tente de novo.')
  })
})
