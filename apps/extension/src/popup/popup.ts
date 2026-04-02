// Popup — estado de la extensión, conexión al backend, info de la org

import type { ExtensionConfig } from '../types'

// --- Elementos del DOM ---

const statusPill = document.getElementById('status-pill') as HTMLDivElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const healthWarning = document.getElementById('health-warning') as HTMLDivElement
const infoSection = document.getElementById('info-section') as HTMLDivElement
const connectSection = document.getElementById('connect-section') as HTMLDivElement
const orgNameEl = document.getElementById('org-name') as HTMLDivElement
const policyModeEl = document.getElementById('policy-mode') as HTMLDivElement
const eventsTodayEl = document.getElementById('events-today') as HTMLDivElement
const detectorsCountEl = document.getElementById('detectors-count') as HTMLDivElement
const platformsCountEl = document.getElementById('platforms-count') as HTMLDivElement
const chartTotalEl = document.getElementById('chart-total') as HTMLSpanElement
const chartSvg = document.getElementById('weekly-chart') as unknown as SVGSVGElement
const chartDaysEl = document.getElementById('chart-days') as HTMLDivElement
const urlInput = document.getElementById('url-input') as HTMLInputElement
const tokenInput = document.getElementById('token-input') as HTMLInputElement
const connectBtn = document.getElementById('connect-btn') as HTMLButtonElement
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement
const dashboardBtn = document.getElementById('dashboard-btn') as HTMLButtonElement
const feedbackEl = document.getElementById('feedback') as HTMLDivElement
const domainTagsEl = document.getElementById('domain-tags') as HTMLDivElement
const domainInput = document.getElementById('domain-input') as HTMLInputElement
const addDomainBtn = document.getElementById('add-domain-btn') as HTMLButtonElement
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement

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

// --- Day labels ---

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// --- Weekly chart ---

function renderWeeklyChart(data: number[]): void {
  const max = Math.max(...data, 1)
  const total = data.reduce((a, b) => a + b, 0)
  chartTotalEl.textContent = `${total} evento${total !== 1 ? 's' : ''}`

  const barWidth = 36
  const gap = 8
  const height = 50

  let bars = ''
  for (let i = 0; i < 7; i++) {
    const value = data[i] ?? 0
    const barHeight = Math.max((value / max) * (height - 4), 2)
    const x = i * (barWidth + gap)
    const y = height - barHeight
    const opacity = value > 0 ? 0.85 : 0.15
    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="#3b82f6" opacity="${opacity}">
      <animate attributeName="height" from="0" to="${barHeight}" dur="0.4s" begin="${i * 0.05}s" fill="freeze"/>
      <animate attributeName="y" from="${height}" to="${y}" dur="0.4s" begin="${i * 0.05}s" fill="freeze"/>
    </rect>`
  }
  chartSvg.innerHTML = bars

  // Day labels
  const today = new Date()
  let labels = ''
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    labels += `<span class="chart-day-label">${DAY_NAMES[d.getDay()]}</span>`
  }
  chartDaysEl.innerHTML = labels
}

// --- Platform count ---

function getPlatformCount(): number {
  // Count from manifest host_permissions (hardcoded since we know the platforms)
  return 6
}

// --- Detect current platform ---

function detectCurrentPlatform(): string | null {
  // Solo funciona si el popup se abre desde una pestaña de una plataforma conocida
  // Pero normalmente el popup se abre desde cualquier pestaña, así que esto es mostly informativo
  return null
}

// --- Mostrar UI según estado ---

function showConnected(config: ExtensionConfig, orgName: string, eventsToday: number, weeklyData: number[], selectorHealth?: Record<string, { status: 'ok' | 'fail' }>): void {
  // Status pill
  if (!config.enabled) {
    statusPill.className = 'status-pill error'
    statusText.textContent = 'Protección pausada'
  } else {
    statusPill.className = 'status-pill connected'
    statusText.textContent = '● Protección activa'
  }

  // Health warning — mostrar si algún selector está en fail
  const hasHealthIssue = selectorHealth && Object.values(selectorHealth).some((h) => h.status === 'fail')
  if (hasHealthIssue) {
    healthWarning.classList.remove('hidden')
  } else {
    healthWarning.classList.add('hidden')
  }

  // Info cards
  orgNameEl.textContent = orgName || 'Organización'
  policyModeEl.textContent = MODE_LABELS[config.policyMode] ?? config.policyMode
  policyModeEl.className = `metric-value small-text ${MODE_CLASSES[config.policyMode] ?? ''}`
  eventsTodayEl.textContent = String(eventsToday)
  detectorsCountEl.textContent = String(config.enabledDetectors.length)
  platformsCountEl.textContent = String(getPlatformCount())
  toggleBtn.textContent = config.enabled ? 'Pausar protección' : 'Reanudar protección'

  // Weekly chart
  renderWeeklyChart(weeklyData)

  // Domain whitelist
  renderDomainTags(config.companyDomains ?? [], config.whitelistDomains ?? [])

  // Show/hide sections
  infoSection.classList.remove('hidden')
  connectSection.classList.add('hidden')
}

function showDisconnected(): void {
  statusPill.className = 'status-pill disconnected'
  statusText.textContent = 'No configurada'

  infoSection.classList.add('hidden')
  connectSection.classList.remove('hidden')

  feedbackEl.textContent = ''
  feedbackEl.className = 'feedback'
}

function showFeedback(message: string, type: 'success' | 'error'): void {
  if (type === 'error') {
    feedbackEl.textContent = message
    feedbackEl.className = 'feedback error shake'
    // Remove shake after animation
    setTimeout(() => feedbackEl.classList.remove('shake'), 400)
  } else {
    feedbackEl.innerHTML = `<span class="checkmark">✓</span> ${message}`
    feedbackEl.className = 'feedback success'
  }
}

function setConnecting(loading: boolean): void {
  connectBtn.disabled = loading
  connectBtn.textContent = loading ? 'Conectando...' : 'Conectar'
  if (loading) {
    statusPill.className = 'status-pill loading'
    statusText.textContent = 'Verificando conexión...'
  }
}

// --- Gestión de dominios whitelist ---

function renderDomainTags(companyDomains: string[], whitelistDomains: string[]): void {
  domainTagsEl.innerHTML = ''

  // Company domains (no removibles, vienen del servidor)
  for (const domain of companyDomains) {
    const tag = document.createElement('span')
    tag.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.25); border-radius: 6px; font-size: 11px; color: #60a5fa;'
    tag.textContent = domain
    domainTagsEl.appendChild(tag)
  }

  // Whitelist domains (removibles)
  for (const domain of whitelistDomains) {
    const tag = document.createElement('span')
    tag.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; background: rgba(148,163,184,0.12); border: 1px solid rgba(148,163,184,0.2); border-radius: 6px; font-size: 11px; color: #94a3b8; cursor: default;'
    tag.textContent = domain

    const removeBtn = document.createElement('span')
    removeBtn.textContent = '×'
    removeBtn.style.cssText = 'cursor: pointer; font-size: 13px; line-height: 1; opacity: 0.7;'
    removeBtn.addEventListener('click', () => removeDomain(domain))
    tag.appendChild(removeBtn)

    domainTagsEl.appendChild(tag)
  }

  if (companyDomains.length === 0 && whitelistDomains.length === 0) {
    domainTagsEl.innerHTML = '<span style="font-size: 11px; color: #475569;">Ninguno configurado</span>'
  }
}

async function addDomain(): Promise<void> {
  const domain = domainInput.value.trim().toLowerCase().replace(/^@/, '')
  if (!domain || !domain.includes('.')) return

  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const current = config.whitelistDomains ?? []
  if (current.includes(domain) || (config.companyDomains ?? []).includes(domain)) {
    domainInput.value = ''
    return
  }

  const updated = [...current, domain]
  await sendMessage({ type: 'UPDATE_WHITELIST_DOMAINS', domains: updated })
  domainInput.value = ''
  renderDomainTags(config.companyDomains ?? [], updated)
}

async function removeDomain(domain: string): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const updated = (config.whitelistDomains ?? []).filter((d: string) => d !== domain)
  await sendMessage({ type: 'UPDATE_WHITELIST_DOMAINS', domains: updated })
  renderDomainTags(config.companyDomains ?? [], updated)
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
  const userEmail = (result as Record<string, unknown>).userEmail as string ?? config.userEmail ?? ''
  const emailDomain = userEmail ? userEmail.split('@')[1] : ''
  const companyDomains = emailDomain
    ? [...new Set([emailDomain, ...(config.companyDomains ?? [])])]
    : config.companyDomains ?? []
  const updated: ExtensionConfig = {
    ...config,
    token,
    backendUrl,
    enabled: true,
    policyMode: (result.policyMode as ExtensionConfig['policyMode']) ?? config.policyMode,
    userEmail,
    companyDomains,
  }
  await chrome.storage.local.set({ config: updated })

  if (result.orgName) {
    await chrome.storage.local.set({ orgName: result.orgName })
  }

  // Forzar sincronización completa
  await sendMessage({ type: 'FORCE_SYNC' })

  // Recargar UI
  setConnecting(false)
  showFeedback('Conectado correctamente', 'success')
  setTimeout(() => loadAndRender(), 600)
}

async function handleToggle(): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  const updated: ExtensionConfig = { ...config, enabled: !config.enabled }
  await chrome.storage.local.set({ config: updated })
  await loadAndRender()
}

async function handleDashboard(): Promise<void> {
  const config = await sendMessage<ExtensionConfig>({ type: 'GET_CONFIG' })
  if (config.backendUrl) {
    chrome.tabs.create({ url: config.backendUrl })
  }
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
  const { data: weeklyData } = await sendMessage<{ data: number[] }>({ type: 'GET_WEEKLY_ACTIVITY' })
  const selectorHealth = await sendMessage<Record<string, { status: 'ok' | 'fail' }>>({ type: 'GET_SELECTOR_HEALTH' })

  showConnected(config, orgName as string, eventsToday, weeklyData ?? [0, 0, 0, 0, 0, 0, 0], selectorHealth)
}

// --- Event listeners ---

async function handleReset(): Promise<void> {
  await sendMessage({ type: 'RESET_CONFIG' })
  window.location.reload()
}

connectBtn.addEventListener('click', handleConnect)
toggleBtn.addEventListener('click', handleToggle)
dashboardBtn.addEventListener('click', handleDashboard)
resetBtn.addEventListener('click', handleReset)
addDomainBtn.addEventListener('click', addDomain)
domainInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addDomain()
})

// Enter en los inputs = conectar
tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleConnect()
})
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tokenInput.focus()
})

// --- Init ---

loadAndRender()
