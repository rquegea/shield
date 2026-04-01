// Health check para detectar cuando los selectores CSS dejan de funcionar
// Se ejecuta periódicamente y notifica al backend si los selectores no encuentran elementos

import type { PlatformSelectors } from '../types'

const INITIAL_DELAY_MS = 30_000 // 30 segundos después de init()
const RETRY_INTERVAL_MS = 10_000 // 10 segundos entre reintentos
const MAX_RETRIES = 3
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos entre checks periódicos

interface SelectorHealthStatus {
  status: 'ok' | 'fail'
  lastCheck: number
  missingElements: Array<'textarea' | 'submit_button'>
}

function sendHealthReport(
  platform: string,
  missingElements: Array<'textarea' | 'submit_button'>,
  selectorsUsed: PlatformSelectors,
): void {
  chrome.runtime.sendMessage({
    type: 'SELECTOR_HEALTH_FAIL',
    platform,
    missingElements,
    selectorsUsed,
    timestamp: Date.now(),
  })
}

function findInputElementBySelectors(selectors: PlatformSelectors): HTMLElement | null {
  const selectorList = selectors.textarea.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el && el.offsetHeight > 0) return el
  }
  return null
}

function findSubmitButtonBySelectors(selectors: PlatformSelectors): HTMLElement | null {
  const selectorList = selectors.submit_button.split(',').map((s) => s.trim())
  for (const sel of selectorList) {
    const btn = document.querySelector<HTMLElement>(sel)
    if (btn && btn.offsetHeight > 0) return btn
  }
  return null
}

async function runHealthCheck(
  platform: string,
  selectors: PlatformSelectors,
  retryCount: number = 0,
): Promise<void> {
  const inputFound = findInputElementBySelectors(selectors) !== null
  const buttonFound = findSubmitButtonBySelectors(selectors) !== null

  if (inputFound && buttonFound) {
    // ✅ Todo bien
    await chrome.storage.local.set({
      selectorHealth: {
        [platform]: {
          status: 'ok',
          lastCheck: Date.now(),
          missingElements: [],
        } as SelectorHealthStatus,
      },
    })
    console.log(`[Guripa AI] Health check OK para ${platform}`)
    return
  }

  const missingElements: Array<'textarea' | 'submit_button'> = []
  if (!inputFound) missingElements.push('textarea')
  if (!buttonFound) missingElements.push('submit_button')

  if (retryCount < MAX_RETRIES) {
    // Reintentar en 10 segundos
    console.log(`[Guripa AI] Health check falló en ${platform}, reintentando en ${RETRY_INTERVAL_MS}ms (intento ${retryCount + 1}/${MAX_RETRIES})`)
    setTimeout(() => runHealthCheck(platform, selectors, retryCount + 1), RETRY_INTERVAL_MS)
    return
  }

  // ❌ Falló después de 3 reintentos
  console.warn(`[Guripa AI] ⚠️ Health check FALLÓ definitivamente para ${platform}:`, missingElements)

  await chrome.storage.local.set({
    selectorHealth: {
      [platform]: {
        status: 'fail',
        lastCheck: Date.now(),
        missingElements,
      } as SelectorHealthStatus,
    },
  })

  // Notificar al background script
  sendHealthReport(platform, missingElements, selectors)
}

export function startHealthCheck(platform: string, selectors: PlatformSelectors | null): void {
  if (!selectors) {
    console.log(`[Guripa AI] Sin selectores para ${platform}, health check omitido`)
    return
  }

  // Ejecutar el primer check después de 30 segundos
  setTimeout(() => {
    console.log(`[Guripa AI] Iniciando health check para ${platform}`)
    runHealthCheck(platform, selectors)
  }, INITIAL_DELAY_MS)

  // Checks periódicos cada 5 minutos
  setInterval(() => {
    runHealthCheck(platform, selectors)
  }, CHECK_INTERVAL_MS)
}
