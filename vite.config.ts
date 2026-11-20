import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // No GitHub Pages o site fica em /<nome-do-repositório>/ (definido pelo workflow).
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Conta na sua Mão',
        short_name: 'Conta na Mão',
        description: 'Lista de compras, carrinho com código de barras e finanças do casal.',
        lang: 'pt-BR',
        theme_color: '#1E8E5A',
        background_color: '#F5F7F5',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
})
