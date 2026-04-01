// Service worker — background script (Manifest V3)
// Gestiona comunicación entre content scripts ↔ backend
// Sincroniza config y selectores cada 6 horas

import type { ExtensionConfig, SelectorsCache, EventPayload } from '../types'

// --- Constantes ---

const DEFAULT_CONFIG: ExtensionConfig = {
  token: null,
  backendUrl: '',
  enabled: true,
  policyMode: 'warn',
  enabledDetectors: ['DNI', 'NIE', 'CIF', 'IBAN', 'CREDIT_CARD', 'SSN_SPAIN', 'PHONE_SPAIN', 'EMAIL', 'PASSPORT_SPAIN', 'NIF_PORTUGAL', 'CODICE_FISCALE', 'BIRTHDATE'],
  whitelistPatterns: [],
}

const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 horas

// --- Helpers de storage ---

async function getConfig(): Promise<ExtensionConfig> {
  const { config } = await chrome.storage.local.get(['config'])
  return (config as ExtensionConfig) ?? DEFAULT_CONFIG
}

async function saveConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ config })
}

// --- Contador local de eventos de hoy ---
// Se resetea al cambiar de día. Permite al popup mostrar "eventos hoy" sin llamar al backend.

interface DailyCounter {
  date: string // YYYY-MM-DD
  count: number
}

interface WeeklyActivity {
  [date: string]: number // YYYY-MM-DD → count
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

async function incrementEventsToday(): Promise<number> {
  const { eventsToday } = await chrome.storage.local.get(['eventsToday'])
  const counter = eventsToday as DailyCounter | undefined
  const today = todayString()

  const newCounter: DailyCounter = {
    date: today,
    count: counter?.date === today ? counter.count + 1 : 1,
  }

  await chrome.storage.local.set({ eventsToday: newCounter })

  // Also update weekly activity
  await incrementWeeklyActivity(today)

  return newCounter.count
}

async function incrementWeeklyActivity(date: string): Promise<void> {
  const { weeklyActivity = {} } = await chrome.storage.local.get(['weeklyActivity'])
  const activity = weeklyActivity as WeeklyActivity
  activity[date] = (activity[date] ?? 0) + 1

  // Prune entries older than 8 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 8)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  for (const key of Object.keys(activity)) {
    if (key < cutoffStr) delete activity[key]
  }

  await chrome.storage.local.set({ weeklyActivity: activity })
}

async function getWeeklyActivity(): Promise<number[]> {
  const { weeklyActivity = {} } = await chrome.storage.local.get(['weeklyActivity'])
  const activity = weeklyActivity as WeeklyActivity

  // Also count queued events by day
  const { eventQueue = [] } = await chrome.storage.local.get(['eventQueue'])
  const queue = eventQueue as QueuedEvent[]
  const queueByDay: WeeklyActivity = {}
  for (const item of queue) {
    const day = new Date(item.timestamp).toISOString().slice(0, 10)
    queueByDay[day] = (queueByDay[day] ?? 0) + 1
  }

  const result: number[] = []
  const today = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    result.push((activity[key] ?? 0) + (queueByDay[key] ?? 0))
  }
  return result
}

async function getEventsToday(): Promise<number> {
  const { eventsToday } = await chrome.storage.local.get(['eventsToday'])
  const counter = eventsToday as DailyCounter | undefined
  if (!counter || counter.date !== todayString()) return 0
  return counter.count
}

// --- Inicialización ---

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(['config'])
  if (!stored.config) {
    await chrome.storage.local.set({ config: DEFAULT_CONFIG })
  }
  console.log('[Guripa AI] Extensión instalada')
  syncAll()
})

// --- Sincronización de selectores (público, sin auth) ---

async function syncSelectors(): Promise<void> {
  const config = await getConfig()
  if (!config.backendUrl) return

  try {
    const response = await fetch(`${config.backendUrl}/api/selectors`)
    if (!response.ok) {
      console.warn('[Guripa AI] Selectores: respuesta', response.status)
      return
    }

    const data = await response.json() as { selectors: SelectorsCache }
    await chrome.storage.local.set({
      selectors: data.selectors,
      selectorsLastSync: Date.now(),
    })
    console.log('[Guripa AI] Selectores sincronizados')
  } catch (err) {
    console.warn('[Guripa AI] Error sincronizando selectores:', err)
  }
}

// --- Sincronización de config de la organización ---
// GET /api/config devuelve: policyMode, enabledDetectors, whitelistPatterns, orgName

interface ServerConfigResponse {
  policyMode?: 'warn' | 'block' | 'monitor'
  enabledDetectors?: string[]
  whitelistPatterns?: string[]
  orgName?: string
}

async function syncConfig(): Promise<void> {
  const config = await getConfig()
  if (!config.backendUrl || !config.token) return

  try {
    const response = await fetch(`${config.backendUrl}/api/config`, {
      headers: { Authorization: `Bearer ${config.token}` },
    })
    if (!response.ok) {
      console.warn('[Guripa AI] Config: respuesta', response.status)
      return
    }

    const serverConfig = await response.json() as ServerConfigResponse
    const merged: ExtensionConfig = {
      ...config,
      policyMode: serverConfig.policyMode ?? config.policyMode,
      enabledDetectors: serverConfig.enabledDetectors ?? config.enabledDetectors,
      whitelistPatterns: serverConfig.whitelistPatterns ?? config.whitelistPatterns,
    }
    await saveConfig(merged)

    // Guardar nombre de org por separado para el popup
    if (serverConfig.orgName) {
      await chrome.storage.local.set({ orgName: serverConfig.orgName })
    }

    console.log('[Guripa AI] Configuración sincronizada')
  } catch (err) {
    console.warn('[Guripa AI] Error sincronizando config:', err)
  }
}

async function syncAll(): Promise<void> {
  await Promise.all([syncSelectors(), syncConfig()])
}

// Sincronizar al arrancar
syncAll()

// Sincronizar cada 6 horas
setInterval(syncAll, SYNC_INTERVAL_MS)

// --- Envío de eventos al backend ---
// POST /api/events con extension_token en Authorization header

async function sendEventToBackend(payload: EventPayload): Promise<{ ok: boolean; error?: string }> {
  const config = await getConfig()
  if (!config.backendUrl || !config.token) {
    return { ok: false, error: 'No configurado' }
  }

  try {
    const response = await fetch(`${config.backendUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        platform: payload.platform,
        detection_types: payload.detection_types,
        detection_count: payload.detection_count,
        risk_level: payload.risk_level,
        action_taken: payload.action_taken,
        content_preview: payload.content_preview,
        user_accepted_risk: payload.user_accepted_risk,
        metadata: payload.metadata,
      }),
    })

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` }
    }

    return { ok: true }
  } catch (err) {
    console.error('[Guripa AI] Error enviando evento:', err)
    return { ok: false, error: String(err) }
  }
}

// --- Cola de reintentos para eventos fallidos ---
// Si el backend no está disponible, guardamos el evento para reintentarlo después

interface QueuedEvent {
  payload: EventPayload
  retries: number
  timestamp: number
}

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 30_000 // 30 segundos

async function enqueueFailedEvent(payload: EventPayload): Promise<void> {
  const { eventQueue = [] } = await chrome.storage.local.get(['eventQueue'])
  const queue = eventQueue as QueuedEvent[]

  // Limitar cola a 50 eventos para no llenar storage
  if (queue.length >= 50) queue.shift()

  queue.push({ payload, retries: 0, timestamp: Date.now() })
  await chrome.storage.local.set({ eventQueue: queue })
}

async function processEventQueue(): Promise<void> {
  const { eventQueue = [] } = await chrome.storage.local.get(['eventQueue'])
  const queue = eventQueue as QueuedEvent[]
  if (queue.length === 0) return

  const remaining: QueuedEvent[] = []

  for (const item of queue) {
    const result = await sendEventToBackend(item.payload)
    if (!result.ok && item.retries < MAX_RETRIES) {
      remaining.push({ ...item, retries: item.retries + 1 })
    }
    // Si ok o max retries alcanzado, se descarta
  }

  await chrome.storage.local.set({ eventQueue: remaining })

  if (remaining.length > 0) {
    console.log(`[Guripa AI] ${remaining.length} eventos pendientes de reintento`)
  }
}

// Reintentar eventos fallidos periódicamente
setInterval(processEventQueue, RETRY_DELAY_MS)

// --- Validación de token contra el backend ---
// Usada por el popup para verificar la conexión

interface ValidateResult {
  valid: boolean
  orgName?: string
  policyMode?: string
  error?: string
}

async function validateToken(backendUrl: string, token: string): Promise<ValidateResult> {
  try {
    const response = await fetch(`${backendUrl}/api/config`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Token inválido' }
      }
      return { valid: false, error: `Error del servidor (${response.status})` }
    }

    const data = await response.json() as ServerConfigResponse & { orgName?: string }
    return {
      valid: true,
      orgName: data.orgName,
      policyMode: data.policyMode,
    }
  } catch {
    return { valid: false, error: 'No se puede conectar al servidor' }
  }
}

// --- Manejo de mensajes del content script y popup ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Content script envía evento de detección
  if (message.type === 'SEND_EVENT') {
    const payload = message.payload as EventPayload
    incrementEventsToday().then(() => {
      return sendEventToBackend(payload)
    }).then((result) => {
      if (!result.ok) {
        enqueueFailedEvent(payload)
      }
      sendResponse(result)
    })
    return true
  }

  // Content script o popup piden la config
  if (message.type === 'GET_CONFIG') {
    getConfig().then(sendResponse)
    return true
  }

  // Content script pide selectores
  if (message.type === 'GET_SELECTORS') {
    chrome.storage.local.get(['selectors']).then((result) => {
      sendResponse(result.selectors ?? {})
    })
    return true
  }

  // Popup pide el contador de eventos de hoy
  if (message.type === 'GET_EVENTS_TODAY') {
    getEventsToday().then((count) => sendResponse({ count }))
    return true
  }

  // Popup pide actividad semanal
  if (message.type === 'GET_WEEKLY_ACTIVITY') {
    getWeeklyActivity().then((data) => sendResponse({ data }))
    return true
  }

  // Popup pide validar token contra el backend
  if (message.type === 'VALIDATE_TOKEN') {
    const { backendUrl, token } = message as { backendUrl: string; token: string; type: string }
    validateToken(backendUrl, token).then(sendResponse)
    return true
  }

  // Popup pide forzar sincronización
  if (message.type === 'FORCE_SYNC') {
    syncAll().then(() => sendResponse({ ok: true }))
    return true
  }

  return false
})

console.log('[Guripa AI] Service worker initialized')
