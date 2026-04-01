// Popup — estado de la extensión, conexión al backend, info de la org

import type { ExtensionConfig } from '../types'

// --- Elementos del DOM ---

const statusBanner = document.getElementById('status-banner') as HTMLDivElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const infoSection = document.getElementById('info-section') as HTMLDivElement
const connectSection = document.getElementById('connect-section') as HTMLDivElement
const orgNameEl = document.getElementById('org-name') as HTMLDivElement
const policyModeEl = document.getElementById('policy-mode') as HTMLDivElement
const eventsTodayEl = document.getElementById('events-today') as HTMLDivElement
const detectorsCountEl = document.getElementById('detectors-count') as HTMLDivElement
const enabledStatusEl = document.getElementById('enabled-status') as HTMLDivElement
const urlInput = document.getElementById('url-input') as HTMLInputElement
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement
const disconnectBtn = document.getElementById('disconnect-btn') as HTMLButtonElement
const feedbackEl = document.getElementById('feedback') as HTMLDivElement

// --- Helpers de mensajes al service worker ---

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: T) => resolve(response))
  })
}

// --- Modos legibles ---

const MODE_LABELS: Record<string, string> = {
  warn: 'Advertencia',
  block: 'Bloqueo',
  monitor: 'Monitoreo',
}

const MODE_CLASSES: Record<string, string> = {
  warn: 'mode-warn',
  block: 'mode-block',
  monitor: 'mode-monitor',
}

// --- Mostrar UI según estado ---

function showConnected(config: ExtensionConfig, orgName: string, eventsToday: number): void {
  // Status banner
  if (!config.enabled) {
    statusBanner.className = 'status-banner error'
    statusText.textContent = 'Protección desactivada'
  } else {
    statusBanner.className = 'status-banner connected'
    statusText.textContent = 'Protección activa'
  }

  // Info cards
  orgNameEl.textContent = orgName || 'Organización'
  policyModeEl.textContent = MODE_LABELS[config.policyMode] ?? config.policyMode
  policyModeEl.className = `info-value ${MODE_CLASSES[config.policyMode] ?? ''}`
  eventsTodayEl.textContent = String(eventsToday)
  detectorsCountEl.textContent = String(config.enabledDetectors.length)
  enabledStatusEl.textContent = config.enabled ? 'Activa' : 'Pausada'
  toggleBtn.textContent = config.enabled ? 'Desactivar' : 'Activar'

  // Mostrar/ocultar secciones
  infoSection.classList.remove('hidden')
  connectSection.classList.add('hidden')
}

function showDisconnected(): void {
  statusBanner.className = 'status-banner disconnected'
  statusText.textContent = 'No configurada'

  infoSection.classList.add('hidden')
  connectSection.classList.remove('hidden')

  feedbackEl.textContent = ''
  feedbackEl.className = 'feedback'
}

function showFeedback(message: string, type: 'success' | 'error'): void {
  feedbackEl.textContent = message
  feedbackEl.className = `feedback ${type}`
}

function setConnecting(loading: boolean): void {
  connectBtn.disabled = loading
  connectBtn.textContent = loading ? 'Conectando...' : 'Conectar'
  if (loading) {
    statusBanner.className = 'status-banner loading'
    statusText.textContent = 'Verificando conexión...'
  }
}

// --- Acciones ---

async function handleConnect(): Promise<void> {
  const backendUrl = urlInput.value.trim().replace(/\/+$/, '')
  const token = tokenInput.value.trim()

  if (!backendUrl) {
    showFeedback('Introduce la URL del servidor', 'error')
    urlInput.focus()
    return
  }
  if (!token) {
    showFeedback('Introduce tu token de usuario', 'error')
    tokenInput.focus()
    return
  }

  setConnecting(true)
  feedbackEl.textContent = ''

  // Validar el token contra el backend
  const result = await sendMessage<{
    valid: boolean
    orgName?: string
    policyMode?: string
    error?: string
  }>({
    type: 'VALIDATE_TOKEN',
    backendUrl,
    token,
  })

  if (!result.valid) {
    setConnecting(false)
    showDisconnected()
    showFeedback(result.error ?? 'No se pudo conectar', 'error')
    return
  }

  // Token válido — guardar config
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const updated: ExtensionConfig = {
    ...config,
    token,
    backendUrl,
    enabled: true,
    policyMode: (result.policyMode as ExtensionConfig['policyMode']) ?? config.policyMode,
  }
  await chrome.storage.local.set({ config: updated })

  if (result.orgName) {
    await chrome.storage.local.set({ orgName: result.orgName })
  }

  // Forzar sincronización completa
  await sendMessage({ type: 'FORCE_SYNC' })

  // Recargar UI
  setConnecting(false)
  await loadAndRender()
}

async function handleToggle(): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const updated: ExtensionConfig = { ...config, enabled: !config.enabled }
  await chrome.storage.local.set({ config: updated })
  await loadAndRender()
}

async function handleDisconnect(): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const cleared: ExtensionConfig = {
    ...config,
    token: null,
    backendUrl: '',
  }
  await chrome.storage.local.set({ config: cleared })
  await chrome.storage.local.remove(['orgName'])
  showDisconnected()
  urlInput.value = ''
  tokenInput.value = ''
}

// --- Carga inicial ---

async function loadAndRender(): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })

  if (!config.token || !config.backendUrl) {
    showDisconnected()
    return
  }

  const { orgName = '' } = await chrome.storage.local.get(['orgName'])
  const { count: eventsToday } = await sendMessage<{ count: number }>({ type: 'GET_EVENTS_TODAY' })

  showConnected(config, orgName as string, eventsToday)
}

// --- Event listeners ---

connectBtn.addEventListener('click', handleConnect)
toggleBtn.addEventListener('click', handleToggle)
disconnectBtn.addEventListener('click', handleDisconnect)

// Enter en los inputs = conectar
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleConnect()
})
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tokenInput.focus()
})

// --- Init ---

loadAndRender()
