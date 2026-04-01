// Content script — interceptor de envío de mensajes en plataformas de IA
// Fase 1: Solo ChatGPT (chatgpt.com, chat.openai.com)

import { scanText, maskValue } from '@shieldai/detectors'
import type { ScanResult, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, PlatformSelectors, EventPayload } from '../types'
import { showWarningModal } from './ui/WarningModal'

// --- Estado global ---

let config: ExtensionConfig | null = null
let selectors: PlatformSelectors | null = null
let platform: string = 'unknown'
let isProcessing = false
let observer: MutationObserver | null = null

// Selectores hardcoded de fallback para ChatGPT (abril 2026)
// Se usan si el backend no devuelve selectores o la extensión no está configurada aún
const CHATGPT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: '#prompt-textarea, div[contenteditable="true"]',
  submit_button: 'button[data-testid="send-button"]',
  content_area: '[class*="markdown"]',
  input_container: 'form',
}

// --- Detección de plataforma ---

function detectPlatform(): string {
  const host = window.location.hostname
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt'
  if (host.includes('gemini.google.com')) return 'gemini'
  if (host.includes('claude.ai')) return 'claude'
  if (host.includes('perplexity.ai')) return 'perplexity'
  if (host.includes('copilot.microsoft.com')) return 'copilot'
  return 'unknown'
}

// --- Lectura del contenido del input ---

function getInputElement(): HTMLElement | null {
  if (!selectors) return null

  const selectorList = selectors.textarea.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) return el
  }
  return null
}

function getInputText(): string {
  const el = getInputElement()
  if (!el) return ''

  // ChatGPT usa contenteditable div — leer con innerText
  // innerText respeta saltos de línea visibles, textContent no
  if (el instanceof HTMLTextAreaElement) return el.value
  return el.innerText ?? ''
}

// --- Preview enmascarado para el backend ---

function buildContentPreview(result: ScanResult): string {
  const parts = result.detections.map(
    (d) => `${d.type} (${maskValue(d.value)})`
  )
  return `Se detectó ${parts.join(', ')}`
}

// --- Comunicación con el service worker ---

function sendEvent(payload: EventPayload): void {
  chrome.runtime.sendMessage({ type: 'SEND_EVENT', payload })
}

// --- Encontrar el form contenedor (ChatGPT) ---

function findSubmitForm(): HTMLFormElement | null {
  const input = getInputElement()
  if (!input) return null
  return input.closest('form')
}

// --- Encontrar el botón de submit ---

function findSubmitButton(): HTMLElement | null {
  if (!selectors) return null

  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const btn = document.querySelector<HTMLElement>(sel)
    if (btn) return btn
  }
  return null
}

// --- Re-disparo del submit tras aceptar riesgo ---
// Usa un flag para que el handler no intercepte su propio re-disparo

let allowNextSubmit = false

function redispatchSubmit(): void {
  allowNextSubmit = true

  const btn = findSubmitButton()
  if (btn) {
    btn.click()
    return
  }

  // Fallback: submit del form directamente
  const form = findSubmitForm()
  if (form) {
    form.requestSubmit()
  }
}

// --- Handler principal de intercepción ---

async function handleSubmitAttempt(event: Event): Promise<void> {
  // Si estamos en un re-disparo autorizado, dejar pasar
  if (allowNextSubmit) {
    allowNextSubmit = false
    return
  }

  // Guards
  if (isProcessing) return
  if (!config?.enabled) return
  if (!config.token) return

  // Leer el texto del input
  const text = getInputText()
  if (!text.trim()) return

  // Escanear con la librería de detección
  const result = scanText(text, {
    enabledDetectors: config.enabledDetectors as DetectorType[],
    whitelistPatterns: config.whitelistPatterns,
  })

  // Sin matches: dejar pasar sin intervención
  if (!result.hasMatches) return

  const preview = buildContentPreview(result)

  // --- Modo monitor: registrar pero no bloquear ---
  if (config.policyMode === 'monitor') {
    sendEvent({
      platform,
      detection_types: result.detections.map((d) => d.type),
      detection_count: result.detections.length,
      risk_level: result.riskLevel,
      action_taken: 'monitored',
      content_preview: preview,
      user_accepted_risk: false,
      metadata: {},
    })
    return // dejar pasar el evento original
  }

  // --- Hay datos sensibles y estamos en modo warn o block ---
  // Bloquear el evento original ANTES de que llegue a ChatGPT
  event.preventDefault()
  event.stopImmediatePropagation()
  isProcessing = true

  try {
    // --- Modo block: bloquear sin opción para el usuario ---
    if (config.policyMode === 'block') {
      sendEvent({
        platform,
        detection_types: result.detections.map((d) => d.type),
        detection_count: result.detections.length,
        risk_level: result.riskLevel,
        action_taken: 'blocked',
        content_preview: preview,
        user_accepted_risk: false,
        metadata: {},
      })
      return
    }

    // --- Modo warn: mostrar modal y dejar decidir al usuario ---
    const decision = await showWarningModal(
      result.detections,
      result.riskLevel,
      result.summary,
      platform,
    )

    if (decision === 'cancel') {
      // El usuario canceló: el texto queda en el textarea, no se envía nada
      sendEvent({
        platform,
        detection_types: result.detections.map((d) => d.type),
        detection_count: result.detections.length,
        risk_level: result.riskLevel,
        action_taken: 'warned_cancelled',
        content_preview: preview,
        user_accepted_risk: false,
        metadata: {},
      })
      return
    }

    // El usuario aceptó el riesgo: registrar y re-enviar
    sendEvent({
      platform,
      detection_types: result.detections.map((d) => d.type),
      detection_count: result.detections.length,
      risk_level: result.riskLevel,
      action_taken: 'warned_sent',
      content_preview: preview,
      user_accepted_risk: true,
      metadata: {},
    })

    // Re-disparar el submit para que ChatGPT procese el mensaje
    redispatchSubmit()
  } finally {
    isProcessing = false
  }
}

// --- Interceptación de Enter (keydown) ---
// ChatGPT envía con Enter (sin Shift). Interceptamos en fase de captura
// para atrapar el evento antes que los handlers de ChatGPT.

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  // Solo interceptar si estamos dentro del área de input de ChatGPT
  if (!event.target || !(event.target instanceof HTMLElement)) return
  const input = getInputElement()
  if (!input) return

  // Verificar que el keydown ocurrió dentro del input o es el input mismo
  if (!input.contains(event.target) && input !== event.target) return

  handleSubmitAttempt(event)
}

// --- Attachment de interceptores al DOM ---

function interceptButton(btn: HTMLElement): void {
  // Marcar para no duplicar listeners
  if (btn.dataset.shieldaiAttached === '1') return
  btn.dataset.shieldaiAttached = '1'

  btn.addEventListener('click', handleSubmitAttempt, { capture: true })
}

function scanAndAttachButtons(): void {
  if (!selectors) return

  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    document.querySelectorAll<HTMLElement>(sel).forEach(interceptButton)
  }
}

// --- MutationObserver ---
// ChatGPT es una SPA: el textarea y el botón de submit se crean/destruyen
// dinámicamente al cambiar de conversación. Usamos MutationObserver para
// re-attachear interceptores cuando aparecen nuevos elementos.

function startObserver(): void {
  // Attachment inicial
  scanAndAttachButtons()

  observer = new MutationObserver((mutations) => {
    // Optimización: solo buscar si hubo nodos añadidos
    let hasAddedNodes = false
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasAddedNodes = true
        break
      }
    }
    if (!hasAddedNodes) return

    scanAndAttachButtons()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// --- Inicialización ---

async function init(): Promise<void> {
  platform = detectPlatform()

  // Fase 1: solo ChatGPT
  if (platform !== 'chatgpt') {
    console.log(`[ShieldAI] Plataforma ${platform} no soportada aún`)
    return
  }

  // Obtener configuración del service worker
  try {
    config = await new Promise<ExtensionConfig>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response: ExtensionConfig) => {
        resolve(response)
      })
    })
  } catch {
    console.warn('[ShieldAI] No se pudo obtener la configuración')
    return
  }

  if (!config?.enabled) {
    console.log('[ShieldAI] Extensión desactivada')
    return
  }

  // Obtener selectores del backend (sincronizados por el service worker)
  try {
    const allSelectors = await new Promise<Record<string, PlatformSelectors>>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SELECTORS' }, (response: Record<string, PlatformSelectors>) => {
        resolve(response ?? {})
      })
    })
    selectors = allSelectors[platform] ?? null
  } catch {
    selectors = null
  }

  // Fallback a selectores hardcoded si el backend no devolvió nada
  if (!selectors) {
    console.log('[ShieldAI] Usando selectores de fallback para ChatGPT')
    selectors = CHATGPT_FALLBACK_SELECTORS
  }

  // Registrar interceptor de keydown en document (capturing)
  document.addEventListener('keydown', handleKeydown, { capture: true })

  // Iniciar MutationObserver para detectar y attachear submit buttons
  startObserver()

  console.log(`[ShieldAI] Interceptor activo en ${platform}`)
}

init()
