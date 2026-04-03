import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords específicos = alta confianza, ventana normal (150 chars por defecto)
const STRONG_SALARY_KEYWORDS = [
  'nómina', 'nomina', 'salario', 'sueldo', 'retribución', 'retribucion',
  'remuneración', 'remuneracion', 'compensación', 'compensacion',
  'salario bruto', 'salario neto', 'sueldo bruto', 'sueldo neto',
  'IRPF', 'retención', 'retencion', 'base imponible', 'base de cotización',
  'complemento salarial', 'paga extra', 'pagas extra', 'plus de antigüedad',
  'incremento salarial', 'subida salarial', 'revisión salarial',
  'finiquito', 'liquidación', 'indemnización',
  'coste empresa', 'coste total', 'paquete retributivo',
]

// Keywords genéricos = baja confianza, ventana reducida (40 chars)
const WEAK_SALARY_KEYWORDS = [
  'cobra', 'cobrar', 'cobras', 'cobraba', 'gana', 'ganar', 'ganas',
  'le pago', 'le pagamos', 'nos paga', 'pagar', 'percibe', 'percibir',
  'brutos', 'bruto', 'netos', 'neto', 'brutos anuales', 'netos anuales',
  'brutos mensuales', 'netos mensuales', 'al mes', 'al año', 'anuales',
  'mensuales', 'quincenales',
  'variable', 'bonus', 'incentivo', 'incentivos', 'comisiones', 'comisión',
  'dietas', 'gastos', 'tickets restaurante', 'ticket restaurante',
  'banda salarial', 'rango salarial', 'horquilla salarial',
  'cotización', 'seguridad social', 'cuota', 'tramo',
]

const STRONG_SALARY_PATTERN = new RegExp(
  `\\b(${STRONG_SALARY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

const WEAK_SALARY_PATTERN = new RegExp(
  `\\b(${WEAK_SALARY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

function scanSalaryKeywords(text: string, pattern: RegExp, windowSize: number): Detection[] {
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

export function detectSalaryData(text: string): Detection[] {
  // Pasada 1: Keywords específicos con ventana normal (150)
  const strongDetections = scanSalaryKeywords(text, STRONG_SALARY_PATTERN, 150)

  // Pasada 2: Keywords genéricos con ventana reducida (40)
  const weakDetections = scanSalaryKeywords(text, WEAK_SALARY_PATTERN, 40)

  // Combinar, evitando duplicados por position
  const allDetections = [...strongDetections, ...weakDetections]
  const deduped = new Map<string, Detection>()
  for (const det of allDetections) {
    const key = `${det.start}:${det.end}`
    deduped.set(key, det)
  }

  return Array.from(deduped.values())
}
