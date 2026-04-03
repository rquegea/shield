import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords específicos = alta confianza, ventana normal (150 chars)
const STRONG_CRIMINAL_KEYWORDS = [
  'antecedentes penales', 'antecedentes policiales',
  'condena', 'condenado', 'condenada',
  'sentencia penal', 'sentencia firme',
  'preso', 'presa', 'prisión', 'prision', 'encarcelado', 'encarcelada',
  'libertad condicional', 'libertad vigilada',
  'orden de alejamiento',
  'ficha policial', 'expediente penal',
]

// Keywords genéricos = baja confianza, ventana reducida (40 chars)
const WEAK_CRIMINAL_KEYWORDS = [
  'delito', 'imputado', 'imputada', 'investigado', 'investigada',
  'detención', 'detencion',
  'detenido', 'detenida', 'procesado', 'procesada',
  'acusado de', 'acusada de',
]

const STRONG_CRIMINAL_PATTERN = new RegExp(
  `\\b(${STRONG_CRIMINAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

const WEAK_CRIMINAL_PATTERN = new RegExp(
  `\\b(${WEAK_CRIMINAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

function scanCriminalKeywords(text: string, pattern: RegExp, windowSize: number): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const keyword = match[0]
    const keywordStart = match.index
    const keywordEnd = keywordStart + keyword.length

    const nearbyName = hasNameNearby(text, keywordStart, keywordEnd, windowSize)
    if (!nearbyName) continue

    const key = `${nearbyName.name}:${keyword.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    const detStart = Math.min(nearbyName.start, keywordStart)
    const detEnd = Math.max(nearbyName.end, keywordEnd)

    detections.push({
      type: 'CRIMINAL_DATA',
      value: text.slice(detStart, detEnd),
      masked: `[${nearbyName.name}] + dato penal`,
      start: detStart,
      end: detEnd,
      confidence: 'high',
      category: 'SPECIAL_CATEGORY',
      severity: 'block',
    })
  }

  return detections
}

export function detectCriminalData(text: string): Detection[] {
  // Pasada 1: Keywords específicos con ventana normal (150)
  const strongDetections = scanCriminalKeywords(text, STRONG_CRIMINAL_PATTERN, 150)

  // Pasada 2: Keywords genéricos con ventana reducida (40)
  const weakDetections = scanCriminalKeywords(text, WEAK_CRIMINAL_PATTERN, 40)

  // Combinar, evitando duplicados por position
  const allDetections = [...strongDetections, ...weakDetections]
  const deduped = new Map<string, Detection>()
  for (const det of allDetections) {
    const key = `${det.start}:${det.end}`
    deduped.set(key, det)
  }

  return Array.from(deduped.values())
}
