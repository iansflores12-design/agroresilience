// Genera src/tema/colores.css con @material/material-color-utilities.
// Semilla verde, SchemeFidelity, contraste 0, claro y oscuro, mas los colores
// propios `agua` y `tierra` armonizados con la semilla (DISENO.md, seccion 2).
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Hct,
  MaterialDynamicColors,
  SchemeFidelity,
  argbFromHex,
  customColor,
  hexFromArgb,
} from '@material/material-color-utilities'

const SEMILLA = '#1E7B3C'
const COLORES_PROPIOS = [
  { name: 'agua', value: argbFromHex('#1976D2'), blend: true },
  { name: 'tierra', value: argbFromHex('#B5532A'), blend: true },
]

// [rol CSS, metodo de MaterialDynamicColors]
const ROLES = [
  ['primary', 'primary'],
  ['on-primary', 'onPrimary'],
  ['primary-container', 'primaryContainer'],
  ['on-primary-container', 'onPrimaryContainer'],
  ['secondary', 'secondary'],
  ['on-secondary', 'onSecondary'],
  ['secondary-container', 'secondaryContainer'],
  ['on-secondary-container', 'onSecondaryContainer'],
  ['tertiary', 'tertiary'],
  ['on-tertiary', 'onTertiary'],
  ['tertiary-container', 'tertiaryContainer'],
  ['on-tertiary-container', 'onTertiaryContainer'],
  ['error', 'error'],
  ['on-error', 'onError'],
  ['error-container', 'errorContainer'],
  ['on-error-container', 'onErrorContainer'],
  ['surface', 'surface'],
  ['surface-dim', 'surfaceDim'],
  ['surface-bright', 'surfaceBright'],
  ['surface-container-lowest', 'surfaceContainerLowest'],
  ['surface-container-low', 'surfaceContainerLow'],
  ['surface-container', 'surfaceContainer'],
  ['surface-container-high', 'surfaceContainerHigh'],
  ['surface-container-highest', 'surfaceContainerHighest'],
  ['on-surface', 'onSurface'],
  ['on-surface-variant', 'onSurfaceVariant'],
  ['outline', 'outline'],
  ['outline-variant', 'outlineVariant'],
  ['inverse-surface', 'inverseSurface'],
  ['inverse-on-surface', 'inverseOnSurface'],
  ['inverse-primary', 'inversePrimary'],
  ['scrim', 'scrim'],
  ['shadow', 'shadow'],
]

const fuente = argbFromHex(SEMILLA)
const dinamicos = new MaterialDynamicColors()
const propios = COLORES_PROPIOS.map((c) => customColor(fuente, c))

function bloque(oscuro) {
  const esquema = new SchemeFidelity(Hct.fromInt(fuente), oscuro, 0)
  const lineas = ROLES.map(
    ([css, metodo]) =>
      `  --md-sys-color-${css}: ${hexFromArgb(dinamicos[metodo]().getArgb(esquema))};`,
  )
  for (const grupo of propios) {
    const g = oscuro ? grupo.dark : grupo.light
    const n = grupo.color.name
    lineas.push(
      `  --agro-color-${n}: ${hexFromArgb(g.color)};`,
      `  --agro-color-on-${n}: ${hexFromArgb(g.onColor)};`,
      `  --agro-color-${n}-container: ${hexFromArgb(g.colorContainer)};`,
      `  --agro-color-on-${n}-container: ${hexFromArgb(g.onColorContainer)};`,
    )
  }
  return lineas.join('\n')
}

const css = `/* GENERADO, NO EDITAR. Fuente: scripts/generar_tema.mjs (npm run tema).
   Semilla ${SEMILLA}, SchemeFidelity, contraste 0. */

:root {
${bloque(false)}
}

@media (prefers-color-scheme: dark) {
  :root {
${bloque(true)
  .split('\n')
  .map((l) => '  ' + l)
  .join('\n')}
  }
}
`

const destino = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tema/colores.css')
writeFileSync(destino, css)
console.log(`Escrito ${destino}`)
