// WarningModal — se renderiza en Shadow DOM para aislar estilos de la página host
// Devuelve Promise<'cancel' | 'accept'> que el interceptor espera

import type { Detection } from '@shieldai/detectors'

// --- Nombres legibles de plataformas ---

const PLATFORM_NAMES: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Google Gemini',
  claude: 'Claude',
  perplexity: 'Perplexity',
  copilot: 'Microsoft Copilot',
}

// --- Etiquetas y colores de riesgo ---

const RISK_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  critical: { label: 'Riesgo Crítico', bg: '#fef2f2', color: '#991b1b', border: '#fecaca' },
  high:     { label: 'Riesgo Alto',    bg: '#fff7ed', color: '#9a3412', border: '#fed7aa' },
  medium:   { label: 'Riesgo Medio',   bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  low:      { label: 'Riesgo Bajo',    bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
}

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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
    line-height: 1.5;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* --- Overlay --- */
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: fadeIn 0.15s ease-out;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* --- Tarjeta del modal --- */
  .modal {
    background: #ffffff;
    border-radius: 16px;
    padding: 28px;
    max-width: 500px;
    width: 100%;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: slideUp 0.2s ease-out;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* --- Header con icono --- */
  .header {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 20px;
  }
  .shield-icon {
    width: 44px;
    height: 44px;
    background: #fef2f2;
    border-radius: 12px;
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
  }
  .title {
    font-size: 17px;
    font-weight: 600;
    color: #111827;
    margin-bottom: 4px;
  }
  .description {
    font-size: 13px;
    color: #6b7280;
  }

  /* --- Badge de riesgo --- */
  .risk-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    margin-bottom: 16px;
  }
  .risk-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  /* --- Lista de detecciones --- */
  .detections {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 4px 0;
    margin-bottom: 16px;
    max-height: 220px;
    overflow-y: auto;
  }
  .detection-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #f3f4f6;
  }
  .detection-item:last-child {
    border-bottom: none;
  }
  .detection-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detection-icon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
  }
  .detection-type {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }
  .detection-value {
    font-size: 13px;
    color: #9ca3af;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;
  }

  /* --- Texto de advertencia --- */
  .warning-text {
    font-size: 13px;
    color: #6b7280;
    margin-bottom: 24px;
    line-height: 1.6;
    padding: 12px 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
  }
  .warning-text strong {
    color: #92400e;
    font-weight: 600;
  }

  /* --- Botones --- */
  .buttons {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
  .btn {
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
    outline: none;
  }
  .btn:focus-visible {
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px #3b82f6;
  }
  .btn-cancel {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
  }
  .btn-cancel:hover {
    background: #e5e7eb;
  }
  .btn-accept {
    background: #dc2626;
    color: #ffffff;
  }
  .btn-accept:hover {
    background: #b91c1c;
  }
`

// --- SVG del icono de escudo/warning ---

const SHIELD_WARNING_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/>
  <path d="M12 9v4M12 16h.01" stroke="#dc2626" stroke-width="2" stroke-linecap="round"/>
</svg>`

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

    // Datos de riesgo
    const risk = RISK_CONFIG[riskLevel] ?? RISK_CONFIG.medium
    const platformName = platformId ? (PLATFORM_NAMES[platformId] ?? platformId) : 'la plataforma de IA'

    // Construir HTML
    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <div class="modal" role="alertdialog" aria-labelledby="shieldai-title" aria-describedby="shieldai-desc">
        <div class="header">
          <div class="shield-icon">${SHIELD_WARNING_SVG}</div>
          <div class="header-text">
            <div class="title" id="shieldai-title">Datos sensibles detectados</div>
            <div class="description" id="shieldai-desc">
              Se han detectado los siguientes datos sensibles en tu mensaje:
            </div>
          </div>
        </div>

        <div class="risk-badge" style="background:${risk.bg};color:${risk.color};border:1px solid ${risk.border}">
          <span class="risk-dot" style="background:${risk.color}"></span>
          ${escapeHtml(risk.label)}
        </div>

        <div class="detections">
          ${detections.map((d) => `
            <div class="detection-item">
              <div class="detection-label">
                <span class="detection-icon"></span>
                <span class="detection-type">${escapeHtml(d.type)}</span>
              </div>
              <span class="detection-value">${escapeHtml(d.masked)}</span>
            </div>
          `).join('')}
        </div>

        <div class="warning-text">
          Enviar estos datos a <strong>${escapeHtml(platformName)}</strong> puede incumplir
          la política de protección de datos de tu empresa.
          Tu decisión quedará registrada.
        </div>

        <div class="buttons">
          <button class="btn btn-cancel" id="shieldai-cancel">Cancelar envío</button>
          <button class="btn btn-accept" id="shieldai-accept">Acepto el riesgo y envío</button>
        </div>
      </div>
    `
    shadow.appendChild(overlay)

    // --- Cierre y resolución ---

    let resolved = false

    function cleanup(result: 'cancel' | 'accept'): void {
      if (resolved) return
      resolved = true
      host.remove()
      resolve(result)
    }

    // Botones
    shadow.getElementById('shieldai-cancel')!.addEventListener('click', () => cleanup('cancel'))
    shadow.getElementById('shieldai-accept')!.addEventListener('click', () => cleanup('accept'))

    // Click fuera del modal = cancelar
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup('cancel')
    })

    // Escape = cancelar
    function onKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        cleanup('cancel')
        document.removeEventListener('keydown', onKeydown, { capture: true })
      }
    }
    document.addEventListener('keydown', onKeydown, { capture: true })

    // Focus en el botón de cancelar para accesibilidad
    const cancelBtn = shadow.getElementById('shieldai-cancel')
    if (cancelBtn) {
      requestAnimationFrame(() => cancelBtn.focus())
    }
  })
}
