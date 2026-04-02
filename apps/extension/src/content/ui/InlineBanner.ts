// InlineBanner — banner de aviso + bloqueo del botón de submit
// Usa Shadow DOM para no interferir con los estilos de la plataforma
//
// Cuando hay datos sensibles:
//   1. Inyecta CSS que deshabilita TODOS los botones dentro del form
//      (opacity 0.5, pointer-events: none)
//   2. Muestra un banner con el resumen + botón "Enviar de todos modos"
//   3. Si el usuario acepta, rehabilita los botones y hace click en submit
//
// Cuando el texto queda limpio: quita el banner y rehabilita los botones.

import type { ScanResult, Detection, Severity } from '@shieldai/detectors'

// ─── Colores por nivel de riesgo ───

const RISK_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  critical: { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#dc2626', icon: '#ef4444' },
  high:     { bg: 'rgba(249,115,22,0.08)', border: '#f97316', text: '#ea580c', icon: '#f97316' },
  medium:   { bg: 'rgba(234,179,8,0.08)',  border: '#eab308', text: '#ca8a04', icon: '#eab308' },
  low:      { bg: 'rgba(34,197,94,0.08)',  border: '#22c55e', text: '#16a34a', icon: '#22c55e' },
  info:     { bg: 'rgba(100,116,139,0.08)', border: '#64748b', text: '#475569', icon: '#64748b' },
}

// ─── Colores de highlight por severity ───

const SEVERITY_HIGHLIGHT: Record<string, { bg: string; border: string }> = {
  block: { bg: 'rgba(220, 38, 38, 0.15)', border: '#DC2626' },
  warn:  { bg: 'rgba(245, 158, 11, 0.15)', border: '#F59E0B' },
  info:  { bg: 'rgba(59, 130, 246, 0.12)', border: '#3B82F6' },
}

// ─── Nombres legibles por tipo de detección ───

const DETECTION_LABELS: Record<string, string> = {
  DNI: 'DNI',
  NIE: 'NIE',
  CIF: 'CIF',
  IBAN: 'IBAN',
  CREDIT_CARD: 'Tarjeta de crédito',
  SSN_SPAIN: 'Nº Seguridad Social',
  PHONE_SPAIN: 'Teléfono',
  EMAIL: 'Email personal',
  PASSPORT_SPAIN: 'Pasaporte',
  PLATE_SPAIN: 'Matrícula',
  NIF_PORTUGAL: 'NIF Portugal',
  CODICE_FISCALE: 'Codice Fiscale',
  BIRTHDATE: 'Fecha de nacimiento',
  HEALTH_DATA: 'Dato de salud',
  SALARY_DATA: 'Dato salarial',
  POLITICAL_RELIGIOUS: 'Dato protegido Art. 9',
  CRIMINAL_DATA: 'Dato penal',
  API_KEY: 'API key',
  CONNECTION_STRING: 'Connection string',
  JWT_TOKEN: 'Token JWT',
  ENV_SECRET: 'Secret en variable de entorno',
  PRIVATE_KEY: 'Clave privada',
}

// ─── SVG del escudo (template) ───

function shieldSvg(color: string): string {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1L2 3.5v4.25C2 11.85 4.7 15 8 16c3.3-1 6-4.15 6-8.25V3.5L8 1z" fill="${color}" opacity="0.2" stroke="${color}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M5.5 8.5L7 10l3.5-3.5" stroke="${color}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
}

// ─── Estilos del banner flotante (Shadow DOM) ───

const BANNER_STYLES = /* css */ `
  :host {
    all: initial;
    position: fixed;
    top: 12px;
    right: 12px;
    max-width: 420px;
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.4;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-size: 13px;
    border-left-width: 4px;
    border-left-style: solid;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    animation: slideDownIn 0.3s ease-out;
    flex-wrap: wrap;
  }

  @keyframes slideDownIn {
    from {
      opacity: 0;
      transform: translateY(-12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideUpOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to   {
      opacity: 0;
      transform: translateY(-12px);
    }
  }

  .banner.removing {
    animation: slideUpOut 0.2s ease-in forwards;
  }

  .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .content {
    flex: 1;
    min-width: 0;
  }

  .text {
    font-weight: 600;
    font-size: 12px;
  }

  .details {
    font-weight: 400;
    opacity: 0.85;
    font-size: 12px;
  }

  .btn-accept {
    margin-left: auto;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
    border-width: 1px;
    border-style: solid;
    line-height: 1.4;
  }

  .btn-accept:hover {
    background: rgba(239,68,68,0.1);
  }

  .btn-ok {
    margin-left: auto;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
    border-width: 1px;
    border-style: solid;
    line-height: 1.4;
  }

  .btn-ok:hover {
    background: rgba(100,116,139,0.1);
  }

  .preview {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    background: #1e293b;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.6;
    color: #e2e8f0;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    word-break: break-word;
    max-height: 80px;
    overflow-y: auto;
  }

  .preview .hl {
    padding: 1px 3px;
    border-radius: 3px;
    border-bottom-width: 2px;
    border-bottom-style: solid;
    font-weight: 600;
    color: #ffffff;
    cursor: default;
    position: relative;
  }

  .preview .hl .tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #e2e8f0;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    white-space: nowrap;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    pointer-events: none;
  }

  .preview .hl:hover .tooltip {
    display: block;
  }

  @keyframes hlFlash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .preview .hl.flash {
    animation: hlFlash 0.3s ease-in-out 3;
  }

  .detail-type {
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .detail-type:hover {
    opacity: 1;
  }

  /* Mobile: stack vertically */
  @media (max-width: 480px) {
    :host {
      left: 12px;
      right: 12px;
      max-width: none;
    }
    .banner {
      flex-direction: column;
      align-items: flex-start;
    }
    .btn-accept {
      margin-left: 26px;
      margin-top: 4px;
    }
  }
`

// ─── CSS inyectado en la página host para deshabilitar botones del form ───

const BLOCK_STYLE_ID = 'shieldai-block-buttons'

function getFormContainer(input: HTMLElement): HTMLElement | null {
  // Primero intentar con <form>
  const form = input.closest('form')
  if (form) return form

  // Si no hay form, subir hasta 10 niveles buscando un contenedor que tenga button o [role="button"]
  let container = input.parentElement
  for (let i = 0; i < 10; i++) {
    if (!container) break
    const hasButton = container.querySelector('button') || container.querySelector('[role="button"]')
    if (hasButton) return container
    container = container.parentElement
  }

  // Fallback: parent del input
  return input.parentElement
}

function injectBlockStyle(input: HTMLElement): void {
  if (document.getElementById(BLOCK_STYLE_ID)) return

  // Construir un selector CSS que apunte a los botones dentro del form
  const form = getFormContainer(input)
  if (!form) return

  // Usamos un atributo marcador en el form para targetear con CSS
  form.setAttribute('data-shieldai-blocked', '1')

  const style = document.createElement('style')
  style.id = BLOCK_STYLE_ID
  style.textContent = `
    [data-shieldai-blocked="1"] button,
    [data-shieldai-blocked="1"] [role="button"],
    [data-shieldai-blocked="1"] [jsaction*="click"] {
      opacity: 0.4 !important;
      pointer-events: none !important;
      filter: grayscale(0.5) !important;
      transition: opacity 0.2s, filter 0.2s !important;
    }
  `
  document.head.appendChild(style)
}

function removeBlockStyle(): void {
  const style = document.getElementById(BLOCK_STYLE_ID)
  if (style) style.remove()

  // Limpiar el atributo marcador de todos los forms
  document.querySelectorAll('[data-shieldai-blocked]').forEach((el) => {
    el.removeAttribute('data-shieldai-blocked')
  })
}

// ─── Preview contextual con highlights ───

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildPreviewHtml(text: string, detections: Detection[]): string {
  if (detections.length === 0 || !text) return ''

  // Ordenar detecciones por posición
  const sorted = [...detections].sort((a, b) => a.start - b.start)

  // Extraer un fragmento de contexto alrededor de las detecciones
  // Tomar desde 20 chars antes de la primera detección hasta 20 chars después de la última
  const contextPad = 20
  const firstStart = Math.max(0, sorted[0].start - contextPad)
  const lastEnd = Math.min(text.length, sorted[sorted.length - 1].end + contextPad)

  const fragment = text.slice(firstStart, lastEnd)
  const prefix = firstStart > 0 ? '...' : ''
  const suffix = lastEnd < text.length ? '...' : ''

  // Construir HTML con highlights
  let html = ''
  let cursor = firstStart

  for (const det of sorted) {
    if (det.start < cursor) continue // solapamiento

    // Texto antes del highlight
    if (det.start > cursor) {
      html += escapeHtml(text.slice(cursor, det.start))
    }

    // El highlight
    const hl = SEVERITY_HIGHLIGHT[det.severity] ?? SEVERITY_HIGHLIGHT.info
    const label = DETECTION_LABELS[det.type] ?? det.type
    const detectedText = text.slice(det.start, det.end)
    html += `<span class="hl" data-type="${det.type}" style="background: ${hl.bg}; border-bottom-color: ${hl.border}"><span class="tooltip">${label} detectado</span>${escapeHtml(detectedText)}</span>`

    cursor = det.end
  }

  // Texto después del último highlight
  if (cursor < lastEnd) {
    html += escapeHtml(text.slice(cursor, lastEnd))
  }

  return `${prefix}${html}${suffix}`
}

// ─── Estado del banner ───

let bannerHost: HTMLElement | null = null
let bannerShadow: ShadowRoot | null = null
let currentOnAccept: (() => void) | null = null

function ensureBannerHost(_anchorElement: HTMLElement): ShadowRoot {
  if (bannerHost && bannerShadow && document.body.contains(bannerHost)) {
    return bannerShadow
  }

  if (bannerHost) bannerHost.remove()

  bannerHost = document.createElement('shieldai-banner')
  bannerShadow = bannerHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = BANNER_STYLES
  bannerShadow.appendChild(style)

  // Insertar en document.body como toast flotante
  document.body.appendChild(bannerHost)

  return bannerShadow
}

// ─── API pública ───

export interface BannerCallbacks {
  onAcceptRisk?: () => void  // si es undefined o null, no se muestra el botón (modo block)
  mode?: 'block' | 'warn'   // warn = banner naranja sin bloquear botones
  sourceText?: string        // texto original para preview contextual
}

export function updateBanner(
  result: ScanResult,
  anchorElement: HTMLElement,
  callbacks: BannerCallbacks,
): void {
  if (!result.hasMatches) {
    removeBanner()
    return
  }

  const shadow = ensureBannerHost(anchorElement)

  // Deshabilitar botones del form (solo si no es modo warn de severity)
  if (callbacks.mode !== 'warn') {
    injectBlockStyle(anchorElement)
  }

  // Limpiar contenido previo (mantener <style>)
  const existing = shadow.querySelector('.banner')
  if (existing) existing.remove()

  const riskLevel = result.riskLevel as string
  const colors = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium

  const banner = document.createElement('div')
  banner.className = `banner risk-${riskLevel}`
  banner.style.cssText = `
    background: ${colors.bg};
    border-left-color: ${colors.border};
    border-top: 1px solid ${colors.bg};
    border-right: 1px solid ${colors.bg};
    border-bottom: 1px solid ${colors.bg};
    color: ${colors.text};
  `

  // Resumen: "2 DNI, 1 IBAN" — cada tipo es clickeable
  const counts = new Map<string, number>()
  for (const d of result.detections) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  }

  banner.innerHTML = `
    <span class="icon">${shieldSvg(colors.icon)}</span>
    <span class="content">
      <span class="text">Guripa AI detectó: </span>
      <span class="details"></span>
    </span>
  `

  // Crear spans clickeables para cada tipo
  const detailsSpan = banner.querySelector('.details')!
  const typeEntries = Array.from(counts.entries())
  typeEntries.forEach(([type, count], i) => {
    const typeSpan = document.createElement('span')
    typeSpan.className = 'detail-type'
    typeSpan.textContent = `${count} ${type}`
    typeSpan.addEventListener('click', (e) => {
      e.stopPropagation()
      // Flash highlights of this type in preview
      const highlights = banner.parentNode?.querySelectorAll(`.hl[data-type="${type}"]`)
      highlights?.forEach((hl) => {
        hl.classList.remove('flash')
        void (hl as HTMLElement).offsetWidth // force reflow
        hl.classList.add('flash')
      })
    })
    detailsSpan.appendChild(typeSpan)
    if (i < typeEntries.length - 1) {
      detailsSpan.appendChild(document.createTextNode(', '))
    }
  })

  // Preview contextual con highlights
  if (callbacks.sourceText) {
    const previewHtml = buildPreviewHtml(callbacks.sourceText, result.detections)
    if (previewHtml) {
      const previewDiv = document.createElement('div')
      previewDiv.className = 'preview'
      previewDiv.innerHTML = previewHtml
      banner.appendChild(previewDiv)
    }
  }

  // Botón "Enviar de todos modos" — solo si hay callback (modo warn)
  if (callbacks.onAcceptRisk) {
    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'btn-accept'
    acceptBtn.textContent = 'Enviar de todos modos'
    acceptBtn.style.cssText = `
      color: ${colors.text};
      border-color: ${colors.border};
    `
    banner.appendChild(acceptBtn)

    currentOnAccept = callbacks.onAcceptRisk
    acceptBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentOnAccept) currentOnAccept()
    })
  } else {
    currentOnAccept = null
  }

  shadow.appendChild(banner)
}

export function removeBanner(): void {
  removeBlockStyle()
  currentOnAccept = null
  if (bannerHost && bannerShadow) {
    const banner = bannerShadow.querySelector('.banner')
    if (banner) {
      banner.classList.add('removing')
      setTimeout(() => {
        if (bannerHost) {
          bannerHost.remove()
          bannerHost = null
          bannerShadow = null
        }
      }, 150)
    } else {
      bannerHost.remove()
      bannerHost = null
      bannerShadow = null
    }
  }
}

// Banner informativo (severity info) — azul/gris, solo OK para cerrar
export function updateInfoBanner(
  result: ScanResult,
  anchorElement: HTMLElement,
  sourceText?: string,
): void {
  if (!result.hasMatches) {
    removeBanner()
    return
  }

  const shadow = ensureBannerHost(anchorElement)

  // NO deshabilitar botones del form
  removeBlockStyle()

  // Limpiar contenido previo (mantener <style>)
  const existing = shadow.querySelector('.banner')
  if (existing) existing.remove()

  const colors = RISK_COLORS.info

  const banner = document.createElement('div')
  banner.className = 'banner risk-info'
  banner.style.cssText = `
    background: ${colors.bg};
    border-left-color: ${colors.border};
    border-top: 1px solid ${colors.bg};
    border-right: 1px solid ${colors.bg};
    border-bottom: 1px solid ${colors.bg};
    color: ${colors.text};
  `

  // Resumen
  const counts = new Map<string, number>()
  for (const d of result.detections) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [type, count] of counts) {
    parts.push(`${count} ${type}`)
  }

  banner.innerHTML = `
    <span class="icon">${shieldSvg(colors.icon)}</span>
    <span class="content">
      <span class="text">Guripa AI: </span>
      <span class="details">${parts.join(', ')}</span>
    </span>
  `

  // Preview contextual con highlights
  if (sourceText) {
    const previewHtml = buildPreviewHtml(sourceText, result.detections)
    if (previewHtml) {
      const previewDiv = document.createElement('div')
      previewDiv.className = 'preview'
      previewDiv.innerHTML = previewHtml
      banner.appendChild(previewDiv)
    }
  }

  // Botón OK para cerrar
  const okBtn = document.createElement('button')
  okBtn.className = 'btn-ok'
  okBtn.textContent = 'OK'
  okBtn.style.cssText = `
    color: ${colors.text};
    border-color: ${colors.border};
  `
  okBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeBanner()
  })
  banner.appendChild(okBtn)

  shadow.appendChild(banner)
}

// Re-habilitar botones temporalmente (para el re-disparo del submit)
export function unblockButtons(): void {
  removeBlockStyle()
}
