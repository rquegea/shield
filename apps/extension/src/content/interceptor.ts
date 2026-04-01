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
let lastPolledText: string = ''
let pollingInterval: ReturnType<typeof setInterval> | null = null
let isBlocked = false // Estado de bloqueo global

const DEBOUNCE_MS = 500
const PASTE_DELAY_MS = 100
const POLLING_INTERVAL_MS = 2000

// Selectores de fallback por plataforma (abril 2026)
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

const GEMINI_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'rich-textarea .ql-editor',
    '.ql-editor[contenteditable="true"]',
    '[role="textbox"]',
    'div[contenteditable="true"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
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
    'div[contenteditable="true"]',
    '[role="textbox"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[data-testid="send-message"]',
  ].join(', '),
  content_area: '[class*="Message"], .font-claude-message, [role="article"]',
  input_container: '.composer-container, form, [role="region"]',
}

const PERPLEXITY_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'textarea',
    'textarea[placeholder*="Ask"]',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    '.py-3 textarea',
    'input[type="text"]',
  ].join(', '),
  submit_button: [
    'button[aria-label*="submit" i]',
    'button[aria-label*="send" i]',
    'button[type="submit"]',
    'button.bg-super',
    'button[data-testid*="send"]',
    'button[class*="submit"]',
    'button:has-text("Search")',
    '.input-group button',
  ].join(', '),
  content_area: '.prose, .markdown-content, [role="article"], .response',
  input_container: 'form, .input-group, .search-box, [role="region"]',
}

const COPILOT_FALLBACK_SELECTORS: PlatformSelectors = {
  textarea: [
    'textarea#searchbox',
    'textarea',
    'cib-text-input textarea',
    'textarea[id*="input"]',
    '[role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="Ask"]',
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

function getInputElement(): HTMLElement | null {
  // Primero intentar con selectores específicos de la plataforma
  if (selectors) {
    const selectorList = selectors.textarea.split(',').map((s) => s.trim())
    for (const sel of selectorList) {
      const el = document.querySelector<HTMLElement>(sel)
      if (el && el.offsetHeight > 0) return el
    }
  }

  // Fallback: búsqueda genérica
  const fallback = findInputElementFallback()
  if (fallback) {
    console.log('[Guripa AI] Input encontrado por fallback genérico:', fallback.tagName)
    return fallback
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

  // ─── Modo block y warn: bloquear el envío ───
  isBlocked = true
  console.log('[Guripa AI] ⚠️ BLOQUEADO - Datos sensibles detectados:', result.summary)

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

function isInBanner(element: HTMLElement): boolean {
  // Verificar si el elemento está dentro del banner de Guripa AI
  let el: HTMLElement | null = element
  while (el) {
    if (el.tagName === 'SHIELDAI-BANNER') return true
    el = el.parentElement
  }
  return false
}

function isNearInput(element: HTMLElement): boolean {
  // Comprobar si el elemento clickeado está dentro del mismo contenedor que el input
  const input = getInputElement()
  if (!input) return false

  // Subir hasta 8 niveles del elemento clickeado buscando un contenedor
  let container = element.parentElement
  for (let i = 0; i < 8; i++) {
    if (!container) break
    // Si encontramos el input o un ancestro del input, está "cerca"
    if (container.contains(input) || container === input) return true
    container = container.parentElement
  }

  return false
}

function handleClickEvent(event: Event): void {
  // Si está bloqueado, prevenir clicks en botones de envío
  if (!isBlocked) return
  if (!(event.target instanceof HTMLElement)) return

  const target = event.target as HTMLElement

  // No bloquear clicks dentro del banner
  if (isInBanner(target)) return

  // Buscar si el click está en un botón (o dentro de uno)
  // Incluir [jsaction] para Gemini y otras plataformas
  const button = target.closest('button') ||
                 target.closest('[role="button"]') ||
                 target.closest('[jsaction]')

  if (button && isNearInput(button)) {
    console.log('[Guripa AI] ⛔ BLOQUEANDO click en botón:', button.textContent?.slice(0, 50))
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    return
  }
}

function handleKeydownEvent(event: KeyboardEvent): void {
  // Si está bloqueado, prevenir Enter en textarea/input
  if (!isBlocked) return
  if (!(event.target instanceof HTMLElement)) return

  // No bloquear si estamos dentro del banner
  if (isInBanner(event.target)) return

  const target = event.target as HTMLElement
  const isInput = target instanceof HTMLTextAreaElement ||
                  target instanceof HTMLInputElement ||
                  target.getAttribute('contenteditable') === 'true' ||
                  target.getAttribute('role') === 'textbox'

  // Prevenir TODO Enter excepto Shift+Enter (que es para nueva línea)
  if (isInput && (event.key === 'Enter' || event.keyCode === 13)) {
    // Permitir Shift+Enter para nueva línea
    if (!event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      console.log('[Guripa AI] Enter bloqueado — esperando aprobación del usuario')
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
  // URLs de chat por plataforma
  const chatPatterns = [
    /\/backend-api\/conversation/, // ChatGPT
    /\/batchexecute/, // Gemini
    /\/api\/.*\/chat/, // Claude
    /\/api\/ask/, // Perplexity
    /\/turing\/conversation/, // Copilot
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

function startObserver(): void {
  let lastInputFound = false

  const check = (): void => {
    const input = getInputElement()
    const found = input !== null

    if (found && !lastInputFound) {
      console.log('[Guripa AI] Input encontrado:', input?.tagName, input?.id || input?.className)
    } else if (!found && lastInputFound) {
      console.log('[Guripa AI] Input perdido (navegación SPA)')
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
  interceptFetch()
  interceptXHR()

  // Inicializar file interceptor
  await initFileInterceptor(config, platform)

  // Iniciar health check de selectores
  startHealthCheck(platform, selectors)

  console.log('[Guripa AI] Interceptor activo en', platform)
}

init()
