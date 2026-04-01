import type { Detection, DetectorType, ScanConfig, ScanResult } from './types'
import { calculateRiskLevel, buildSummary } from './types'
import { detectDni } from './patterns/dni'
import { detectNie } from './patterns/nie'
import { detectCif } from './patterns/cif'
import { detectIban } from './patterns/iban'
import { detectCreditCard } from './patterns/credit-card'
import { detectSsnSpain } from './patterns/ssn-spain'
import { detectPhoneSpain } from './patterns/phone-spain'
import { detectEmail } from './patterns/email'

const DETECTOR_MAP: Record<DetectorType, (text: string) => Detection[]> = {
  DNI: detectDni,
  NIE: detectNie,
  CIF: detectCif,
  IBAN: detectIban,
  CREDIT_CARD: detectCreditCard,
  SSN_SPAIN: detectSsnSpain,
  PHONE_SPAIN: detectPhoneSpain,
  EMAIL: detectEmail,
  PASSPORT_SPAIN: () => [], // No implementado aún
}

const ALL_DETECTORS: DetectorType[] = Object.keys(DETECTOR_MAP) as DetectorType[]

const DEFAULT_CONFIG: ScanConfig = {
  enabledDetectors: ALL_DETECTORS,
  whitelistPatterns: [],
  sensitivityLevel: 'medium',
}

const CONFIDENCE_LEVELS: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

export function scanText(text: string, config?: Partial<ScanConfig>): ScanResult {
  const mergedConfig: ScanConfig = { ...DEFAULT_CONFIG, ...config }

  // 1. Ejecutar detectores habilitados
  let detections: Detection[] = []
  for (const detectorType of mergedConfig.enabledDetectors) {
    const detectFn = DETECTOR_MAP[detectorType]
    if (detectFn) {
      detections.push(...detectFn(text))
    }
  }

  // 2. Filtrar por sensitivityLevel
  const minConfidence = mergedConfig.sensitivityLevel === 'low' ? 2
    : mergedConfig.sensitivityLevel === 'medium' ? 1
    : 0
  detections = detections.filter(
    (d) => CONFIDENCE_LEVELS[d.confidence] >= minConfidence
  )

  // 3. Filtrar contra whitelist
  if (mergedConfig.whitelistPatterns.length > 0) {
    const whitelistRegexes = mergedConfig.whitelistPatterns.map(
      (p) => new RegExp(p, 'i')
    )
    detections = detections.filter(
      (d) => !whitelistRegexes.some((re) => re.test(d.value))
    )
  }

  // 4. Eliminar duplicados (mismo valor y tipo)
  const seen = new Set<string>()
  detections = detections.filter((d) => {
    const key = `${d.type}:${d.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 5. Ordenar por posición en el texto
  detections.sort((a, b) => a.start - b.start)

  return {
    hasMatches: detections.length > 0,
    detections,
    riskLevel: calculateRiskLevel(detections),
    summary: buildSummary(detections),
  }
}
