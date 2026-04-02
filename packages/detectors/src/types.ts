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
  | 'PLATE_SPAIN'
  | 'NIF_PORTUGAL'
  | 'CODICE_FISCALE'
  | 'BIRTHDATE'
  | 'HEALTH_DATA'
  | 'SALARY_DATA'
  | 'POLITICAL_RELIGIOUS'
  | 'CRIMINAL_DATA'
  | 'API_KEY'
  | 'CONNECTION_STRING'
  | 'JWT_TOKEN'
  | 'ENV_SECRET'
  | 'PRIVATE_KEY'

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

export type Confidence = 'high' | 'medium' | 'low'

export type Severity = 'block' | 'warn' | 'info'

export type Category = 'PII' | 'FINANCIAL' | 'CONTACT' | 'ID_DOCUMENT' | 'SPECIAL_CATEGORY' | 'CREDENTIAL' | 'INFRASTRUCTURE'

export interface Detection {
  type: DetectorType
  value: string
  masked: string
  start: number
  end: number
  confidence: Confidence
  category: Category
  severity: Severity
}

export interface ScanResult {
  hasMatches: boolean
  detections: Detection[]
  riskLevel: RiskLevel
  maxSeverity: Severity | 'none'
  summary: string
}

export interface ScanConfig {
  enabledDetectors: DetectorType[]
  whitelistPatterns: string[]
  sensitivityLevel: 'low' | 'medium' | 'high'
  userEmail: string
  companyDomains: string[]
  whitelistDomains: string[]
}

/**
 * Calcula el maxSeverity del array de detecciones.
 * Orden: block > warn > info > none
 */
export function calculateMaxSeverity(detections: Detection[]): Severity | 'none' {
  if (detections.length === 0) return 'none'
  if (detections.some((d) => d.severity === 'block')) return 'block'
  if (detections.some((d) => d.severity === 'warn')) return 'warn'
  return 'info'
}

/**
 * Calcula el riskLevel basado en severity:
 * - Si alguna detección tiene severity block → critical (>5 o CC) / high
 * - Solo warn → medium
 * - Solo info → low
 * - Sin detecciones → none
 */
export function calculateRiskLevel(detections: Detection[]): RiskLevel {
  if (detections.length === 0) {
    return 'none'
  }

  const maxSev = calculateMaxSeverity(detections)

  if (maxSev === 'block') {
    const hasCreditCard = detections.some((d) => d.type === 'CREDIT_CARD')
    const blockCount = detections.filter((d) => d.severity === 'block').length
    if (hasCreditCard || blockCount > 5) {
      return 'critical'
    }
    return 'high'
  }

  if (maxSev === 'warn') {
    return 'medium'
  }

  return 'low'
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
