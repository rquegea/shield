// Content script — interceptor de subida de archivos
// Detecta datos sensibles en archivos que se suben a plataformas de IA

import { scanText, maskValue } from '@shieldai/detectors'
import type { ScanResult, DetectorType } from '@shieldai/detectors'
import type { ExtensionConfig, EventPayload } from '../types'
import { showWarningModal } from './ui/WarningModal'
import JSZip from 'jszip'

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

function extractPdfText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      // Los PDFs tienen texto entre paréntesis seguido de Tj o TJ
      const results: string[] = []

      // Buscar texto en operadores Tj
      const regex1 = /\(([^)]{1,500})\)\s*Tj/g
      let match
      while ((match = regex1.exec(text)) !== null) {
        results.push(match[1])
      }

      // Buscar texto en arrays TJ
      const regex2 = /\[([^\]]*)\]\s*TJ/gi
      while ((match = regex2.exec(text)) !== null) {
        const innerStrings = match[1].match(/\(([^)]+)\)/g)
        if (innerStrings) {
          for (const s of innerStrings) {
            results.push(s.slice(1, -1))
          }
        }
      }

      // También buscar texto plano después de "stream" y antes de "endstream"
      // Algunos PDFs tienen texto sin comprimir en streams
      const streamRegex = /stream\r?\n([\s\S]*?)endstream/g
      while ((match = streamRegex.exec(text)) !== null) {
        const streamText = match[1]
        // Extraer texto de operadores BT...ET
        const btRegex = /BT\s([\s\S]*?)ET/g
        let btMatch
        while ((btMatch = btRegex.exec(streamText)) !== null) {
          const innerText = btMatch[1]
          const tjInner = innerText.match(/\(([^)]+)\)/g)
          if (tjInner) {
            for (const s of tjInner) {
              results.push(s.slice(1, -1))
            }
          }
        }
      }

      const extracted = results.join(' ')
      console.log('[ShieldAI] PDF texto extraído:', extracted.length, 'caracteres')
      console.log('[ShieldAI] PDF muestra:', extracted.substring(0, 300))
      resolve(extracted)
    }
    reader.onerror = () => {
      console.warn('[ShieldAI] Error leyendo PDF')
      resolve('')
    }
    reader.readAsBinaryString(file)
  })
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
          console.log('[ShieldAI] No se encontró word/document.xml en el .docx')
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
        console.log(`[ShieldAI] Texto extraído del .docx: ${extractedText.length} caracteres`)
        resolve(extractedText)
      } catch (err) {
        console.warn('[ShieldAI] Error descomprimiendo/parseando .docx:', err)
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
// Escaneo de archivos
// ============================================================================

async function checkFileForSensitiveData(file: File): Promise<FileCheckResult> {
  const fileType = getFileType(file.name)

  console.log(`[ShieldAI] Analizando archivo: ${file.name} (${fileType})`)

  // Archivos que no podemos leer: warning genérico
  if (fileType === 'excel') {
    console.log(`[ShieldAI] Tipo ${fileType} no parseable, mostrando warning genérico`)
    return {
      shouldBlock: true,
      scanResult: null,
    }
  }

  if (fileType === 'unknown') {
    console.log('[ShieldAI] Tipo de archivo desconocido, permitiendo')
    return { shouldBlock: false, scanResult: null }
  }

  // Archivos de texto: leer y escanear
  try {
    let content = ''

    if (fileType === 'pdf') {
      content = await extractPdfText(file)
      // Si el PDF está vacío después de intentar leerlo, mostrar warning genérico
      if (!content.trim()) {
        console.log('[ShieldAI] No se pudo extraer texto del PDF, mostrando warning genérico')
        return {
          shouldBlock: true,
          scanResult: null,
        }
      }
    } else if (fileType === 'docx') {
      content = await readDocxAsText(file)
      // Si no se pudo extraer texto, mostrar warning genérico
      if (!content.trim()) {
        console.log('[ShieldAI] No se pudo extraer texto del .docx, mostrando warning genérico')
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

    console.log(`[ShieldAI] Escaneo completado: ${result.hasMatches ? 'DETECTADOS' : 'limpios'}`)

    return {
      shouldBlock: result.hasMatches,
      scanResult: result,
    }
  } catch (err) {
    console.warn('[ShieldAI] Error procesando archivo:', err)
    return { shouldBlock: false, scanResult: null }
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

  const file = files[0]
  const fileExt = file.name.split('.').pop() || 'unknown'

  console.log(`[ShieldAI] 📁 Archivo seleccionado: ${file.name}`)

  const checkResult = await checkFileForSensitiveData(file)

  if (!checkResult.shouldBlock) {
    console.log('[ShieldAI] ✅ Archivo permitido, no hay detecciones')
    return
  }

  // Bloquear y mostrar warning
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  let userAccepted = false

  if (checkResult.scanResult === null) {
    console.log('[ShieldAI] ⚠️ Warning genérico para archivo binario')
    userAccepted = await showFileWarningModalGeneric(file.name, fileExt)
  } else {
    console.log(`[ShieldAI] 🚨 Detecciones encontradas: ${checkResult.scanResult.summary}`)
    const response = await showWarningModal(
      checkResult.scanResult.detections,
      checkResult.scanResult.riskLevel,
      `Archivo: ${file.name}`,
      platform,
    )
    userAccepted = response === 'accept'
  }

  // Limpiar input
  event.target.value = ''

  // Registrar evento
  const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
  sendEvent(buildPayload(checkResult.scanResult, action, userAccepted, file.name, fileExt))

  if (userAccepted) {
    console.log('[ShieldAI] Usuario aceptó subir el archivo')
    // El usuario tendrá que re-seleccionar el archivo
  }
}

async function handleDropEvent(event: DragEvent): Promise<void> {
  if (!config?.enabled) return
  if (!event.dataTransfer?.files || event.dataTransfer.files.length === 0) {
    return
  }

  const target = event.target
  if (!(target instanceof HTMLElement)) return

  console.log(`[ShieldAI] 📂 Drop detectado con ${event.dataTransfer.files.length} archivo(s)`)

  // Procesar solo el primer archivo
  const file = event.dataTransfer.files[0]
  const fileExt = file.name.split('.').pop() || 'unknown'

  const checkResult = await checkFileForSensitiveData(file)

  if (!checkResult.shouldBlock) {
    console.log('[ShieldAI] ✅ Archivo permitido, no hay detecciones')
    return
  }

  // Bloquear drop
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  let userAccepted = false

  if (checkResult.scanResult === null) {
    console.log('[ShieldAI] ⚠️ Warning genérico para archivo binario')
    userAccepted = await showFileWarningModalGeneric(file.name, fileExt)
  } else {
    console.log(`[ShieldAI] 🚨 Detecciones encontradas: ${checkResult.scanResult.summary}`)
    const response = await showWarningModal(
      checkResult.scanResult.detections,
      checkResult.scanResult.riskLevel,
      `Archivo: ${file.name}`,
      platform,
    )
    userAccepted = response === 'accept'
  }

  // Registrar evento
  const action = userAccepted ? 'warned_sent' : 'warned_cancelled'
  sendEvent(buildPayload(checkResult.scanResult, action, userAccepted, file.name, fileExt))
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

  console.log('[ShieldAI] File interceptor inicializado para', platform)

  observeFileInputs()
  document.addEventListener('drop', handleDropEvent, { capture: true })

  console.log('[ShieldAI] Monitoreando subida de archivos con soporte PDF y .docx')
}
