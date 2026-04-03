// WarningModal — se renderiza en Shadow DOM para aislar estilos de la página host
// Diseño: tarjeta flotante con colores dinámicos por categoría, sin overlay oscuro,
// detecciones agrupadas por categoría con campos tipo input readonly

import type { Detection } from '@shieldai/detectors'
import {
  getPrimaryTheme,
  getThemeForCategory,
  groupByCategory,
  shieldSvgLarge,
  DETECTION_LABELS,
} from './categoryTheme'

// --- Estilos del modal (dentro del Shadow DOM) ---

const MODAL_STYLES = /* css */ `
  :host {
    all: initial;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483647;
    font-family: 'Helvetica Neue', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1a1a2e;
    line-height: 1.5;
    pointer-events: none;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* --- Backdrop oscuro que bloquea la página --- */
  .backdrop {
    position: fixed;
    inset: 0;
    pointer-events: auto;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(3px);
    animation: fadeIn 0.2s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* --- Tarjeta flotante --- */
  .card {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    border-radius: 20px;
    padding: 24px;
    max-width: 420px;
    width: calc(100% - 48px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.10), 0 2px 8px rgba(0, 0, 0, 0.05);
    animation: slideUpIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    z-index: 1;
  }
  @keyframes slideUpIn {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); }
    to   { opacity: 1; transform: translate(-50%, -50%); }
  }
  @keyframes slideDownOut {
    from { opacity: 1; transform: translate(-50%, -50%); }
    to   { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); }
  }
  .card.removing {
    animation: slideDownOut 0.15s ease-in forwards;
  }


  /* --- Header --- */
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .shield-icon {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .shield-icon svg {
    width: 24px;
    height: 24px;
  }
  .header-text {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a2e;
    line-height: 1.3;
  }
  .subtitle {
    font-size: 13px;
    color: #8C7A6B;
    font-weight: 500;
  }

  /* --- Grupo de categoría --- */
  .category-group {
    margin-bottom: 14px;
  }
  .category-group:last-of-type {
    margin-bottom: 18px;
  }
  .category-title {
    font-size: 11px;
    font-weight: 600;
    color: #8C7A6B;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 6px;
    padding-left: 2px;
  }

  /* --- Detección individual --- */
  .det-item {
    margin-bottom: 8px;
  }
  .det-item:last-child {
    margin-bottom: 0;
  }
  .det-value {
    width: 100%;
    padding: 10px 14px;
    background: #ffffff;
    border: 1px solid rgba(0, 0, 0, 0.06);
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    color: #1a1a2e;
    font-family: inherit;
    line-height: 1.4;
    margin-bottom: 4px;
  }
  .det-label {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 4px;
    font-size: 11px;
    color: #8C7A6B;
    font-weight: 500;
  }
  .det-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* --- Botones de acción --- */
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
  }
  .btn-discard {
    padding: 9px 22px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    color: #8C7A6B;
    border: 1.5px solid rgba(140, 122, 107, 0.3);
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }
  .btn-discard:hover {
    background: rgba(140, 122, 107, 0.08);
    border-color: rgba(140, 122, 107, 0.5);
  }
  .btn-discard:focus-visible {
    outline: 2px solid #8C7A6B;
    outline-offset: 2px;
  }
  .btn-accept {
    padding: 9px 22px;
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    white-space: nowrap;
    transition: background 0.15s, border-color 0.15s;
    font-family: inherit;
    line-height: 1.4;
  }
  .btn-accept:focus-visible {
    outline-offset: 2px;
  }

  /* --- Scroll para muchas detecciones --- */
  .detections-scroll {
    max-height: 300px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0,0,0,0.12) transparent;
  }
  .detections-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .detections-scroll::-webkit-scrollbar-thumb {
    background: rgba(0,0,0,0.12);
    border-radius: 4px;
  }

  @media (max-width: 480px) {
    .card {
      max-width: none;
      width: calc(100% - 32px);
      padding: 20px;
    }
  }
`

// --- Escapar HTML para prevenir XSS ---

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// --- Función pública ---

export function showWarningModal(
  detections: Detection[],
  riskLevel: string,
  summary: string,
  platformId?: string,
): Promise<'cancel' | 'accept'> {
  return new Promise((resolve) => {
    // Crear el host del Shadow DOM
    const host = document.createElement('shieldai-modal')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })

    // Inyectar estilos
    const styleEl = document.createElement('style')
    styleEl.textContent = MODAL_STYLES
    shadow.appendChild(styleEl)

    // Tema dinámico según la categoría principal
    const theme = getPrimaryTheme(detections)
    const totalCount = detections.length

    // Agrupar por categoría
    const groups = groupByCategory(detections)

    // Construir detecciones HTML agrupadas
    let detectionsHtml = ''
    for (const [category, dets] of groups) {
      const catTheme = getThemeForCategory(category)
      detectionsHtml += `<div class="category-group">`
      if (groups.size > 1) {
        detectionsHtml += `<div class="category-title">${escapeHtml(catTheme.label)}</div>`
      }
      for (const d of dets) {
        const typeLabel = DETECTION_LABELS[d.type] ?? d.type
        detectionsHtml += `
          <div class="det-item">
            <div class="det-value">${escapeHtml(d.masked)}</div>
            <div class="det-label">
              <span class="det-dot" style="background:${catTheme.dotColor}"></span>
              ${escapeHtml(catTheme.label)} &middot; ${escapeHtml(typeLabel)}
            </div>
          </div>`
      }
      detectionsHtml += `</div>`
    }

    // Construir el card
    const backdrop = document.createElement('div')
    backdrop.className = 'backdrop'

    const card = document.createElement('div')
    card.className = 'card'
    card.style.background = theme.bg
    card.setAttribute('role', 'alertdialog')
    card.setAttribute('aria-labelledby', 'shieldai-title')
    card.innerHTML = `
      <div class="header">
        <div class="shield-icon" style="background:${theme.iconBg}">${shieldSvgLarge(theme.iconBg, theme.iconColor)}</div>
        <div class="header-text">
          <div class="title" id="shieldai-title">${escapeHtml(theme.label)}</div>
          <div class="subtitle">${totalCount} dato${totalCount !== 1 ? 's' : ''} detectado${totalCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="detections-scroll">
        ${detectionsHtml}
      </div>
      <div class="actions">
        <button class="btn-discard" id="shieldai-discard">Descartar archivo</button>
        <button class="btn-accept" id="shieldai-accept" style="color:${theme.btnColor};border:1.5px solid ${theme.btnBorder}">Enviar de todos modos</button>
      </div>
    `

    shadow.appendChild(backdrop)
    shadow.appendChild(card)

    // Hover dinámico para el botón
    const acceptBtn = shadow.getElementById('shieldai-accept') as HTMLElement
    acceptBtn.addEventListener('mouseenter', () => {
      acceptBtn.style.background = theme.btnHoverBg
    })
    acceptBtn.addEventListener('mouseleave', () => {
      acceptBtn.style.background = 'transparent'
    })

    // --- Cierre y resolución ---

    let resolved = false

    // --- Bloquear TODOS los eventos de teclado e input mientras el modal está abierto ---
    function blockKeyboardEvent(e: KeyboardEvent): void {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    function blockInputEvent(e: Event): void {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
    document.addEventListener('keydown', blockKeyboardEvent, { capture: true })
    document.addEventListener('keyup', blockKeyboardEvent, { capture: true })
    document.addEventListener('keypress', blockKeyboardEvent, { capture: true })
    document.addEventListener('input', blockInputEvent, { capture: true })
    document.addEventListener('paste', blockInputEvent, { capture: true })
    document.addEventListener('compositionstart', blockInputEvent, { capture: true })
    document.addEventListener('compositionend', blockInputEvent, { capture: true })

    function cleanup(result: 'cancel' | 'accept'): void {
      if (resolved) return
      resolved = true
      // Remover bloqueadores de teclado e input
      document.removeEventListener('keydown', blockKeyboardEvent, { capture: true })
      document.removeEventListener('keyup', blockKeyboardEvent, { capture: true })
      document.removeEventListener('keypress', blockKeyboardEvent, { capture: true })
      document.removeEventListener('input', blockInputEvent, { capture: true })
      document.removeEventListener('paste', blockInputEvent, { capture: true })
      document.removeEventListener('compositionstart', blockInputEvent, { capture: true })
      document.removeEventListener('compositionend', blockInputEvent, { capture: true })
      card.classList.add('removing')
      setTimeout(() => host.remove(), 150)
      resolve(result)
    }

    // Botones
    const discardBtn = shadow.getElementById('shieldai-discard') as HTMLElement
    acceptBtn.addEventListener('click', () => cleanup('accept'))
    discardBtn.addEventListener('click', () => cleanup('cancel'))
  })
}
