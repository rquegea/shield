// Content script — interceptor de envío de mensajes en plataformas de IA
// Fase 1: Solo ChatGPT (chatgpt.com, chat.openai.com)
//
// Dos capas de protección:
//   1. Banner inline en tiempo real mientras el usuario escribe (debounced)
//   2. Bloqueo del submit con modal de confirmación
//
// Interceptación del submit en 3 puntos (todos con useCapture:true en document):
//   - keydown Enter (sin Shift) dentro del input
//   - click en el botón de submit (delegado desde document)
//   - submit del form

import { scanText, maskValue } from '@shieldai/detectors'
import type { ScanResult, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, PlatformSelectors, EventPayload } from '../types'
import { showWarningModal } from './ui/WarningModal'
import { updateBanner, removeBanner } from './ui/InlineBanner'

// ============================================================================
// Estado global
// ============================================================================

let config: ExtensionConfig | null = null
let selectors: PlatformSelectors | null = null
let platform: string = 'unknown'
let isProcessing = false
let lastScanResult: ScanResult | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const DEBOUNCE_MS = 500

// Selectores de fallback para ChatGPT (abril 2026)
// Orden: más específico primero. Se prueban secuencialmente.
const CHATGPT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    '#prompt-textarea',                    // ID principal del editor
    'div.ProseMirror[contenteditable="true"]', // ProseMirror editor
    'form textarea',                       // textarea dentro de form (fallback)
  ].join(', '),
  submit_button: [
    'button[data-testid="send-button"]',           // data-testid oficial
    'button[aria-label="Send prompt"]',            // aria-label variante
    'button[aria-label="Enviar mensaje"]',         // variante español
    'form button[type="submit"]',                  // submit button genérico en form
  ].join(', '),
  content_area: '[class*="markdown"]',
  input_container: 'form',
}

// ============================================================================
// Detección de plataforma
// ============================================================================

function detectPlatform(): string {
  const host = window.location.hostname
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) return 'chatgpt'
  if (host.includes('gemini.google.com')) return 'gemini'
  if (host.includes('claude.ai')) return 'claude'
  if (host.includes('perplexity.ai')) return 'perplexity'
  if (host.includes('copilot.microsoft.com')) return 'copilot'
  return 'unknown'
}

// ============================================================================
// Lectura del contenido del input
// ============================================================================

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

  // ChatGPT usa contenteditable div (ProseMirror) → leer con innerText
  // innerText respeta saltos de línea visibles; textContent no
  if (el instanceof HTMLTextAreaElement) return el.value
  return el.innerText ?? ''
}

// ============================================================================
// Utilidades
// ============================================================================

function buildContentPreview(result: ScanResult): string {
  const parts = result.detections.map((d) => `${d.type} (${maskValue(d.value)})`)
  return `Se detectó ${parts.join(', ')}`
}

function sendEvent(payload: EventPayload): void {
  chrome.runtime.sendMessage({ type: 'SEND_EVENT', payload })
}

function buildEventPayload(
  result: ScanResult,
  actionTaken: EventPayload['action_taken'],
  acceptedRisk: boolean,
): EventPayload {
  return {
    platform,
    detection_types: result.detections.map((d) => d.type),
    detection_count: result.detections.length,
    risk_level: result.riskLevel,
    action_taken: actionTaken,
    content_preview: buildContentPreview(result),
    user_accepted_risk: acceptedRisk,
    metadata: {},
  }
}

// ============================================================================
// Matching de selectores (para identificar clicks en el submit button)
// ============================================================================

function matchesSubmitButton(el: HTMLElement): boolean {
  if (!selectors) return false

  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    // El elemento clicado puede ser un hijo del botón (ej: un SVG dentro)
    if (el.matches(sel) || el.closest(sel)) return true
  }
  return false
}

function isInsideInput(el: HTMLElement): boolean {
  const input = getInputElement()
  if (!input) return false
  return input.contains(el) || input === el
}

// ============================================================================
// CAPA 1: Detección en tiempo real (banner inline)
// ============================================================================

function runRealtimeScan(): void {
  const text = getInputText()
  const input = getInputElement()

  if (!text.trim() || !input) {
    lastScanResult = null
    removeBanner()
    return
  }

  const result = scanText(text, {
    enabledDetectors: (config?.enabledDetectors ?? []) as DetectorType[],
    whitelistPatterns: config?.whitelistPatterns ?? [],
  })

  lastScanResult = result

  if (result.hasMatches) {
    updateBanner(result, input)
  } else {
    removeBanner()
  }
}

function debouncedScan(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runRealtimeScan, DEBOUNCE_MS)
}

// Listener de input en el contenteditable / textarea
// Se attacha a document con capture para capturar eventos de input
// en contenteditable divs (que burbujean como 'input' events)
function handleInputEvent(event: Event): void {
  if (!config?.enabled) return
  const target = event.target
  if (!(target instanceof HTMLElement)) return
  if (!isInsideInput(target)) return

  debouncedScan()
}

// ============================================================================
// CAPA 2: Interceptación del submit (modal de confirmación)
// ============================================================================

// Flag para permitir el re-disparo después de "Acepto el riesgo"
let allowNextSubmit = false

function findSubmitButton(): HTMLElement | null {
  if (!selectors) return null
  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const btn = document.querySelector<HTMLElement>(sel)
    if (btn) return btn
  }
  return null
}

function redispatchSubmit(): void {
  allowNextSubmit = true

  // Intentar click en el botón de submit
  const btn = findSubmitButton()
  if (btn) {
    btn.click()
    return
  }

  // Fallback: disparar Enter en el input
  const input = getInputElement()
  if (input) {
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(enterEvent)
    return
  }

  // Último fallback: submit del form
  const form = document.querySelector<HTMLFormElement>(
    selectors?.input_container ?? 'form'
  )
  if (form) {
    form.requestSubmit()
  }
}

async function handleSubmitAttempt(event: Event): Promise<void> {
  // Si es un re-disparo autorizado, dejar pasar
  if (allowNextSubmit) {
    allowNextSubmit = false
    return
  }

  // Guards básicos
  if (isProcessing) return
  if (!config?.enabled || !config.token) return

  // Escanear ahora (puede haber texto nuevo desde el último debounce)
  const text = getInputText()
  if (!text.trim()) return

  const result = scanText(text, {
    enabledDetectors: config.enabledDetectors as DetectorType[],
    whitelistPatterns: config.whitelistPatterns,
  })

  // Sin matches → dejar pasar sin intervención
  if (!result.hasMatches) return

  // ─── Modo monitor: registrar pero NO bloquear ───
  if (config.policyMode === 'monitor') {
    sendEvent(buildEventPayload(result, 'monitored', false))
    return
  }

  // ─── Hay datos sensibles y estamos en warn o block ───
  // Bloquear el evento ANTES de que llegue a los handlers de ChatGPT
  event.preventDefault()
  event.stopImmediatePropagation()
  isProcessing = true

  try {
    // ─── Modo block: bloquear sin opción ───
    if (config.policyMode === 'block') {
      sendEvent(buildEventPayload(result, 'blocked', false))
      return
    }

    // ─── Modo warn: mostrar modal de confirmación ───
    const decision = await showWarningModal(
      result.detections,
      result.riskLevel,
      result.summary,
      platform,
    )

    if (decision === 'cancel') {
      sendEvent(buildEventPayload(result, 'warned_cancelled', false))
      return
    }

    // El usuario aceptó el riesgo
    sendEvent(buildEventPayload(result, 'warned_sent', true))
    redispatchSubmit()
  } finally {
    isProcessing = false
  }
}

// ============================================================================
// Event listeners a nivel document (capturing phase)
// ============================================================================
// Todos en capture:true para interceptar ANTES que React's event delegation
// (React attacha handlers en el root element, que está por debajo de document)

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey) return
  if (!event.target || !(event.target instanceof HTMLElement)) return

  // Solo interceptar si el Enter ocurrió dentro del input de ChatGPT
  if (!isInsideInput(event.target)) return

  handleSubmitAttempt(event)
}

function handleDocumentClick(event: MouseEvent): void {
  if (!event.target || !(event.target instanceof HTMLElement)) return

  // ¿El click fue en el botón de submit o un hijo de él?
  if (!matchesSubmitButton(event.target)) return

  handleSubmitAttempt(event)
}

function handleFormSubmit(event: SubmitEvent): void {
  handleSubmitAttempt(event)
}

// ============================================================================
// Setup de listeners
// ============================================================================

function attachAllListeners(): void {
  // CAPA 1: detección en tiempo real
  // 'input' event burbujea desde contenteditable y textarea
  document.addEventListener('input', handleInputEvent, { capture: true })

  // CAPA 2: interceptación del submit (3 vectores, todos en capturing)
  document.addEventListener('keydown', handleDocumentKeydown, { capture: true })
  document.addEventListener('click', handleDocumentClick, { capture: true })
  document.addEventListener('submit', handleFormSubmit, { capture: true })

  console.log('[ShieldAI] Listeners registrados (input, keydown, click, submit)')
}

// ============================================================================
// MutationObserver
// ============================================================================
// ChatGPT es una SPA: el textarea se destruye/recrea al navegar entre chats.
// Observamos el DOM para:
//   - Limpiar el banner cuando el input desaparece
//   - Log de diagnóstico cuando encontramos/perdemos el input

function startObserver(): void {
  let lastInputFound = false

  const check = (): void => {
    const input = getInputElement()
    const found = input !== null

    if (found && !lastInputFound) {
      console.log('[ShieldAI] Input de ChatGPT encontrado:', input?.tagName, input?.id || input?.className)
    } else if (!found && lastInputFound) {
      console.log('[ShieldAI] Input de ChatGPT perdido (navegación SPA)')
      removeBanner()
      lastScanResult = null
    }

    lastInputFound = found
  }

  // Check inicial
  check()

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
        check()
        return
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// ============================================================================
// Inicialización
// ============================================================================

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

  // Obtener selectores del backend
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

  // Fallback a selectores hardcoded
  if (!selectors) {
    console.log('[ShieldAI] Usando selectores de fallback para ChatGPT')
    selectors = CHATGPT_FALLBACK_SELECTORS
  }

  // Registrar todos los listeners en document (capturing)
  attachAllListeners()

  // MutationObserver para detectar cambios de SPA
  startObserver()

  console.log('[ShieldAI] Interceptor activo en', platform, '| Selectores:', {
    textarea: selectors.textarea.split(',').map((s) => s.trim()),
    submit: selectors.submit_button.split(',').map((s) => s.trim()),
  })
}

init()
