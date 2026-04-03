// Content script — interceptor de subida de archivos
// Detecta datos sensibles en archivos que se suben a plataformas de IA

import { scanText, maskValue } from '@shieldai/detectors'
import type { ScanResult, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, EventPayload } from '../types'
import { showWarningModal } from './ui/WarningModal'
import { blockSending, unblockSending } from './interceptor'
import { blockFileAttachment, removeBanner } from './ui/InlineBanner'
import JSZip from 'jszip'
import * as pdfjsLib from 'pdfjs-dist'

// ============================================================================
// Estado global
// ============================================================================

let config: ExtensionConfig | null = null
let platform: string = 'unknown'

// ============================================================================
// Tipos internos
// ============================================================================

interface FileCheckResult {
  shouldBlock: boolean
  scanResult: ScanResult | null
}

// ============================================================================
// Detección de tipo de archivo
// ============================================================================

function getFileType(filename: string): 'text' | 'csv' | 'tsv' | 'pdf' | 'excel' | 'docx' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (['txt', 'md', 'json', 'log'].includes(ext)) return 'text'
  if (ext === 'csv') return 'csv'
  if (ext === 'tsv') return 'tsv'
  if (['xlsx', 'xls'].includes(ext)) return 'excel'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  return 'unknown'
}

// ============================================================================
// Lectura de archivos
// ============================================================================

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('FileReader returned non-string'))
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

async function extractPdfText(file: File): Promise<string> {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.mjs')

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise
    const texts: string[] = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      texts.push(content.items.map((item: unknown) => (item as { str: string }).str).join(' '))
    }

    const extracted = texts.join('\n')
    console.log('[Guripa AI] PDF texto extraído (pdf.js):', extracted.length, 'caracteres')
    return extracted
  } catch (err) {
    console.warn('[Guripa AI] PDF.js falló:', err)
    return ''
  }
}

async function readDocxAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const arrayBuffer = reader.result
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          reject(new Error('FileReader returned non-ArrayBuffer'))
          return
        }

        // Descomprimir el ZIP
        const zip = new JSZip()
        await zip.loadAsync(arrayBuffer)

        // Extraer word/document.xml
        const documentXml = zip.file('word/document.xml')
        if (!documentXml) {
          console.log('[Guripa AI] No se encontró word/document.xml en el .docx')
          resolve('')
          return
        }

        const xmlString = await documentXml.async('string')

        // Parsear el XML
        const parser = new DOMParser()
        const doc = parser.parseFromString(xmlString, 'text/xml')

        // Buscar todos los elementos <w:t> y extraer el texto
        const textElements = doc.getElementsByTagName('w:t')
        const textParts: string[] = []

        for (let i = 0; i < textElements.length; i++) {
          const text = textElements[i].textContent
          if (text) {
            textParts.push(text)
          }
        }

        const extractedText = textParts.join(' ')
        console.log(`[Guripa AI] Texto extraído del .docx: ${extractedText.length} caracteres`)
        resolve(extractedText)
      } catch (err) {
        console.warn('[Guripa AI] Error descomprimiendo/parseando .docx:', err)
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

// ============================================================================
// Utilidades para eventos
// ============================================================================

function buildContentPreview(result: ScanResult): string {
  return result.detections.map((d) => `${d.type} (${maskValue(d.value)})`).join(', ')
}

function sendEvent(payload: EventPayload): void {
  chrome.runtime.sendMessage({ type: 'SEND_EVENT', payload })
}

function buildPayload(
  result: ScanResult | null,
  action: EventPayload['action_taken'],
  accepted: boolean,
  filename: string,
  fileType?: string,
): EventPayload {
  return {
    platform,
    detection_types: result?.detections.map((d) => d.type) ?? [],
    detection_count: result?.detections.length ?? 0,
    risk_level: result?.riskLevel ?? 'none',
    action_taken: action,
    content_preview: result ? buildContentPreview(result) : '',
    user_accepted_risk: accepted,
    metadata: {
      source: 'file_upload',
      filename: filename,
      fileType: fileType,
    },
  }
}

// ============================================================================
// Selectores de dismiss para archivos (solo los que funcionan probados)
// ============================================================================

const FILE_DISMISS_SELECTORS: Record<string, string[]> = {
  chatgpt: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Eliminar archivo"]',
    '[class*="attachment"] button[class*="close"]',
  ],
  gemini: [
    'button[aria-label="Remove"]',
    'button[aria-label="Quitar archivo"]',
    '[class*="attachment"] button[class*="cancel"]',
    '[class*="chip"] button[class*="close"]',
    '[class*="chip"] button[class*="remove"]',
  ],
  claude: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Eliminar archivo"]',
    '[class*="attachment"] button[class*="remove"]',
  ],
  perplexity: [
    'button[aria-label="Remove"]',
    '[class*="attachment"] button[class*="close"]',
  ],
  copilot: [
    'button[aria-label="Remove file"]',
    '[class*="attachment"] button[class*="close"]',
  ],
}

// ============================================================================
// Dismiss automático UNA vez con selectores directos + validación DOM
// ============================================================================

async function tryAutoDismiss(filename?: string): Promise<boolean> {
  const selectors = FILE_DISMISS_SELECTORS[platform] ?? []
  if (selectors.length === 0) {
    console.log('[Guripa AI] ⚠️ No hay selectores de dismiss para', platform)
    return false
  }

  // Timeout específico por plataforma (Gemini es más lento)
  const timeout = platform === 'gemini' ? 800 : 500

  for (const selector of selectors) {
    const btn = document.querySelector<HTMLElement>(selector)
    if (!btn || btn.offsetHeight <= 0) {
      continue
    }

    console.log(`[Guripa AI] 🎯 Encontrado botón dismiss: "${selector}"`)

    // Encontrar el contenedor de archivo (el elemento que representa al archivo adjuntado)
    // Buscar padres que tengan clases relevantes: attachment, chip, file, pill, etc.
    let fileContainer = btn.closest('[class*="attachment"]') ||
                       btn.closest('[class*="chip"]') ||
                       btn.closest('[class*="file"]') ||
                       btn.closest('[class*="pill"]') ||
                       btn.closest('[class*="upload"]') ||
                       btn.parentElement

    try {
      // Clickear el botón
      btn.click()
      console.log(`[Guripa AI] 🖱️ Click ejecutado, esperando ${timeout}ms para validar...`)

      // Esperar el timeout específico de la plataforma
      await new Promise((resolve) => setTimeout(resolve, timeout))

      // Validar que el contenedor de archivo desapareció del DOM
      if (fileContainer && fileContainer.parentElement) {
        // El contenedor sigue en el DOM — dismiss no funcionó
        console.log('[Guripa AI] ⚠️ Elemento sigue en el DOM después del click, dismiss falló')
        continue
      }

      if (fileContainer && !document.body.contains(fileContainer)) {
        // El contenedor fue removido del DOM — éxito
        console.log('[Guripa AI] ✅ Archivo desapareció del DOM, dismiss exitoso')
        return true
      }

      // Si fileContainer es null o ya no está, no podemos validar — asumir éxito
      // (el elemento puede haber sido removido de otra forma)
      console.log('[Guripa AI] ✅ No se detectó contenedor residual, dismiss exitoso')
      return true
    } catch (err) {
      console.warn('[Guripa AI] ⚠️ Error al hacer dismiss:', err)
      continue
    }
  }

  console.log('[Guripa AI] ⚠️ Ningún selector de dismiss funcionó, pasando a fallback manual')
  return false
}

// ============================================================================
// Chequeo de archivo para datos sensibles
// ============================================================================

async function checkFileForSensitiveData(file: File): Promise<FileCheckResult> {
  if (!config?.enabled) {
    return { shouldBlock: false, scanResult: null }
  }

  let content = ''
  const fileType = getFileType(file.name)

  try {
    if (fileType === 'pdf') {
      content = await extractPdfText(file)
    } else if (fileType === 'docx') {
      content = await readDocxAsText(file)
    } else {
      content = await readFileAsText(file)
    }
  } catch (err) {
    console.warn('[Guripa AI] Error leyendo archivo:', err)
    return { shouldBlock: false, scanResult: null }
  }

  if (!content.trim()) {
    console.log('[Guripa AI] Archivo vacío, no bloquear')
    return { shouldBlock: false, scanResult: null }
  }

  // Escanear contenido
  const result = scanText(content, {
    enabledDetectors: (config?.enabledDetectors ?? []) as DetectorType[],
    whitelistPatterns: config?.whitelistPatterns ?? [],
    userEmail: config?.userEmail ?? '',
    companyDomains: config?.companyDomains ?? [],
    whitelistDomains: config?.whitelistDomains ?? [],
  })

  if (result.hasMatches) {
    console.log('[Guripa AI] 🚨 Datos sensibles detectados en archivo:', file.name)
    return { shouldBlock: true, scanResult: result }
  }

  console.log('[Guripa AI] ✅ Archivo limpio:', file.name)
  return { shouldBlock: false, scanResult: result }
}

// ============================================================================
// Flujo principal: archivo con datos sensibles
// ============================================================================

async function handleBlockedFile(file: File, result: ScanResult): Promise<void> {
  const filename = file.name
  const fileType = getFileType(filename)

  console.log(`[Guripa AI] 📋 Mostrando modal de archivo bloqueado: ${filename}`)

  // Mostrar modal de warning
  const response = await showWarningModal(
    result.detections,
    result.riskLevel,
    result.summary,
    platform,
  )

  // El usuario ACEPTÓ el riesgo → permitir envío
  if (response === 'accept') {
    console.log('[Guripa AI] ✅ Usuario aceptó enviar archivo bloqueado:', filename)
    removeBanner() // Limpiar cualquier banner previo
    sendEvent(buildPayload(result, 'warned_sent', true, filename, fileType))
    return
  }

  // El usuario CANCELÓ → intentar dismiss automático UNA sola vez
  console.log('[Guripa AI] ❌ Usuario canceló, intentando dismiss automático...')
  removeBanner() // Limpiar modal

  const dismissed = await tryAutoDismiss(filename)

  if (dismissed) {
    // Éxito: el archivo fue removido, fin de la historia
    console.log('[Guripa AI] ✅ Archivo removido automáticamente, sin bloquear envío')
    sendEvent(buildPayload(result, 'warned_cancelled', false, filename, fileType))
    return
  }

  // Fallo: mostrar banner amarillo pidiendo eliminar manualmente
  console.log('[Guripa AI] ⚠️ Dismiss automático falló, mostrando banner manual...')

  // Limpiar cualquier banner previo (modal, etc.)
  removeBanner()

  // Marcar archivo como bloqueado a nivel global (para interceptor.ts)
  ;(window as any).__guripaFileBlocked = true

  // Bloquear envío
  blockSending('archivo contiene datos sensibles')

  // Obtener input para anclar el banner
  const getInput = (): HTMLElement | null => {
    const inputs = document.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea, input[type="text"]')
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i]
      if (el.offsetHeight > 0) return el
    }
    return null
  }

  const input = getInput()
  if (input) {
    // Mostrar banner con botón "Ya lo eliminé"
    blockFileAttachment(input, filename, () => {
      // El usuario presionó "Ya lo eliminé"
      console.log('[Guripa AI] ✅ Usuario confirmó que eliminó el archivo:', filename)
      ;(window as any).__guripaFileBlocked = false
      unblockSending()
      removeBanner() // Limpiar el banner completamente
      sendEvent(buildPayload(result, 'warned_cancelled', false, filename, fileType))
    })
  }
}

// ============================================================================
// Interceptor de input file
// ============================================================================

async function handleFileInputChange(event: Event): Promise<void> {
  if (!(event.target instanceof HTMLInputElement)) return
  if (event.target.type !== 'file') return

  const input = event.target
  const files = input.files

  if (!files || files.length === 0) return

  // Procesar cada archivo
  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    console.log(`[Guripa AI] 📁 Archivo detectado: ${file.name} (${file.size} bytes, ${file.type})`)

    const checkResult = await checkFileForSensitiveData(file)

    if (checkResult.shouldBlock && checkResult.scanResult) {
      // Archivo bloqueado por datos sensibles
      await handleBlockedFile(file, checkResult.scanResult)
    }
  }
}

// ============================================================================
// Interceptor de drag & drop
// ============================================================================

async function handleDropEvent(event: DragEvent): Promise<void> {
  if (!event.dataTransfer?.items) return

  const files: File[] = []

  for (let i = 0; i < event.dataTransfer.items.length; i++) {
    const item = event.dataTransfer.items[i]
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }

  if (files.length === 0) return

  // Procesar cada archivo
  for (const file of files) {
    console.log(`[Guripa AI] 📁 Archivo detectado (drag): ${file.name}`)

    const checkResult = await checkFileForSensitiveData(file)

    if (checkResult.shouldBlock && checkResult.scanResult) {
      await handleBlockedFile(file, checkResult.scanResult)
    }
  }
}

// ============================================================================
// Observador de inputs de archivo
// ============================================================================

function observeFileInputs(): void {
  // Observar cambios en inputs de tipo file existentes
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue

      for (let i = 0; i < mutation.addedNodes.length; i++) {
        const node = mutation.addedNodes[i]
        if (!(node instanceof HTMLElement)) continue

        // Buscar inputs de archivo en el nodo añadido
        const fileInputs = node.querySelectorAll('input[type="file"]')
        fileInputs.forEach((input) => {
          if (!(input instanceof HTMLInputElement)) return
          if ((input as any).__guripaMonitored) return

          console.log('[Guripa AI] 📁 Input file encontrado (mutación)')
          ;(input as any).__guripaMonitored = true
          input.addEventListener('change', handleFileInputChange, { capture: true })
        })
      }
    }
  })

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Monitorear inputs de archivo existentes
  const existingInputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]')
  existingInputs.forEach((input) => {
    if ((input as any).__guripaMonitored) return
    console.log('[Guripa AI] 📁 Input file encontrado (inicial)')
    ;(input as any).__guripaMonitored = true
    input.addEventListener('change', handleFileInputChange, { capture: true })
  })
}

// ============================================================================
// Inicialización
// ============================================================================

export async function initFileInterceptor(
  extConfig: ExtensionConfig,
  extPlatform: string,
): Promise<void> {
  config = extConfig
  platform = extPlatform

  if (!config?.enabled) {
    console.log('[Guripa AI] File interceptor desactivado')
    return
  }

  console.log('[Guripa AI] 📁 File interceptor iniciado para', platform)

  // Escuchar cambios en inputs file
  document.addEventListener('change', handleFileInputChange, { capture: true })

  // Escuchar drag & drop
  document.addEventListener('drop', handleDropEvent, { capture: true })

  // Monitorear nuevos inputs de archivo
  observeFileInputs()

  console.log('[Guripa AI] 📁 File interceptor activo')
}
