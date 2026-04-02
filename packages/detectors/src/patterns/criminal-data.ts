import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican datos penales/judiciales (Art. 10 RGPD)
const CRIMINAL_KEYWORDS = [
  'antecedentes penales', 'antecedentes policiales',
  'condena', 'condenado', 'condenada',
  'sentencia penal', 'sentencia firme',
  'delito', 'imputado', 'imputada', 'investigado', 'investigada',
  'preso', 'presa', 'prisión', 'prision', 'encarcelado', 'encarcelada',
  'libertad condicional', 'libertad vigilada',
  'orden de alejamiento', 'detención', 'detencion',
  'detenido', 'detenida', 'procesado', 'procesada',
  'acusado de', 'acusada de',
  'ficha policial', 'expediente penal',
]

const CRIMINAL_PATTERN = new RegExp(
  `\\b(${CRIMINAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

export function detectCriminalData(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  CRIMINAL_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CRIMINAL_PATTERN.exec(text)) !== null) {
    const keyword = match[0]
    const keywordStart = match.index
    const keywordEnd = keywordStart + keyword.length

    const nearbyName = hasNameNearby(text, keywordStart, keywordEnd)
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
