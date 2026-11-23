// Supabase Edge Function: busca a página pública da NFC-e na SVRS (RS) para o app.
// O navegador não pode ler essa página direto (a SEFAZ não libera CORS), então o app
// pede por aqui. Só aceita chaves de NFC-e e só fala com o portal da SVRS: não é um proxy aberto.
// Publicar: supabase functions deploy nota-sefaz

const PORTAL = 'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce'
const ORIGENS = ['https://faller9249.github.io', 'http://localhost:5173']

function cors(origem: string | null) {
  return {
    'Access-Control-Allow-Origin': origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const h = cors(req.headers.get('origin'))
  if (req.method === 'OPTIONS') return new Response(null, { headers: h })
  const p = new URL(req.url).searchParams.get('p') ?? ''
  // p = CHAVE(44 dígitos)|versão|ambiente[|...]
  if (!/^\d{44}\|\d\|\d(\|[\w|.:-]*)?$/.test(p) || p.slice(20, 22) !== '65') {
    return new Response('Nota inválida', { status: 400, headers: h })
  }
  try {
    const r = await fetch(`${PORTAL}?p=${encodeURIComponent(p).replace(/%7C/g, '|')}`, { headers: { 'User-Agent': 'conta-na-sua-mao' } })
    const html = await r.text()
    return new Response(html, { status: r.status, headers: { ...h, 'Content-Type': 'text/html; charset=utf-8' } })
  } catch {
    return new Response('SEFAZ fora do ar', { status: 502, headers: h })
  }
})
