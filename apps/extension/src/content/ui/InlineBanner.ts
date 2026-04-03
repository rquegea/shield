// InlineBanner — banner de aviso + bloqueo del botón de submit
// Usa Shadow DOM para no interferir con los estilos de la plataforma
//
// Colores dinámicos por categoría de detección

import type { ScanResult, Detection } from '@shieldai/detectors'
import {
  getPrimaryTheme,
  getThemeForCategory,
  shieldSvg,
  DETECTION_LABELS,
  type CategoryTheme,
} from './categoryTheme'

// ─── Estilos del banner (Shadow DOM) ───

const BANNER_STYLES = /* css */ `
  :host {
    all: initial;
    position: fixed;
    top: 16px;
    right: 16px;
    width: 360px;
    max-width: 360px;
    z-index: 2147483646;
    font-family: 'Helvetica Neue', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    line-height: 1.5;
  }

  @keyframes gradientShift {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes slideDownIn {
    from { opacity: 0; transform: translateY(-12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes slideUpOut {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-12px); }
  }

  @keyframes hlFlash {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .banner {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-radius: 20px;
    background-size: 200% 200%;
    animation: slideDownIn 0.2s ease-out, gradientShift 4s ease-in-out infinite;
    border: 1px solid rgba(200, 200, 220, 0.4);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
    width: 360px;
    max-width: 360px;
    box-sizing: border-box;
    overflow: visible;
  }

  .banner.removing {
    animation: slideUpOut 0.15s ease-in forwards;
  }

  /* Header: single row — icon + title + count */
  .header {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }

  .icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .title {
    font-weight: 700;
    font-size: 13px;
    color: #1a1a2e;
    white-space: nowrap;
  }

  .count {
    font-weight: 500;
    font-size: 12px;
    color: rgba(26, 26, 46, 0.6);
    white-space: nowrap;
    margin-left: auto;
  }

  /* Detection cards stacked vertically */
  .det-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    box-sizing: border-box;
  }

  .det-preview {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    padding: 6px 10px;
    background: #ffffff;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: #1a1a2e;
    font-family: inherit;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .det-preview .hl {
    text-underline-offset: 3px;
    text-decoration-thickness: 2px;
    font-weight: 600;
    color: #1a1a2e;
    cursor: default;
  }

  .det-preview .hl.flash {
    animation: hlFlash 0.3s ease-in-out 3;
  }

  .det-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding-left: 4px;
    font-size: 11px;
    color: rgba(26, 26, 46, 0.65);
    font-weight: 500;
  }

  .det-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tooltip-fixed {
    position: fixed;
    background: #0f172a;
    color: #e2e8f0;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-family: inherit;
    white-space: nowrap;
    z-index: 2147483647;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    pointer-events: none;
    transform: translateX(-50%);
  }

  /* Actions row */
  .actions {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
    width: 100%;
    box-sizing: border-box;
    padding-top: 2px;
  }

  .btn-accept {
    padding: 5px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }

  .btn-ok {
    padding: 5px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    background: transparent;
    color: #64748b;
    border: 1px solid rgba(100, 116, 139, 0.3);
    white-space: nowrap;
    transition: background 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }

  .btn-ok:hover {
    background: rgba(100, 116, 139, 0.08);
  }

  @media (max-width: 480px) {
    :host {
      left: 12px;
      right: 12px;
      width: auto;
      max-width: none;
    }
    .banner {
      width: auto;
      max-width: none;
    }
  }
`

// ─── CSS inyectado en la página host para deshabilitar botones del form ───

const BLOCK_STYLE_ID = 'shieldai-block-buttons'

function getFormContainer(input: HTMLElement): HTMLElement | null {
  const form = input.closest('form')
  if (form) return form

  let container = input.parentElement
  for (let i = 0; i < 10; i++) {
    if (!container) break
    const hasButton = container.querySelector('button') || container.querySelector('[role="button"]')
    if (hasButton) return container
    container = container.parentElement
  }

  return input.parentElement
}

function injectBlockStyle(input: HTMLElement): void {
  if (document.getElementById(BLOCK_STYLE_ID)) return

  const form = getFormContainer(input)
  if (!form) return

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

  document.querySelectorAll('[data-shieldai-blocked]').forEach((el) => {
    el.removeAttribute('data-shieldai-blocked')
  })
}

// ─── Preview contextual con highlights ───

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildSingleDetPreview(text: string, det: Detection, theme: CategoryTheme): string {
  const pad = 20
  const start = Math.max(0, det.start - pad)
  const end = Math.min(text.length, det.end + pad)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''

  const before = escapeHtml(text.slice(start, det.start))
  const match = escapeHtml(text.slice(det.start, det.end))
  const after = escapeHtml(text.slice(det.end, end))
  const label = DETECTION_LABELS[det.type] ?? det.type

  return `${prefix}${before}<span class="hl" style="text-decoration:underline;text-decoration-color:${theme.hlUnderline}" data-type="${det.type}" data-label="${label} detectado">${match}</span>${after}${suffix}`
}

// ─── Comparación de detecciones ───

function detectionsEqual(a: Detection[], b: Detection[]): boolean {
  if (a.length !== b.length) return false
  // Comparar por tipo + valor (ignorar posición en el texto)
  const aSet = new Set(a.map((d) => `${d.type}:${d.value}`))
  const bSet = new Set(b.map((d) => `${d.type}:${d.value}`))
  if (aSet.size !== bSet.size) return false
  for (const item of aSet) {
    if (!bSet.has(item)) return false
  }
  return true
}

// ─── Estado del banner ───

let bannerHost: HTMLElement | null = null
let bannerShadow: ShadowRoot | null = null
let currentOnAccept: (() => void) | null = null
let lastBannerResult: ScanResult | null = null

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

  document.body.appendChild(bannerHost)

  return bannerShadow
}

// ─── Construcción del banner ───

function buildBannerElement(
  result: ScanResult,
  sourceText: string | undefined,
  onAcceptRisk: (() => void) | undefined,
): HTMLDivElement {
  const banner = document.createElement('div')
  const theme = getPrimaryTheme(result.detections)
  banner.className = 'banner'
  banner.style.background = theme.gradient
  banner.style.backgroundSize = '200% 200%'

  const totalCount = result.detections.length

  // Header row: icon + title + count
  const header = document.createElement('div')
  header.className = 'header'
  header.innerHTML = `<span class="icon">${shieldSvg(theme.iconBg, theme.iconColor)}</span><span class="title">${theme.label}</span><span class="count">${totalCount} dato${totalCount !== 1 ? 's' : ''} detectado${totalCount !== 1 ? 's' : ''}</span>`
  banner.appendChild(header)

  // Detection cards — one per detection, grouped by dedup key, stacked vertically
  if (sourceText) {
    const seen = new Set<string>()
    let activeTooltip: HTMLElement | null = null

    for (const det of result.detections) {
      const dedup = `${det.type}:${det.start}`
      if (seen.has(dedup)) continue
      seen.add(dedup)

      const detTheme = getThemeForCategory(det.category)

      const card = document.createElement('div')
      card.className = 'det-card'

      // Preview line
      const preview = document.createElement('div')
      preview.className = 'det-preview'
      preview.innerHTML = buildSingleDetPreview(sourceText, det, detTheme)
      card.appendChild(preview)

      // Label line: dot + category + type
      const label = document.createElement('div')
      label.className = 'det-label'
      const typeLabel = DETECTION_LABELS[det.type] ?? det.type
      const labelText = detTheme.label === typeLabel ? detTheme.label : `${detTheme.label} &middot; ${typeLabel}`
      label.innerHTML = `<span class="det-dot" style="background:${detTheme.dotColor}"></span>${labelText}`
      card.appendChild(label)

      banner.appendChild(card)

      // JS tooltips
      preview.querySelectorAll('.hl[data-label]').forEach((hl) => {
        hl.addEventListener('mouseenter', () => {
          const rect = (hl as HTMLElement).getBoundingClientRect()
          const tip = document.createElement('div')
          tip.className = 'tooltip-fixed'
          tip.textContent = (hl as HTMLElement).dataset.label ?? ''
          tip.style.left = `${rect.left + rect.width / 2}px`
          tip.style.top = `${rect.top - 6}px`
          tip.style.transform = 'translate(-50%, -100%)'
          activeTooltip = tip
          banner.getRootNode()?.appendChild(tip)
        })
        hl.addEventListener('mouseleave', () => {
          if (activeTooltip) {
            activeTooltip.remove()
            activeTooltip = null
          }
        })
      })
    }
  }

  // Action button — color dinámico según tema principal
  if (onAcceptRisk) {
    const actions = document.createElement('div')
    actions.className = 'actions'
    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'btn-accept'
    acceptBtn.textContent = 'Enviar de todos modos'
    acceptBtn.style.color = theme.btnColor
    acceptBtn.style.border = `1px solid ${theme.btnBorder}`
    currentOnAccept = onAcceptRisk
    acceptBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (currentOnAccept) currentOnAccept()
    })
    acceptBtn.addEventListener('mouseenter', () => {
      acceptBtn.style.background = theme.btnHoverBg
    })
    acceptBtn.addEventListener('mouseleave', () => {
      acceptBtn.style.background = 'transparent'
    })
    actions.appendChild(acceptBtn)
    banner.appendChild(actions)
  } else {
    currentOnAccept = null
  }

  return banner
}

// ─── API pública ───

export interface BannerCallbacks {
  onAcceptRisk?: () => void
  mode?: 'block' | 'warn'
  sourceText?: string
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

  // Optimización: si las detecciones son iguales al último resultado, no tocar el DOM
  if (lastBannerResult && detectionsEqual(lastBannerResult.detections, result.detections)) {
    console.log('[Guripa AI] Detecciones sin cambios, skipping banner update')
    return
  }
  lastBannerResult = result

  const shadow = ensureBannerHost(anchorElement)

  if (callbacks.mode !== 'warn') {
    injectBlockStyle(anchorElement)
  }

  const existing = shadow.querySelector('.banner')
  if (existing) existing.remove()

  const banner = buildBannerElement(result, callbacks.sourceText, callbacks.onAcceptRisk)
  shadow.appendChild(banner)
}

export function removeBanner(): void {
  removeBlockStyle()
  currentOnAccept = null
  lastBannerResult = null
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

export function updateInfoBanner(
  result: ScanResult,
  anchorElement: HTMLElement,
  sourceText?: string,
): void {
  if (!result.hasMatches) {
    removeBanner()
    return
  }

  // Optimización: si las detecciones son iguales al último resultado, no tocar el DOM
  if (lastBannerResult && detectionsEqual(lastBannerResult.detections, result.detections)) {
    console.log('[Guripa AI] Detecciones sin cambios, skipping info banner update')
    return
  }
  lastBannerResult = result

  const shadow = ensureBannerHost(anchorElement)

  removeBlockStyle()

  const existing = shadow.querySelector('.banner')
  if (existing) existing.remove()

  // Info banner uses same pill design, just OK button instead of accept
  const banner = buildBannerElement(result, sourceText, undefined)

  // Add OK button
  const actions = document.createElement('div')
  actions.className = 'actions'
  const okBtn = document.createElement('button')
  okBtn.className = 'btn-ok'
  okBtn.textContent = 'OK'
  okBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    removeBanner()
  })
  actions.appendChild(okBtn)
  banner.appendChild(actions)

  shadow.appendChild(banner)
}

export function unblockButtons(): void {
  removeBlockStyle()
}
