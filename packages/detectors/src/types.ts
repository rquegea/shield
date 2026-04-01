export type DetectorType =
  | 'DNI'
  | 'NIE'
  | 'CIF'
  | 'IBAN'
  | 'CREDIT_CARD'
  | 'SSN_SPAIN'
  | 'PHONE_SPAIN'
  | 'EMAIL'
  | 'PASSPORT_SPAIN'

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

export type Confidence = 'high' | 'medium' | 'low'

export type Category = 'PII' | 'FINANCIAL' | 'CONTACT' | 'ID_DOCUMENT'

export interface Detection {
  type: DetectorType
  value: string
  masked: string
  start: number
  end: number
  confidence: Confidence
  category: Category
}

export interface ScanResult {
  hasMatches: boolean
  detections: Detection[]
  riskLevel: RiskLevel
  summary: string
}

export interface ScanConfig {
  enabledDetectors: DetectorType[]
  whitelistPatterns: string[]
  sensitivityLevel: 'low' | 'medium' | 'high'
}

/**
 * Calcula el riskLevel según las reglas:
 * - critical: >5 datos sensibles O presencia de tarjetas de crédito
 * - high: 2-5 datos sensibles O presencia de IBAN/DNI
 * - medium: 1 dato sensible
 * - low: detección con baja confianza
 * - none: sin detecciones
 */
export function calculateRiskLevel(detections: Detection[]): RiskLevel {
  if (detections.length === 0) {
    return 'none'
  }

  const hasCreditCard = detections.some((d) => d.type === 'CREDIT_CARD')
  if (hasCreditCard || detections.length > 5) {
    return 'critical'
  }

  const hasIbanOrDni = detections.some(
    (d) => d.type === 'IBAN' || d.type === 'DNI'
  )
  if (hasIbanOrDni || (detections.length >= 2 && detections.length <= 5)) {
    return 'high'
  }

  const allLowConfidence = detections.every((d) => d.confidence === 'low')
  if (allLowConfidence) {
    return 'low'
  }

  return 'medium'
}

/**
 * Genera un resumen legible: "2 DNIs y 1 IBAN detectados"
 */
export function buildSummary(detections: Detection[]): string {
  if (detections.length === 0) {
    return 'Sin detecciones'
  }

  const counts = new Map<DetectorType, number>()
  for (const d of detections) {
    counts.set(d.type, (counts.get(d.type) ?? 0) + 1)
  }

  const parts: string[] = []
  for (const [type, count] of counts) {
    parts.push(`${count} ${type}`)
  }

  if (parts.length === 1) {
    return `${parts[0]} detectado${counts.values().next().value! > 1 ? 's' : ''}`
  }

  const last = parts.pop()!
  return `${parts.join(', ')} y ${last} detectados`
}
