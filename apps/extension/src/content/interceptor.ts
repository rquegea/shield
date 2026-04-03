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
import { updateBanner, removeBanner, unblockButtons, updateInfoBanner } from './ui/InlineBanner'
import { initFileInterceptor } from './fileInterceptor'
import { startHealthCheck } from './healthCheck'

// ============================================================================
// Estado global
// ============================================================================

let config: ExtensionConfig | null = null
let selectors: PlatformSelectors | null = null
let platform: string = 'unknown'
let lastScanResult: ScanResult | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let lastScannedText: string = '' // Último texto que fue realmente escaneado
let lastPolledText: string = ''
let pollingInterval: ReturnType<typeof setInterval> | null = null
let isBlocked = false // Estado de bloqueo global

// ============================================================================
// API pública para fileInterceptor
// ============================================================================

/**
 * Función pública: bloquea el envío con un banner visual.
 * Usada cuando un archivo queda bloqueado sin dismiss automático.
 * Aplica los mismos mecanismos que cuando se detectan datos sensibles.
 */
export function blockSending(reason: string = 'archivo bloqueado'): void {
  isBlocked = true
  const input = getInputElement()

  if (input) {
    // Crear un resultado dummy para mostrar un banner de bloqueo
    const dummyResult: ScanResult = {
      hasMatches: true,
      detections: [],
      riskLevel: 'critical',
      maxSeverity: 'block',
      summary: `Archivo ${reason}. Por favor, elimínalo antes de enviar.`,
    }

    console.log(`[Guripa AI] blockSending() — ${reason}`)
    updateBanner(dummyResult, input, {
      onAcceptRisk: undefined, // No permitir "enviar de todos modos"
      sourceText: '',
    })
  } else {
    console.log(`[Guripa AI] blockSending() — ${reason} (sin input encontrado)`)
  }
}

/**
 * Función pública: desbloquea el envío y quita el banner.
 * Usada cuando el usuario elimina manualmente el archivo bloqueado.
 */
export function unblockSending(): void {
  isBlocked = false
  removeBanner()
  console.log('[Guripa AI] unblockSending() — archivo eliminado')
}

const DEBOUNCE_MS = 500
const PASTE_DELAY_MS = 100
const POLLING_INTERVAL_MS = 2000

// Selectores de fallback por plataforma (abril 2026)
const CHATGPT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    '#prompt-textarea',
    'div.ProseMirror[contenteditable="true"]',
    'div[id="prompt-textarea"][contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    'form textarea',
  ].join(', '),
  submit_button: [
    'button[data-testid="send-button"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label="Enviar mensaje"]',
    'button[aria-label="Send"]',
    'form button[type="submit"]',
  ].join(', '),
  content_area: '[class*="markdown"]',
  input_container: 'form',
}

const GEMINI_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'div.ql-editor[contenteditable="true"]',
    'rich-textarea .ql-editor',
    'rich-textarea div[contenteditable="true"]',
    '.ql-editor[contenteditable="true"]',
    'div.input-area-container [contenteditable="true"]',
    '[role="textbox"]',
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="Enviar"]',
    'button.send-button',
    'button[data-at="send"]',
    'button[jsaction*="click"]',
  ].join(', '),
  content_area: '.response-container, .model-response, [role="article"]',
  input_container: 'form, [role="region"]',
}

const CLAUDE_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'div.ProseMirror[contenteditable="true"]',
    'fieldset div[contenteditable="true"]',
    'div[contenteditable="true"][translate="no"]',
    'div[contenteditable="true"]',
    '[role="textbox"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="Enviar"]',
    'button[data-testid="send-message"]',
    'fieldset button[type="button"]',
  ].join(', '),
  content_area: '[class*="Message"], .font-claude-message, [role="article"]',
  input_container: 'fieldset, .composer-container, form, [role="region"]',
}

const PERPLEXITY_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'textarea[placeholder*="Ask"]',
    'textarea[placeholder*="Follow"]',
    'textarea[placeholder*="Pregunt"]',
    'textarea',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'input[type="text"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="submit" i]',
    'button[aria-label*="send" i]',
    'button[aria-label*="enviar" i]',
    'button[type="submit"]',
    'button.bg-super',
    'button[data-testid*="send"]',
    'button[class*="submit"]',
  ].join(', '),
  content_area: '.prose, .markdown-content, [role="article"], .response',
  input_container: 'form, .input-group, .search-box, [role="region"]',
}

const COPILOT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'textarea#searchbox',
    'textarea[id*="userMessage"]',
    'textarea[placeholder*="message" i]',
    'textarea',
    'cib-text-input textarea',
    '[role="textbox"]',
    'div[contenteditable="true"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="submit" i]',
    'button[aria-label*="send" i]',
    'button[aria-label*="enviar" i]',
    'button[type="submit"]',
    'cib-text-input button',
    'button[class*="submit"]',
    '[data-testid*="send"]',
  ].join(', '),
  content_area: '.response-message, cib-message-group, [role="article"], .message-group',
  input_container: 'form, .input-container, cib-text-input, [role="region"]',
}

const PLATFORM_FALLBACK_SELECTORS: Record<string, PlatformSelectors> = {
  chatgpt: CHATGPT_FALLBACK_SELECTORS,
  gemini: GEMINI_FALLBACK_SELECTORS,
  claude: CLAUDE_FALLBACK_SELECTORS,
  perplexity: PERPLEXITY_FALLBACK_SELECTORS,
  copilot: COPILOT_FALLBACK_SELECTORS,
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

function findInputElementFallback(): HTMLElement | null {
  // Estrategia 1: Buscar textarea visible
  const textareas = Array.from(document.querySelectorAll<HTMLTextAreaElement>('textarea'))
  for (const ta of textareas) {
    if (ta.offsetHeight > 0 && getComputedStyle(ta).display !== 'none') {
      return ta
    }
  }

  // Estrategia 2: Buscar contenteditable visible más grande (suele ser el input)
  const editables = Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]'))
  let largestEditable: HTMLElement | null = null
  let largestArea = 0
  for (const el of editables) {
    if (el.offsetHeight > 0 && getComputedStyle(el).display !== 'none') {
      const area = el.offsetWidth * el.offsetHeight
      if (area > largestArea) {
        largestArea = area
        largestEditable = el
      }
    }
  }
  return largestEditable
}

let lastFoundSelector = ''

function getInputElement(): HTMLElement | null {
  // Primero intentar con selectores específicos de la plataforma
  if (selectors) {
    const selectorList = selectors.textarea.split(',').map((s) => s.trim())
    for (const sel of selectorList) {
      const el = document.querySelector<HTMLElement>(sel)
      if (el && el.offsetHeight > 0) {
        if (lastFoundSelector !== sel) {
          console.log(`[Guripa AI] Input encontrado con selector: "${sel}"`, el.tagName, el.id || el.className)
          lastFoundSelector = sel
        }
        return el
      }
    }
  }

  // Fallback: búsqueda genérica
  const fallback = findInputElementFallback()
  if (fallback) {
    if (lastFoundSelector !== 'fallback') {
      console.log('[Guripa AI] Input encontrado por fallback genérico:', fallback.tagName, fallback.id || fallback.className)
      lastFoundSelector = 'fallback'
    }
    return fallback
  }

  if (lastFoundSelector !== '') {
    console.log('[Guripa AI] Input perdido — ningún selector ni fallback encontró input visible')
    lastFoundSelector = ''
  }
  return null
}

function getInputText(): string {
  const el = getInputElement()
  if (!el) return ''
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return (el as HTMLInputElement).value
  }
  // contenteditable (Claude tiptap, ChatGPT ProseMirror, Gemini, etc.)
  return el.innerText || el.textContent || ''
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
  // Estrategia 1: Selectores específicos de la plataforma
  if (selectors) {
    const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
    for (const sel of selectorList) {
      const btn = document.querySelector<HTMLElement>(sel)
      if (btn && btn.offsetHeight > 0) return btn
    }
  }

  // Estrategia 2: Buscar dentro del form/container del input
  const input = getInputElement()
  if (input) {
    const form = input.closest('form')
    if (form) {
      // Buscar el último button visible (suele ser el de submit)
      const buttons = Array.from(form.querySelectorAll<HTMLElement>('button')).filter(
        (btn) => btn.offsetHeight > 0 && getComputedStyle(btn).display !== 'none',
      )
      if (buttons.length > 0) return buttons[buttons.length - 1]
    }
  }

  // Estrategia 3: Búsqueda genérica de botones cerca del input
  // Buscar en padres del input hasta encontrar un contenedor, luego buscar botones
  if (input) {
    let container = input.parentElement
    for (let i = 0; i < 5; i++) {
      if (!container) break
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('button')).filter(
        (btn) => btn.offsetHeight > 0 && getComputedStyle(btn).display !== 'none',
      )
      // Priorizar botones con atributos que indiquen submit
      const submitBtn = buttons.find(
        (btn) =>
          btn.getAttribute('aria-label')?.toLowerCase().includes('send') ||
          btn.getAttribute('aria-label')?.toLowerCase().includes('enviar') ||
          btn.getAttribute('data-testid')?.toLowerCase().includes('send') ||
          btn.textContent?.toLowerCase().includes('send') ||
          btn.textContent?.toLowerCase().includes('enviar'),
      )
      if (submitBtn) return submitBtn

      // Si no hay botón específico, devolver el último (generalmente es submit)
      if (buttons.length > 0) return buttons[buttons.length - 1]

      container = container.parentElement
    }
  }

  return null
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

  console.log('[Guripa AI] Usuario aceptó el riesgo, desbloqueando...')

  // Registrar el evento
  if (config.policyMode === 'warn') {
    sendEvent(buildPayload(lastScanResult, 'warned_sent', true))
  }

  // Desbloquear y permitir envío
  isBlocked = false

  // Quitar banner
  removeBanner()
  lastScanResult = null

  // Dar un tick para que el CSS se aplique y los botones se reactiven
  requestAnimationFrame(() => {
    console.log('[Guripa AI] Haciendo click en el botón de submit...')
    clickSubmitButton()
  })
}

// ============================================================================
// Escaneo en tiempo real
// ============================================================================

function runRealtimeScan(): void {
  const text = getInputText()
  const input = getInputElement()

  console.log('[Guripa AI DEBUG] Texto leído:', JSON.stringify(text))
  console.log('[Guripa AI DEBUG] Input element:', input?.tagName, input?.id || input?.className)

  // ─── Chequear si hay un archivo bloqueado (por fileInterceptor) ───
  const fileBlocked = (window as any).__guripaFileBlocked === true
  if (fileBlocked) {
    isBlocked = true
    console.log('[Guripa AI] 📌 Archivo bloqueado (por fileInterceptor), isBlocked = true')
    return
  }

  if (!text.trim() || !input) {
    if (lastScanResult?.hasMatches) {
      removeBanner()
    }
    lastScanResult = null
    lastScannedText = ''
    return
  }

  // Evitar scan redundante: si el texto es el mismo que el último escaneado, no hacer nada
  if (text === lastScannedText) {
    console.log('[Guripa AI DEBUG] Texto sin cambios, skipping scan')
    return
  }
  lastScannedText = text

  console.log('[Guripa AI DEBUG] enabledDetectors:', config?.enabledDetectors)
  console.log('[Guripa AI DEBUG] policyMode:', config?.policyMode)

  const result = scanText(text, {
    enabledDetectors: (config?.enabledDetectors ?? []) as DetectorType[],
    whitelistPatterns: config?.whitelistPatterns ?? [],
    userEmail: config?.userEmail ?? '',
    companyDomains: config?.companyDomains ?? [],
    whitelistDomains: config?.whitelistDomains ?? [],
  })

  console.log('[Guripa AI DEBUG] Resultado scan:', result.hasMatches, 'detections:', result.detections.length, 'riskLevel:', result.riskLevel)
  if (result.detections.length > 0) {
    console.log('[Guripa AI DEBUG] Detecciones:', result.detections.map(d => `${d.type}: ${d.value}`))
  }

  lastScanResult = result

  if (!result.hasMatches) {
    removeBanner()
    isBlocked = false
    console.log('[Guripa AI] Sin detecciones, desbloqueado')
    return
  }

  // ─── Modo monitor: solo registrar, no bloquear ───
  if (config?.policyMode === 'monitor') {
    // No mostrar banner ni bloquear botones
    console.log('[Guripa AI] Modo monitor: solo registrar')
    return
  }

  // ─── Severity info: banner informativo azul, sin bloquear nada ───
  if (result.maxSeverity === 'info') {
    isBlocked = false
    console.log('[Guripa AI] ℹ️ Info - Detecciones de baja severidad:', result.summary)
    updateInfoBanner(result, input, text)
    return
  }

  // ─── Severity warn: banner naranja de warning, SIN bloquear botones ───
  if (result.maxSeverity === 'warn') {
    isBlocked = false
    console.log('[Guripa AI] ⚠️ Warning - Datos sensibles detectados:', result.summary)
    sendEvent(buildPayload(result, 'warned_sent', false))
    updateBanner(result, input, {
      onAcceptRisk: undefined,
      mode: 'warn',
      sourceText: text,
    })
    return
  }

  // ─── Severity block: bloquear el envío ───
  isBlocked = true
  console.log('[Guripa AI] ⚠️ BLOQUEADO - Datos sensibles detectados:', result.summary)

  // ─── Modo block de política: banner sin botón de aceptar, botones deshabilitados ───
  // ─── Modo warn de política: banner con botón "Enviar de todos modos" ───
  const isBlock = config?.policyMode === 'block'
  updateBanner(result, input, {
    onAcceptRisk: isBlock ? undefined : handleAcceptRisk,
    sourceText: text,
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
    lastScannedText = ''
    isBlocked = false
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

function isClickOnSubmitButton(target: HTMLElement): boolean {
  // Verificar si el click es específicamente en el botón de envío
  // Permitir que sea un click en el botón mismo o dentro de él (por ej, en un icono dentro)

  const submitBtn = findSubmitButton()
  if (!submitBtn) return false

  // Verificar si el target es el botón de submit o está dentro de él
  return submitBtn === target || submitBtn.contains(target)
}

function handleClickEvent(event: Event): void {
  // Solo bloquear si está bloqueado Y el click es en el botón de ENVÍO
  if (!isBlocked) return
  if (!(event.target instanceof HTMLElement)) return

  const target = event.target as HTMLElement

  // Bloquear SOLO si el click es en el botón de submit
  if (isClickOnSubmitButton(target)) {
    console.log('[Guripa AI] ⛔ BLOQUEANDO click en botón de envío')
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }
}

function handleKeydownEvent(event: KeyboardEvent): void {
  // Solo bloquear Enter en el textarea/input del mensaje cuando está bloqueado
  if (!isBlocked) return
  if (!(event.target instanceof HTMLElement)) return
  if (event.key !== 'Enter' && event.keyCode !== 13) return

  const target = event.target as HTMLElement
  const inputElement = getInputElement()

  // Solo bloquear si es Enter en el textarea principal
  if (target === inputElement || inputElement?.contains(target)) {
    // Permitir Shift+Enter (nueva línea)
    if (!event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      console.log('[Guripa AI] Enter bloqueado en textarea — esperando aprobación del usuario')
    }
  }
}

function handleSubmitEvent(event: Event): void {
  // Si está bloqueado, prevenir submit de formularios
  if (!isBlocked) return
  if (!(event.target instanceof HTMLFormElement)) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
  console.log('[Guripa AI] Submit bloqueado — esperando aprobación del usuario')
}

function startPolling(): void {
  if (pollingInterval !== null) return
  pollingInterval = setInterval(() => {
    if (!config?.enabled) return
    // Si hay un debounce pendiente, no hacer nada (el debounce se ejecutará en breve)
    if (debounceTimer !== null) return

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
  document.addEventListener('click', handleClickEvent, { capture: true })
  document.addEventListener('keydown', handleKeydownEvent, { capture: true })
  document.addEventListener('submit', handleSubmitEvent, { capture: true })
  startPolling()
  console.log('[Guripa AI] Listeners registrados (input, paste, drop, click, keydown, submit, polling)')
}

// ============================================================================
// Interceptores de fetch() y XMLHttpRequest (última línea de defensa)
// ============================================================================

function isChatsendUrl(url: string): boolean {
  const chatPatterns = [
    // ChatGPT
    /api\.openai\.com\/v1\/messages/,
    /chatgpt\.com\/backend-api\/conversation/,
    // Claude
    /claude\.ai\/api\/organizations.*\/chat_conversations.*\/completion/,
    /claude\.ai\/api\/append_message/,
    // Gemini
    /gemini\.google\.com.*\/BardChatUi/,
    /generativelanguage\.googleapis\.com/,
    // Copilot
    /copilot\.microsoft\.com\/c\/api\/chat/,
    /sydney\.bing\.com\/sydney\/ChatSydney/,
    // Perplexity
    /perplexity\.ai\/api\/ask/,
    /perplexity\.ai\/socket\.io/,
  ]
  return chatPatterns.some((pattern) => pattern.test(url))
}

function interceptFetch(): void {
  const originalFetch = window.fetch

  window.fetch = function (this: any, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (!isBlocked) {
      return originalFetch.apply(this, arguments as any)
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url ?? ''
    const method = (init?.method ?? 'GET').toUpperCase()

    if ((method === 'POST' || method === 'PUT') && isChatsendUrl(url)) {
      console.log('[Guripa AI] ⛔ BLOQUEANDO fetch POST/PUT a:', url)
      if (lastScanResult?.hasMatches) {
        sendEvent(buildPayload(lastScanResult, 'blocked', false))
      }

      // Retornar un response fake 403
      return Promise.resolve(
        new Response(JSON.stringify({ error: 'Blocked by Guripa AI' }), {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    return originalFetch.apply(this, arguments as any)
  } as any
}

function interceptXHR(): void {
  const originalOpen = XMLHttpRequest.prototype.open

  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    if (isBlocked && (method === 'POST' || method === 'PUT') && isChatsendUrl(url.toString())) {
      console.log('[Guripa AI] ⛔ BLOQUEANDO XMLHttpRequest', method, 'a:', url)

      // Sobrescribir el método send para no hacer nada
      const originalSend = this.send
      this.send = function (): void {
        if (lastScanResult?.hasMatches) {
          sendEvent(buildPayload(lastScanResult, 'blocked', false))
        }
        // Simular error 403
        ;(this as any).status = 403
        ;(this as any).statusText = 'Forbidden'
        ;(this as any).responseText = JSON.stringify({ error: 'Blocked by Guripa AI' })
        if (this.onreadystatechange) this.onreadystatechange(new Event('readystatechange'))
      }
      return
    }

    return originalOpen.apply(this, [method, url, async ?? true, username, password])
  }
}

// ============================================================================
// MutationObserver — detectar aparición/desaparición del input (SPA)
// ============================================================================

let inputContentObserver: MutationObserver | null = null

function observeInputContent(input: HTMLElement): void {
  // Desconectar observer previo si existe
  if (inputContentObserver) {
    inputContentObserver.disconnect()
    inputContentObserver = null
  }

  // Observar cambios de contenido en el input (cubre cambios no originados por teclado)
  inputContentObserver = new MutationObserver(() => {
    if (!config?.enabled) return
    debouncedScan()
  })

  inputContentObserver.observe(input, {
    childList: true,
    subtree: true,
    characterData: true,
  })
}

function startObserver(): void {
  let lastInputFound = false

  const check = (): void => {
    const input = getInputElement()
    const found = input !== null

    if (found && !lastInputFound) {
      console.log('[Guripa AI] Input encontrado:', input?.tagName, input?.id || input?.className)
      // Observar cambios de contenido en el input
      observeInputContent(input!)
      // Escaneo inicial si el input ya tiene texto
      const text = getInputText()
      if (text.trim()) {
        console.log('[Guripa AI] Texto preexistente detectado, escaneando...')
        runRealtimeScan()
      }
    } else if (!found && lastInputFound) {
      console.log('[Guripa AI] Input perdido (navegación SPA)')
      removeBanner()
      lastScanResult = null
      lastScannedText = ''
      lastPolledText = ''
      lastInputText = ''
      if (inputContentObserver) {
        inputContentObserver.disconnect()
        inputContentObserver = null
      }
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
  // Interceptar fetch/XHR desde el inicio — solo bloquean cuando isBlocked === true
  interceptFetch()
  interceptXHR()

  console.log('[Guripa AI] hostname:', window.location.hostname)
  platform = detectPlatform()

  if (platform === 'unknown') {
    console.log('[Guripa AI] Plataforma desconocida, no se inicializa')
    return
  }

  try {
    config = await new Promise<ExtensionConfig>((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, resolve)
    })
  } catch {
    console.warn('[Guripa AI] No se pudo obtener la configuración')
    return
  }

  if (!config?.enabled) {
    console.log('[Guripa AI] Extensión desactivada')
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
    selectors = PLATFORM_FALLBACK_SELECTORS[platform] ?? null
    if (selectors) console.log(`[Guripa AI] Usando selectores de fallback para ${platform}`)
  }

  attachAllListeners()
  startObserver()

  // Inicializar file interceptor
  await initFileInterceptor(config, platform)

  // Iniciar health check de selectores
  startHealthCheck(platform, selectors)

  console.log('[Guripa AI] Interceptor activo en', platform)
}

init()
