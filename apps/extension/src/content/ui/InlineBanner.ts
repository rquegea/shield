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

import type { ScanResult } from '@shieldai/detectors'

// ─── Estilos del banner (Shadow DOM) ───

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
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    animation: slideIn 0.15s ease-out;
    margin-top: 6px;
    flex-wrap: wrap;
  }
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .banner.risk-critical { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
  .banner.risk-high     { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
  .banner.risk-medium   { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
  .banner.risk-low      { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }

  .icon { flex-shrink: 0; font-size: 14px; }
  .content { flex: 1; min-width: 0; }
  .text { font-weight: 500; }
  .details { font-weight: 400; opacity: 0.85; font-size: 12px; }

  .btn-accept {
    margin-left: auto;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: #dc2626;
    color: #fff;
    white-space: nowrap;
    transition: background 0.15s;
    font-family: inherit;
  }
  .btn-accept:hover { background: #b91c1c; }
`

// ─── CSS inyectado en la página host para deshabilitar botones del form ───

const BLOCK_STYLE_ID = 'shieldai-block-buttons'

function getFormContainer(input: HTMLElement): HTMLElement | null {
  return input.closest('form') ?? input.parentElement
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
    [data-shieldai-blocked="1"] [role="button"] {
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

// ─── Estado del banner ───

let bannerHost: HTMLElement | null = null
let bannerShadow: ShadowRoot | null = null
let currentOnAccept: (() => void) | null = null

function ensureBannerHost(anchorElement: HTMLElement): ShadowRoot {
  if (bannerHost && bannerShadow && document.body.contains(bannerHost)) {
    return bannerShadow
  }

  if (bannerHost) bannerHost.remove()

  bannerHost = document.createElement('shieldai-banner')
  bannerHost.style.cssText = 'display:block;width:100%;'
  bannerShadow = bannerHost.attachShadow({ mode: 'closed' })

  const style = document.createElement('style')
  style.textContent = BANNER_STYLES
  bannerShadow.appendChild(style)

  // Insertar después del form/container del input
  const container = getFormContainer(anchorElement)
  if (container?.parentElement) {
    container.parentElement.insertBefore(bannerHost, container.nextSibling)
  } else {
    anchorElement.parentElement?.insertBefore(bannerHost, anchorElement.nextSibling)
  }

  return bannerShadow
}

// ─── API pública ───

export interface BannerCallbacks {
  onAcceptRisk?: () => void  // si es undefined o null, no se muestra el botón (modo block)
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

  // Deshabilitar botones del form
  injectBlockStyle(anchorElement)

  // Limpiar contenido previo (mantener <style>)
  const existing = shadow.querySelector('.banner')
  if (existing) existing.remove()

  const banner = document.createElement('div')
  banner.className = `banner risk-${result.riskLevel}`

  // Resumen: "2 DNI, 1 IBAN"
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
    <span class="content">
      <span class="text">Datos sensibles detectados: </span>
      <span class="details">${parts.join(', ')}</span>
    </span>
  `

  // Botón "Enviar de todos modos" — solo si hay callback (modo warn)
  if (callbacks.onAcceptRisk) {
    const acceptBtn = document.createElement('button')
    acceptBtn.className = 'btn-accept'
    acceptBtn.textContent = 'Enviar de todos modos'
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
  if (bannerHost) {
    bannerHost.remove()
    bannerHost = null
    bannerShadow = null
  }
}

// Re-habilitar botones temporalmente (para el re-disparo del submit)
export function unblockButtons(): void {
  removeBlockStyle()
}
