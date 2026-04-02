import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican datos salariales/nómina
const SALARY_KEYWORDS = [
  'nómina', 'nomina', 'salario', 'sueldo', 'retribución', 'retribucion',
  'salario bruto', 'salario neto', 'sueldo bruto', 'sueldo neto',
  'remuneración', 'remuneracion', 'compensación', 'compensacion',
  'IRPF', 'retención', 'retencion', 'base imponible',
  'complemento salarial', 'paga extra', 'plus de antigüedad',
  'incremento salarial', 'subida salarial', 'revisión salarial',
]

const SALARY_PATTERN = new RegExp(
  `\\b(${SALARY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

export function detectSalaryData(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  SALARY_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SALARY_PATTERN.exec(text)) !== null) {
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
      type: 'SALARY_DATA',
      value: text.slice(detStart, detEnd),
      masked: `[${nearbyName.name}] + dato salarial`,
      start: detStart,
      end: detEnd,
      confidence: 'high',
      category: 'SPECIAL_CATEGORY',
      severity: 'block',
    })
  }

  return detections
}
