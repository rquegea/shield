// Content script — interceptor de envío de mensajes en plataformas de IA
// Fase 1: Solo ChatGPT (chatgpt.com, chat.openai.com)
//
// Estrategia: NO interceptar eventos de submit. En su lugar:
//   1. Escanear en tiempo real mientras el usuario escribe/pega
//   2. Si hay datos sensibles → deshabilitar el botón de submit via CSS
//      (opacity 0.4, pointer-events: none en todos los botones del form)
//   3. Mostrar banner con resumen + botón "Enviar de todos modos"
//   4. Si el usuario acepta → registrar evento, rehabilitar botones, click submit
//   5. Si el texto cambia y ya no hay datos sensibles → rehabilitar botones
//
// Detección de texto por múltiples vías:
//   - input event (typing)
//   - paste event (Ctrl+V / Cmd+V)
//   - drop event (drag & drop)
//   - polling cada 2s (safety net: menú contextual, autocompletado, etc.)

import { scanText, maskValue } from '@shieldai/detectors'
import type { ScanResult, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, PlatformSelectors, EventPayload } from '../types'
import { updateBanner, removeBanner, unblockButtons } from './ui/InlineBanner'

// ============================================================================
// Estado global
// ============================================================================

let config: ExtensionConfig | null = null
let selectors: PlatformSelectors | null = null
let platform: string = 'unknown'
let lastScanResult: ScanResult | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastPolledText: string = ''
let pollingInterval: ReturnType<typeof setInterval> | null = null

const DEBOUNCE_MS = 500
const PASTE_DELAY_MS = 100
const POLLING_INTERVAL_MS = 2000

// Selectores de fallback para ChatGPT (abril 2026)
const CHATGPT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    '#prompt-textarea',
    'div.ProseMirror[contenteditable="true"]',
    'form textarea',
  ].join(', '),
  submit_button: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Enviar mensaje"]',
    'form button[type="submit"]',
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
  if (el instanceof HTMLTextAreaElement) return el.value
  return el.innerText ?? ''
}

function isInsideInput(el: HTMLElement): boolean {
  const input = getInputElement()
  if (!input) return false
  return input.contains(el) || input === el
}

// ============================================================================
// Utilidades
// ============================================================================

function buildContentPreview(result: ScanResult): string {
  return result.detections.map((d) => `${d.type} (${maskValue(d.value)})`).join(', ')
}

function sendEvent(payload: EventPayload): void {
  chrome.runtime.sendMessage({ type: 'SEND_EVENT', payload })
}

function buildPayload(
  result: ScanResult,
  action: EventPayload['action_taken'],
  accepted: boolean,
): EventPayload {
  return {
    platform,
    detection_types: result.detections.map((d) => d.type),
    detection_count: result.detections.length,
    risk_level: result.riskLevel,
    action_taken: action,
    content_preview: buildContentPreview(result),
    user_accepted_risk: accepted,
    metadata: {},
  }
}

// ============================================================================
// Encontrar y clickar el botón de submit
// ============================================================================

function findSubmitButton(): HTMLElement | null {
  if (!selectors) return null
  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const btn = document.querySelector<HTMLElement>(sel)
    if (btn) return btn
  }

  // Fallback: cualquier button dentro del form del input
  const input = getInputElement()
  if (!input) return null
  const form = input.closest('form')
  if (!form) return null
  // Buscar el último button (suele ser el de submit)
  const buttons = form.querySelectorAll<HTMLElement>('button')
  return buttons.length > 0 ? buttons[buttons.length - 1] : null
}

function clickSubmitButton(): void {
  const btn = findSubmitButton()
  if (btn) {
    btn.click()
    return
  }

  // Fallback: Enter en el input
  const input = getInputElement()
  if (input) {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13,
      bubbles: true, cancelable: true,
    }))
  }
}

// ============================================================================
// Aceptación de riesgo desde el banner
// ============================================================================

function handleAcceptRisk(): void {
  if (!lastScanResult?.hasMatches || !config) return

  // Registrar el evento
  if (config.policyMode === 'warn') {
    sendEvent(buildPayload(lastScanResult, 'warned_sent', true))
  }

  // Quitar banner y rehabilitar botones
  removeBanner()
  lastScanResult = null

  // Dar un tick para que el CSS se aplique y los botones se reactiven
  requestAnimationFrame(() => {
    clickSubmitButton()
  })
}

// ============================================================================
// Escaneo en tiempo real
// ============================================================================

function runRealtimeScan(): void {
  const text = getInputText()
  const input = getInputElement()

  if (!text.trim() || !input) {
    if (lastScanResult?.hasMatches) {
      removeBanner()
    }
    lastScanResult = null
    return
  }

  const result = scanText(text, {
    enabledDetectors: (config?.enabledDetectors ?? []) as DetectorType[],
    whitelistPatterns: config?.whitelistPatterns ?? [],
  })

  lastScanResult = result

  if (!result.hasMatches) {
    removeBanner()
    return
  }

  // ─── Modo monitor: solo registrar, no bloquear ───
  if (config?.policyMode === 'monitor') {
    // No mostrar banner ni bloquear botones
    return
  }

  // ─── Modo block: banner sin botón de aceptar, botones deshabilitados ───
  // ─── Modo warn: banner con botón "Enviar de todos modos" ───
  const isBlock = config?.policyMode === 'block'
  updateBanner(result, input, {
    onAcceptRisk: isBlock ? undefined : handleAcceptRisk,
  })
}

function debouncedScan(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runRealtimeScan, DEBOUNCE_MS)
}

// ============================================================================
// Detección de envío post-hoc (MutationObserver en el input)
// ============================================================================
// Si el usuario logra enviar de alguna forma (bypass), detectamos que el
// contenido del input se vació de golpe y registramos el evento.

let lastInputText = ''

function checkForSentMessage(): void {
  const text = getInputText()

  // El input se vació y antes había datos sensibles → se envió
  if (lastInputText.trim() && !text.trim() && lastScanResult?.hasMatches) {
    sendEvent(buildPayload(lastScanResult, 'warned_sent', true))
    removeBanner()
    lastScanResult = null
  }

  lastInputText = text
}

// ============================================================================
// Event listeners
// ============================================================================

function handleInputEvent(event: Event): void {
  if (!config?.enabled) return
  if (!(event.target instanceof HTMLElement)) return
  if (!isInsideInput(event.target)) return
  debouncedScan()
}

function handlePasteEvent(event: Event): void {
  if (!config?.enabled) return
  if (!(event.target instanceof HTMLElement)) return
  if (!isInsideInput(event.target)) return
  setTimeout(runRealtimeScan, PASTE_DELAY_MS)
}

function handleDropEvent(event: Event): void {
  if (!config?.enabled) return
  if (!(event.target instanceof HTMLElement)) return
  if (!isInsideInput(event.target)) return
  setTimeout(runRealtimeScan, PASTE_DELAY_MS)
}

function startPolling(): void {
  if (pollingInterval !== null) return
  pollingInterval = setInterval(() => {
    if (!config?.enabled) return
    const text = getInputText()
    if (text === lastPolledText) return
    lastPolledText = text
    runRealtimeScan()
    checkForSentMessage()
  }, POLLING_INTERVAL_MS)
}

function attachAllListeners(): void {
  document.addEventListener('input', handleInputEvent, { capture: true })
  document.addEventListener('paste', handlePasteEvent, { capture: true })
  document.addEventListener('drop', handleDropEvent, { capture: true })
  startPolling()
  console.log('[ShieldAI] Listeners registrados (input, paste, drop, polling)')
}

// ============================================================================
// MutationObserver — detectar aparición/desaparición del input (SPA)
// ============================================================================

function startObserver(): void {
  let lastInputFound = false

  const check = (): void => {
    const input = getInputElement()
    const found = input !== null

    if (found && !lastInputFound) {
      console.log('[ShieldAI] Input encontrado:', input?.tagName, input?.id || input?.className)
    } else if (!found && lastInputFound) {
      console.log('[ShieldAI] Input perdido (navegación SPA)')
      removeBanner()
      lastScanResult = null
      lastPolledText = ''
      lastInputText = ''
    }

    lastInputFound = found
  }

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

  if (platform !== 'chatgpt') {
    console.log(`[ShieldAI] Plataforma ${platform} no soportada aún`)
    return
  }

  try {
    config = await new Promise<ExtensionConfig>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve)
    })
  } catch {
    console.warn('[ShieldAI] No se pudo obtener la configuración')
    return
  }

  if (!config?.enabled) {
    console.log('[ShieldAI] Extensión desactivada')
    return
  }

  try {
    const all = await new Promise<Record<string, PlatformSelectors>>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SELECTORS' }, (r: Record<string, PlatformSelectors>) => resolve(r ?? {}))
    })
    selectors = all[platform] ?? null
  } catch {
    selectors = null
  }

  if (!selectors) {
    console.log('[ShieldAI] Usando selectores de fallback para ChatGPT')
    selectors = CHATGPT_FALLBACK_SELECTORS
  }

  attachAllListeners()
  startObserver()

  console.log('[ShieldAI] Interceptor activo en', platform)
}

init()
