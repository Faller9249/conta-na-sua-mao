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

## Conferência pela nota fiscal (NFC-e)

O QR Code do cupom traz o link da consulta na SEFAZ (no RS, `dfe-portal.svrs.rs.gov.br`). O app:

- mostra a nota **dentro do app** ("Ver a nota aqui"), sem abrir o navegador;
- lê os itens da nota e cruza com o carrinho: esquecidos, não cobrados, preço e quantidade diferentes. "Usar os valores da nota" corrige a compra, grava os preços como `nota` e aprende o código interno do mercado para as próximas conferências.

O navegador não pode ler a página da SEFAZ direto (ela não libera CORS), então a leitura dos itens passa pela função `supabase/functions/nota-sefaz`. Ela só aceita chaves de NFC-e e só consulta o portal da SVRS. Para ligar:

```bash
npx supabase login
npx supabase link --project-ref <id-do-projeto>
npx supabase functions deploy nota-sefaz
```

Sem o Supabase configurado, o app continua mostrando a nota dentro dele, só sem a conferência automática.
