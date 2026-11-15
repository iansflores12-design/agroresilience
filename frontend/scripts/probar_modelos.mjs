// Prueba que modelos de Gemini responden con la clave del proyecto, con y sin busqueda de Google.
// No muestra la clave. Uso (desde frontend/):
//   NODE_EXTRA_CA_CERTS=/usr/local/etc/ca-certificates/cert.pem node --env-file=.env.local scripts/probar_modelos.mjs [modelo ...]
// Sin argumentos lista los modelos disponibles y prueba los candidatos de cuota gratuita.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const clave = process.env.GEMINI_API_KEY?.trim()
if (!clave) {
  console.error('Falta GEMINI_API_KEY')
  process.exit(1)
}
const cabeceras = { 'Content-Type': 'application/json', 'x-goog-api-key': clave }

async function listar() {
  const nombres = []
  let pagina = ''
  do {
    const r = await fetch(`${BASE}?pageSize=200${pagina ? `&pageToken=${pagina}` : ''}`, { headers: cabeceras })
    if (!r.ok) throw new Error(`No se pudo listar: ${r.status}`)
    const d = await r.json()
    for (const m of d.models ?? []) {
      if ((m.supportedGenerationMethods ?? []).includes('generateContent')) nombres.push(m.name.replace('models/', ''))
    }
    pagina = d.nextPageToken ?? ''
  } while (pagina)
  return nombres
}

async function probar(modelo, busqueda) {
  const cuerpo = {
    contents: [{ role: 'user', parts: [{ text: busqueda ? 'Precio actual del quintal de maíz blanco en Honduras, en una línea.' : 'Responde solo: listo' }] }],
    generationConfig: { maxOutputTokens: 256, temperature: 0 },
    ...(busqueda ? { tools: [{ google_search: {} }] } : {}),
  }
  const inicio = Date.now()
  try {
    const r = await fetch(`${BASE}/${modelo}:generateContent`, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(40_000) })
    const d = await r.json().catch(() => null)
    const ms = Date.now() - inicio
    if (!r.ok) return `${r.status} ${(d?.error?.message ?? '').replace(/\s+/g, ' ').slice(0, 90)}`
    const c = d?.candidates?.[0]
    const texto = (c?.content?.parts ?? []).map((p) => p.text ?? '').join('').replace(/\s+/g, ' ').slice(0, 70)
    const fuentes = c?.groundingMetadata?.groundingChunks?.length ?? 0
    return `OK ${ms} ms${busqueda ? `, ${fuentes} fuentes` : ''}: ${texto}`
  } catch (e) {
    return `ERROR ${String(e).slice(0, 80)}`
  }
}

const pedidos = process.argv.slice(2)
let candidatos = pedidos
if (!pedidos.length) {
  const todos = await listar()
  console.log('Modelos con generateContent:\n  ' + todos.join('\n  '))
  candidatos = todos.filter((m) => /^gemini-[\d.]+-flash(-lite)?$/.test(m) || /^gemma-[\d.]+/.test(m)).slice(0, 14)
}
for (const m of candidatos) {
  console.log(`\n${m}`)
  console.log('  texto:    ' + (await probar(m, false)))
  if (m.startsWith('gemini')) console.log('  busqueda: ' + (await probar(m, true)))
}
