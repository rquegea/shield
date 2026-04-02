import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican datos salariales/nómina
const SALARY_KEYWORDS = [
  // Verbos directos
  'cobra', 'cobrar', 'cobras', 'cobraba', 'gana', 'ganar', 'ganas',
  'le pago', 'le pagamos', 'nos paga', 'pagar', 'percibe', 'percibir',
  // Cantidades
  'brutos', 'bruto', 'netos', 'neto', 'brutos anuales', 'netos anuales',
  'brutos mensuales', 'netos mensuales', 'al mes', 'al año', 'anuales',
  'mensuales', 'quincenales',
  // Conceptos nómina
  'nómina', 'nomina', 'salario', 'sueldo', 'retribución', 'retribucion',
  'remuneración', 'remuneracion', 'compensación', 'compensacion',
  'salario bruto', 'salario neto', 'sueldo bruto', 'sueldo neto',
  'IRPF', 'retención', 'retencion', 'base imponible', 'base de cotización',
  'complemento salarial', 'paga extra', 'pagas extra', 'plus de antigüedad',
  'incremento salarial', 'subida salarial', 'revisión salarial',
  'variable', 'bonus', 'incentivo', 'incentivos', 'comisiones', 'comisión',
  'dietas', 'gastos', 'tickets restaurante', 'ticket restaurante',
  'coste empresa', 'coste total', 'paquete retributivo',
  'banda salarial', 'rango salarial', 'horquilla salarial',
  'cotización', 'seguridad social', 'cuota', 'tramo',
  'finiquito', 'liquidación', 'indemnización',
]

const SALARY_PATTERN = new RegExp(
  `\\b(${SALARY_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

export function detectSalaryData(text: string): Detection[] {
  console.log('[SALARY DEBUG] texto recibido:', text.slice(0, 80))
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
