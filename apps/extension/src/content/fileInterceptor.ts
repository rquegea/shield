// Content script — interceptor de subida de archivos
// Detecta datos sensibles en archivos que se suben a plataformas de IA

import { scanText, maskValue, calculateRiskLevel, calculateMaxSeverity, buildSummary } from '@shieldai/detectors'
import type { ScanResult, Detection, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, EventPayload } from '../types'
import { showWarningModal } from './ui/WarningModal'
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
// Selectores de dismiss para archivos adjuntados por plataforma
// ============================================================================

const FILE_DISMISS_SELECTORS: Record<string, string[]> = {
  chatgpt: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Eliminar archivo"]',
    'button[aria-label="Remove attachment"]',
    '[class*="attachment"] button[class*="close"]',
    '[class*="attachment"] button[class*="remove"]',
    '[class*="file"] button[class*="close"]',
    '[class*="file"] button[class*="remove"]',
    '[data-testid*="file"] button',
    '[data-testid*="attachment"] button',
  ],
  gemini: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Quitar archivo"]',
    'button[aria-label="Remove"]',
    '.file-chip button[aria-label="Remove"]',
    '[class*="chip"] button[class*="close"]',
    '[class*="chip"] button[class*="remove"]',
    '[class*="attachment"] button[class*="cancel"]',
    '.upload-chip .close-button',
    '[class*="upload"] button[class*="remove"]',
  ],
  claude: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Eliminar archivo"]',
    'button[aria-label="Remove attachment"]',
    '[class*="attachment"] button',
    '[class*="file-pill"] button',
    '[class*="uploaded-file"] button[class*="remove"]',
    '[class*="uploaded-file"] button[class*="close"]',
    '.composer-attachment-list button[class*="dismiss"]',
    '.composer-attachment-list button[class*="remove"]',
  ],
  perplexity: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Remove"]',
    '[class*="attachment"] button[class*="close"]',
    '[class*="attachment"] button[class*="remove"]',
    '[class*="file"] button[class*="close"]',
    '[class*="file"] button[class*="remove"]',
  ],
  copilot: [
    'button[aria-label="Remove file"]',
    'button[aria-label="Remove attachment"]',
    '[class*="attachment"] button[class*="close"]',
    '[class*="attachment"] button[class*="remove"]',
    '[class*="file"] button',
  ],
}

// ============================================================================
// Descartar archivo adjuntado de la UI de la plataforma
// ============================================================================

function getDismissSelectors(): string[] {
  // Primero intentar selectores dinámicos del config
  const dynamic = config?.fileDismissSelectors
  if (dynamic && dynamic.length > 0) {
    console.log('[Guripa AI] Usando selectores dinámicos de dismiss')
    return dynamic
  }

  // Fallback a hardcodeados
  const hardcoded = FILE_DISMISS_SELECTORS[platform] ?? []
  if (hardcoded.length > 0) {
    console.log(`[Guripa AI] Usando selectores hardcodeados de dismiss para ${platform}`)
  }
  return hardcoded
}

// ============================================================================
// Estrategia hover-then-dismiss para Claude.ai y Perplexity
// ============================================================================

async function hoverAndDismissFileChip(filename?: string): Promise<boolean> {
  console.log(`[Guripa AI] 🎯 Intentando estrategia hover-then-dismiss para ${platform}...`)

  // Buscar chips: div con clase que contenga "pill", "chip", "attachment", etc.
  // O buscar específicamente por atributos que indiquen un file attachment
  const potentialChips = Array.from(document.querySelectorAll('*')).filter(el => {
    const classStr = el.className.toString().toLowerCase()
    const hasFileClass = classStr.includes('pill') ||
                         classStr.includes('chip') ||
                         classStr.includes('attachment') ||
                         classStr.includes('upload') ||
                         classStr.includes('file') ||
                         classStr.includes('badge')

    if (!hasFileClass) return false

    // Filtrar por ubicación: zona baja de pantalla (composer area)
    const rect = (el as HTMLElement).getBoundingClientRect()
    const lowerThreshold = window.innerHeight - 400
    return rect.bottom > lowerThreshold && rect.width > 0 && rect.height > 0
  }) as HTMLElement[]

  console.log(`[Guripa AI] Encontrados ${potentialChips.length} chips potenciales`)

  if (potentialChips.length === 0) {
    console.log('[Guripa AI] ⚠️ No se encontró chip de archivo para hover')
    return false
  }

  // Usar el último chip encontrado (más probable que sea el recién añadido)
  const chipElement = potentialChips[potentialChips.length - 1]
  console.log('[Guripa AI] Usando chip:', chipElement.className, 'Contenido:', chipElement.textContent?.slice(0, 50))

  try {
    // Disparar mouseenter y mouseover para que React renderice el botón X
    console.log('[Guripa AI] 🖱️ Disparando mouseenter y mouseover...')
    const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window })
    const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window })

    chipElement.dispatchEvent(mouseEnterEvent)
    chipElement.dispatchEvent(mouseOverEvent)

    // Esperar a que React renderice el botón
    await new Promise(resolve => setTimeout(resolve, 300))

    console.log('[Guripa AI] 🔍 Buscando botón X después del hover...')

    // Estrategia 1: Buscar botones dentro del chip
    const buttonsInChip = Array.from(chipElement.querySelectorAll('button'))
    console.log(`[Guripa AI] Botones dentro del chip: ${buttonsInChip.length}`)

    for (const btn of buttonsInChip) {
      const rect = btn.getBoundingClientRect()
      const ariaLabel = btn.getAttribute('aria-label') || ''
      const title = btn.getAttribute('title') || ''
      const classStr = btn.className.toString().toLowerCase()

      console.log(`[Guripa AI] Botón: size=${rect.width}x${rect.height}, aria-label="${ariaLabel}", class="${classStr}"`)

      // Cualquier botón pequeño dentro del chip podría ser el X
      if (rect.width < 40 && rect.height < 40) {
        console.log('[Guripa AI] ✓ Clickeando botón pequeño dentro del chip')
        btn.click()
        console.log('[Guripa AI] 🗑️ Archivo descartado (hover-then-dismiss)')
        return true
      }
    }

    // Estrategia 2: Buscar SVG (el X puede ser un SVG puro sin button)
    const svgsInChip = Array.from(chipElement.querySelectorAll('svg'))
    console.log(`[Guripa AI] SVGs dentro del chip: ${svgsInChip.length}`)

    for (const svg of svgsInChip) {
      const parent = svg.closest('button') || svg.parentElement
      if (parent && parent.tagName !== 'SVG') {
        console.log('[Guripa AI] ✓ Clickeando elemento padre del SVG')
        ;(parent as HTMLElement).click()
        console.log('[Guripa AI] 🗑️ Archivo descartado (hover-then-dismiss SVG)')
        return true
      }
    }

    // Estrategia 3: Buscar en hermanos del chip (a veces el botón X está fuera)
    console.log('[Guripa AI] Buscando botones en hermanos del chip...')
    const parent = chipElement.parentElement
    if (parent) {
      const siblingButtons = Array.from(parent.querySelectorAll('button'))
      for (const btn of siblingButtons) {
        const rect = btn.getBoundingClientRect()
        if (rect.width < 40 && rect.height < 40) {
          console.log('[Guripa AI] ✓ Clickeando botón pequeño hermano')
          btn.click()
          console.log('[Guripa AI] 🗑️ Archivo descartado (hover-then-dismiss sibling)')
          return true
        }
      }
    }

    console.log('[Guripa AI] ⚠️ No se encontró botón X después del hover')
    return false
  } catch (e) {
    console.warn('[Guripa AI] Error en estrategia hover-then-dismiss:', e)
    return false
  }
}

// ============================================================================
// Descartar archivo adjuntado de la UI de la plataforma
// ============================================================================

async function dismissFileAttachments(filename?: string): Promise<boolean> {
  console.log(`[Guripa AI] 🗑️ Intentando descartar archivo${filename ? ` (${filename})` : ''}...`)

  const selectors = getDismissSelectors()

  // Estrategia 1: Intentar selectores directos (ChatGPT, Gemini, Copilot, etc.)
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, 200 + attempt * 100))
    }

    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector)
      if (buttons.length > 0) {
        const btn = buttons[buttons.length - 1] as HTMLElement
        try {
          btn.click()
          console.log(`[Guripa AI] 🗑️ Archivo descartado de la UI de ${platform}`)
          return true
        } catch (e) {
          console.warn('[Guripa AI] Error al hacer click en dismiss button:', e)
        }
      }
    }

    // Fallback genérico: buscar botones con aria-label que contenga palabras clave
    if (attempt === 4) {
      const allButtons = Array.from(document.querySelectorAll('button'))
      for (const btn of allButtons) {
        const label = (btn.getAttribute('aria-label') || '').toLowerCase()
        const title = (btn.getAttribute('title') || '').toLowerCase()

        if (label.includes('remove') || label.includes('delete') || label.includes('dismiss') ||
            label.includes('eliminar') || label.includes('descartar') ||
            title.includes('remove') || title.includes('delete') || title.includes('dismiss')) {
          try {
            btn.click()
            console.log('[Guripa AI] 🗑️ Archivo descartado (fallback genérico)')
            return true
          } catch (e) {
            // Continuar
          }
        }
      }
    }
  }

  // Estrategia 2: Hover-then-dismiss para Claude.ai y Perplexity (plataformas que renderizan botones en hover)
  if (platform === 'claude' || platform === 'perplexity') {
    const hoverResult = await hoverAndDismissFileChip(filename)
    if (hoverResult) {
      return true
    }
  }

  console.log('[Guripa AI] ⚠️ No se encontró forma de descartar el archivo')
  return false
}

// ============================================================================
// Escaneo de archivos
// ============================================================================

async function checkFileForSensitiveData(file: File): Promise<FileCheckResult> {
  const fileType = getFileType(file.name)

  console.log(`[Guripa AI] Analizando archivo: ${file.name} (${fileType})`)

  // Archivos que no podemos leer: warning genérico
  if (fileType === 'excel') {
    console.log(`[Guripa AI] Tipo ${fileType} no parseable, mostrando warning genérico`)
    return {
      shouldBlock: true,
      scanResult: null,
    }
  }

  if (fileType === 'unknown') {
    console.log('[Guripa AI] Tipo de archivo desconocido, permitiendo')
    return { shouldBlock: false, scanResult: null }
  }

  // Archivos de texto: leer y escanear
  try {
    let content = ''

    if (fileType === 'pdf') {
      content = await extractPdfText(file)
      // Si el PDF está vacío después de intentar leerlo, mostrar warning genérico
      if (!content.trim()) {
        console.log('[Guripa AI] No se pudo extraer texto del PDF, mostrando warning genérico')
        return {
          shouldBlock: true,
          scanResult: null,
        }
      }
    } else if (fileType === 'docx') {
      content = await readDocxAsText(file)
      // Si no se pudo extraer texto, mostrar warning genérico
      if (!content.trim()) {
        console.log('[Guripa AI] No se pudo extraer texto del .docx, mostrando warning genérico')
        return {
          shouldBlock: true,
          scanResult: null,
        }
      }
    } else {
      content = await readFileAsText(file)
    }

    const result = scanText(content, {
      enabledDetectors: (config?.enabledDetectors ?? []) as DetectorType[],
      whitelistPatterns: config?.whitelistPatterns ?? [],
    })

    console.log(`[Guripa AI] Escaneo completado: ${result.hasMatches ? 'DETECTADOS' : 'limpios'}`)

    return {
      shouldBlock: result.hasMatches,
      scanResult: result,
    }
  } catch (err) {
    console.warn('[Guripa AI] Error procesando archivo:', err)
    return { shouldBlock: false, scanResult: null }
  }
}

// ============================================================================
// Combinar resultados de múltiples archivos
// ============================================================================

function mergeScanResults(results: ScanResult[]): ScanResult {
  const allDetections: Detection[] = []
  for (const r of results) {
    allDetections.push(...r.detections)
  }
  return {
    hasMatches: allDetections.length > 0,
    detections: allDetections,
    riskLevel: calculateRiskLevel(allDetections),
    maxSeverity: calculateMaxSeverity(allDetections),
    summary: buildSummary(allDetections),
  }
}

// ============================================================================
// UI para warnings genéricos
// ============================================================================

function showFileWarningModalGeneric(filename: string, fileType: string): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement('shieldai-file-modal')
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: 'closed' })

    const styles = document.createElement('style')
    styles.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .modal {
        background: #fff;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      }
      .title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #111;
      }
      .desc {
        font-size: 14px;
        color: #666;
        margin-bottom: 20px;
        line-height: 1.5;
      }
      .filename {
        background: #f5f5f5;
        padding: 12px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 13px;
        margin-bottom: 20px;
        word-break: break-all;
      }
      .buttons {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      button {
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      .btn-cancel {
        background: #e5e5e5;
        color: #333;
      }
      .btn-cancel:hover {
        background: #d5d5d5;
      }
      .btn-accept {
        background: #dc2626;
        color: #fff;
      }
      .btn-accept:hover {
        background: #b91c1c;
      }
    `
    shadow.appendChild(styles)

    const desc = fileType === 'pdf'
      ? 'Los archivos PDF no se pueden verificar completamente. El archivo podría contener datos sensibles.'
      : `Los archivos ${fileType.toUpperCase()} no se pueden verificar completamente. El archivo podría contener datos sensibles.`

    const overlay = document.createElement('div')
    overlay.className = 'overlay'
    overlay.innerHTML = `
      <div class="modal">
        <div class="title">Archivo binario detectado</div>
        <div class="desc">${desc}</div>
        <div class="filename">${filename}</div>
        <div class="buttons">
          <button class="btn-cancel" id="btn-cancel">Cancelar</button>
          <button class="btn-accept" id="btn-accept">Subir igualmente</button>
        </div>
      </div>
    `
    shadow.appendChild(overlay)

    let resolved = false

    function cleanup(result: boolean): void {
      if (resolved) return
      resolved = true
      host.remove()
      resolve(result)
    }

    shadow.getElementById('btn-cancel')!.addEventListener('click', () => cleanup(false))
    shadow.getElementById('btn-accept')!.addEventListener('click', () => cleanup(true))

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false)
    })
  })
}

// ============================================================================
// Handlers de eventos
// ============================================================================

async function handleFileInputChange(event: Event): Promise<void> {
  if (!config?.enabled) return
  if (!(event.target instanceof HTMLInputElement)) return
  if (event.target.type !== 'file') return

  const files = event.target.files
  if (!files || files.length === 0) return

  console.log(`[Guripa AI] 📁 ${files.length} archivo(s) seleccionado(s)`)

  // Analizar TODOS los archivos
  const scanResults: ScanResult[] = []
  const binaryFiles: string[] = []
  const fileNames: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    fileNames.push(file.name)
    console.log(`[Guripa AI] 📁 Analizando archivo ${i + 1}/${files.length}: ${file.name}`)

    const checkResult = await checkFileForSensitiveData(file)

    if (checkResult.shouldBlock) {
      if (checkResult.scanResult === null) {
        binaryFiles.push(file.name)
      } else {
        scanResults.push(checkResult.scanResult)
      }
    }
  }

  // Si no hay nada que bloquear, permitir
  if (scanResults.length === 0 && binaryFiles.length === 0) {
    console.log('[Guripa AI] ✅ Todos los archivos permitidos, no hay detecciones')
    return
  }

  // Bloquear y mostrar warning
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  let userAccepted = false
  const allFileNames = fileNames.join(', ')
  const firstExt = fileNames[0].split('.').pop() || 'unknown'

  if (scanResults.length > 0) {
    // Combinar todas las detecciones de todos los archivos
    const merged = mergeScanResults(scanResults)
    console.log(`[Guripa AI] 🚨 Detecciones encontradas en archivos: ${merged.summary}`)
    const label = fileNames.length === 1 ? `Archivo: ${fileNames[0]}` : `${fileNames.length} archivos: ${allFileNames}`
    const response = await showWarningModal(
      merged.detections,
      merged.riskLevel,
      label,
      platform,
    )
    userAccepted = response === 'accept'

    // Si el usuario descartó el archivo, descartar de la UI
    if (!userAccepted) {
      await dismissFileAttachments(fileNames[0])
    }

    const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
    sendEvent(buildPayload(merged, action, userAccepted, allFileNames, firstExt))
  } else {
    // Solo archivos binarios no parseables
    console.log('[Guripa AI] ⚠️ Warning genérico para archivo(s) binario(s)')
    const label = binaryFiles.length === 1 ? binaryFiles[0] : binaryFiles.join(', ')
    userAccepted = await showFileWarningModalGeneric(label, firstExt)

    // Si el usuario descartó el archivo, descartar de la UI
    if (!userAccepted) {
      await dismissFileAttachments(binaryFiles[0])
    }

    const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
    sendEvent(buildPayload(null, action, userAccepted, allFileNames, firstExt))
  }

  // Limpiar input
  event.target.value = ''

  if (userAccepted) {
    console.log('[Guripa AI] ✅ Usuario aceptó subir los archivos')
  } else {
    console.log('[Guripa AI] ❌ Usuario descartó los archivos')
  }
}

async function handleDropEvent(event: DragEvent): Promise<void> {
  if (!config?.enabled) return
  if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
    return
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const files = event.dataTransfer.files
  console.log(`[Guripa AI] 📂 Drop detectado con ${files.length} archivo(s)`)

  // Analizar TODOS los archivos
  const scanResults: ScanResult[] = []
  const binaryFiles: string[] = []
  const fileNames: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    fileNames.push(file.name)
    console.log(`[Guripa AI] 📂 Analizando archivo ${i + 1}/${files.length}: ${file.name}`)

    const checkResult = await checkFileForSensitiveData(file)

    if (checkResult.shouldBlock) {
      if (checkResult.scanResult === null) {
        binaryFiles.push(file.name)
      } else {
        scanResults.push(checkResult.scanResult)
      }
    }
  }

  // Si no hay nada que bloquear, permitir
  if (scanResults.length === 0 && binaryFiles.length === 0) {
    console.log('[Guripa AI] ✅ Todos los archivos permitidos, no hay detecciones')
    return
  }

  // Bloquear drop
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  let userAccepted = false
  const allFileNames = fileNames.join(', ')
  const firstExt = fileNames[0].split('.').pop() || 'unknown'

  if (scanResults.length > 0) {
    const merged = mergeScanResults(scanResults)
    console.log(`[Guripa AI] 🚨 Detecciones encontradas en archivos: ${merged.summary}`)
    const label = fileNames.length === 1 ? `Archivo: ${fileNames[0]}` : `${fileNames.length} archivos: ${allFileNames}`
    const response = await showWarningModal(
      merged.detections,
      merged.riskLevel,
      label,
      platform,
    )
    userAccepted = response === 'accept'

    // Si el usuario descartó el archivo, descartar de la UI
    if (!userAccepted) {
      await dismissFileAttachments(fileNames[0])
    }

    const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
    sendEvent(buildPayload(merged, action, userAccepted, allFileNames, firstExt))
  } else {
    console.log('[Guripa AI] ⚠️ Warning genérico para archivo(s) binario(s)')
    const label = binaryFiles.length === 1 ? binaryFiles[0] : binaryFiles.join(', ')
    userAccepted = await showFileWarningModalGeneric(label, firstExt)

    // Si el usuario descartó el archivo, descartar de la UI
    if (!userAccepted) {
      await dismissFileAttachments(binaryFiles[0])
    }

    const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
    sendEvent(buildPayload(null, action, userAccepted, allFileNames, firstExt))
  }

  if (userAccepted) {
    console.log('[Guripa AI] ✅ Usuario aceptó los archivos drag-drop')
  } else {
    console.log('[Guripa AI] ❌ Usuario descartó los archivos drag-drop')
  }
}

// ============================================================================
// Observar inputs type="file"
// ============================================================================

function observeFileInputs(): void {
  document.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
    if (!input.hasAttribute('data-shieldai-listening')) {
      input.addEventListener('change', handleFileInputChange, { capture: true })
      input.setAttribute('data-shieldai-listening', 'true')
    }
  })

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const el = node as HTMLElement
            if (el instanceof HTMLInputElement && el.type === 'file') {
              if (!el.hasAttribute('data-shieldai-listening')) {
                el.addEventListener('change', handleFileInputChange, { capture: true })
                el.setAttribute('data-shieldai-listening', 'true')
              }
            }
            el.querySelectorAll<HTMLInputElement>('input[type="file"]').forEach((input) => {
              if (!input.hasAttribute('data-shieldai-listening')) {
                input.addEventListener('change', handleFileInputChange, { capture: true })
                input.setAttribute('data-shieldai-listening', 'true')
              }
            })
          }
        })
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// ============================================================================
// Inicialización
// ============================================================================

export async function initFileInterceptor(
  cfg: ExtensionConfig | null,
  plat: string,
): Promise<void> {
  config = cfg
  platform = plat

  if (!config?.enabled || platform === 'unknown') {
    return
  }

  console.log('[Guripa AI] File interceptor inicializado para', platform)

  observeFileInputs()
  document.addEventListener('drop', handleDropEvent, { capture: true })

  console.log('[Guripa AI] Monitoreando subida de archivos con soporte PDF y .docx')
}
