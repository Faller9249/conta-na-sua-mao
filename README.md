# Conta na sua Mão — app (Fase 1)

App web instalável (PWA) para o casal: lista de compras, carrinho com código de barras e preço, painel do mês e reserva.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra http://localhost:5173. Para testar como celular, use o modo de dispositivo do navegador.

## Testes e build

```bash
npm test        # regras (preço sugerido, etiqueta de balança, painel) e banco local
npm run build   # gera a versão final em dist/
```

## Como está organizado

| Pasta | O que tem |
| --- | --- |
| `src/domain` | Tipos e regras puras (dinheiro em centavos, preço sugerido, etiqueta de balança, painel do mês, reserva) |
| `src/data` | Banco local no celular (IndexedDB via Dexie), ações (lista, compra, gastos) e busca de produto no Open Food Facts |
| `src/paginas` | Telas: Criar casa, Início, Lista, Carrinho, Casa (Fase 2), Metas, Lançar gasto |
| `src/ui` | Componentes (menu inferior, barra, check) e o leitor de código de barras (ZXing) |

## Limites desta versão

- Os dados ficam **só no aparelho** onde o app foi aberto. Sincronizar os dois celulares exige o Supabase (próximo passo).
- A câmera só funciona em `localhost` ou em **https**. Para usar no celular, o app precisa estar publicado com https.
- O formato da etiqueta de balança (`2 CCCC X VVVVVV D`) precisa ser conferido com uma etiqueta real do Rissul.
- Conferência pela nota fiscal, histórico de preços entre mercados, planta da casa e receitas são da Fase 2.

## Login (Supabase)

O app pede login quando recebe a URL e a chave pública de um projeto Supabase. Sem elas, abre direto (modo local).

1. Crie uma conta gratuita em https://supabase.com e um projeto (região São Paulo).
2. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.
3. Em **Authentication → URL Configuration**:
   - **Site URL:** `https://faller9249.github.io/conta-na-sua-mao/`
   - **Redirect URLs:** adicione `https://faller9249.github.io/conta-na-sua-mao/**` e `http://localhost:5173/**`
4. No GitHub, em **Settings → Secrets and variables → Actions → Variables**, crie:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = chave anon/publishable
5. Rode de novo o workflow **Publicar no GitHub Pages** (aba Actions → Run workflow) ou envie um commit.
6. Cada pessoa da casa cria a sua conta no app. Depois, em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up** para ninguém mais conseguir se cadastrar.

Para rodar local com login, crie `app/.env.local` (já ignorado pelo git):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

A chave anon/publishable é pública por natureza. Nunca coloque no app a chave **service_role / secret**.
