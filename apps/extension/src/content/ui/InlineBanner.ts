// InlineBanner — banner de aviso que se inyecta debajo del textarea
// Usa Shadow DOM para no interferir con los estilos de la plataforma
// Se actualiza en tiempo real mientras el usuario escribe

import type { ScanResult } from '@shieldai/detectors'

const BANNER_STYLES = /* css */ `
  :host {
    all: initial;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.4;
  }
  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    animation: slideIn 0.15s ease-out;
    margin-top: 6px;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .banner.risk-critical {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }
  .banner.risk-high {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    color: #9a3412;
  }
  .banner.risk-medium {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }
  .banner.risk-low {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .icon { flex-shrink: 0; font-size: 14px; }
  .text { flex: 1; font-weight: 500; }
  .details {
    font-weight: 400;
    opacity: 0.85;
    font-size: 12px;
  }
`

let bannerHost: HTMLElement | null = null
let bannerShadow: ShadowRoot | null = null

function ensureBannerHost(anchorElement: HTMLElement): ShadowRoot {
  if (bannerHost && bannerShadow && document.body.contains(bannerHost)) {
    return bannerShadow
  }

  // Limpiar si existe pero no está en el DOM
  if (bannerHost) bannerHost.remove()

  bannerHost = document.createElement('shieldai-banner')
  bannerHost.style.cssText = 'display:block;width:100%;pointer-events:none;'
  bannerShadow = bannerHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = BANNER_STYLES
  bannerShadow.appendChild(style)

  // Insertar justo después del ancla (el textarea/form container)
  // Intentamos insertarlo después del contenedor más cercano del input
  const container = anchorElement.closest('form') ?? anchorElement.parentElement
  if (container?.parentElement) {
    container.parentElement.insertBefore(bannerHost, container.nextSibling)
  } else {
    anchorElement.parentElement?.insertBefore(bannerHost, anchorElement.nextSibling)
  }

  return bannerShadow
}

export function updateBanner(result: ScanResult, anchorElement: HTMLElement): void {
  if (!result.hasMatches) {
    removeBanner()
    return
  }

  const shadow = ensureBannerHost(anchorElement)

  // Limpiar contenido previo (mantener el <style>)
  const existingBanner = shadow.querySelector('.banner')
  if (existingBanner) existingBanner.remove()

  const riskLevel = result.riskLevel
  const banner = document.createElement('div')
  banner.className = `banner risk-${riskLevel}`

  // Construir resumen: "2 DNIs, 1 IBAN, 1 tarjeta de crédito"
  const counts = new Map<string, number>()
  for (const d of result.detections) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  }
  const parts: string[] = []
  for (const [type, count] of counts) {
    parts.push(`${count} ${type}`)
  }

  banner.innerHTML = `
    <span class="icon">\u26A0\uFE0F</span>
    <span class="text">
      Datos sensibles detectados:
      <span class="details">${parts.join(', ')}</span>
    </span>
  `

  shadow.appendChild(banner)
}

export function removeBanner(): void {
  if (bannerHost) {
    bannerHost.remove()
    bannerHost = null
    bannerShadow = null
  }
}
