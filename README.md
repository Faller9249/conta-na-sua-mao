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
