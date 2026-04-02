import type { Detection, DetectorType, ScanConfig, ScanResult } from './types'
import { calculateRiskLevel, calculateMaxSeverity, buildSummary } from './types'
import { detectDni } from './patterns/dni'
import { detectNie } from './patterns/nie'
import { detectCif } from './patterns/cif'
import { detectIban } from './patterns/iban'
import { detectCreditCard } from './patterns/credit-card'
import { detectSsnSpain } from './patterns/ssn-spain'
import { detectPhoneSpain } from './patterns/phone-spain'
import { detectEmail } from './patterns/email'
import { detectPassportSpain } from './patterns/passport-spain'
import { detectPlateSpain } from './patterns/plate-spain'
import { detectNifPortugal } from './patterns/nif-portugal'
import { detectCodiceFiscale } from './patterns/codice-fiscale'
import { detectBirthdate } from './patterns/birthdate'
import { detectHealthData } from './patterns/health-data'
import { detectSalaryData } from './patterns/salary-data'
import { detectPoliticalReligious } from './patterns/political-religious'
import { detectCriminalData } from './patterns/criminal-data'
import { detectCredentials } from './patterns/credentials'

const DETECTOR_MAP: Record<DetectorType, (text: string) => Detection[]> = {
  DNI: detectDni,
  NIE: detectNie,
  CIF: detectCif,
  IBAN: detectIban,
  CREDIT_CARD: detectCreditCard,
  SSN_SPAIN: detectSsnSpain,
  PHONE_SPAIN: detectPhoneSpain,
  EMAIL: detectEmail,
  PASSPORT_SPAIN: detectPassportSpain,
  PLATE_SPAIN: detectPlateSpain,
  NIF_PORTUGAL: detectNifPortugal,
  CODICE_FISCALE: detectCodiceFiscale,
  BIRTHDATE: detectBirthdate,
  HEALTH_DATA: detectHealthData,
  SALARY_DATA: detectSalaryData,
  POLITICAL_RELIGIOUS: detectPoliticalReligious,
  CRIMINAL_DATA: detectCriminalData,
}

const CREDENTIAL_TYPES: DetectorType[] = ['API_KEY', 'CONNECTION_STRING', 'JWT_TOKEN', 'ENV_SECRET', 'PRIVATE_KEY']
const ALL_DETECTORS: DetectorType[] = [...Object.keys(DETECTOR_MAP) as DetectorType[], ...CREDENTIAL_TYPES]

// PLATE_SPAIN es opcional y no está habilitado por defecto
const DEFAULT_ENABLED_DETECTORS: DetectorType[] = ALL_DETECTORS.filter((d) => d !== 'PLATE_SPAIN')

const DEFAULT_CONFIG: ScanConfig = {
  enabledDetectors: DEFAULT_ENABLED_DETECTORS,
  whitelistPatterns: [],
  sensitivityLevel: 'medium',
  userEmail: '',
  companyDomains: [],
  whitelistDomains: [],
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

  // 1b. Detector de credenciales (multi-tipo: API_KEY, CONNECTION_STRING, etc.)
  if (CREDENTIAL_TYPES.some((t) => mergedConfig.enabledDetectors.includes(t))) {
    const credDetections = detectCredentials(text)
    detections.push(...credDetections.filter((d) => mergedConfig.enabledDetectors.includes(d.type)))
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

  // 3b. Filtrar emails del propio usuario y dominios de empresa
  const userEmail = mergedConfig.userEmail?.toLowerCase()
  const allWhitelistDomains = [
    ...mergedConfig.companyDomains,
    ...mergedConfig.whitelistDomains,
  ].map((d) => d.toLowerCase())

  if (userEmail || allWhitelistDomains.length > 0) {
    detections = detections.filter((d) => {
      if (d.type !== 'EMAIL') return true
      const emailLower = d.value.toLowerCase()

      // Descartar email exacto del usuario
      if (userEmail && emailLower === userEmail) return false

      // Descartar emails genéricos de dominios de empresa/whitelist
      if (allWhitelistDomains.length > 0 && d.severity === 'info') {
        const domain = emailLower.split('@')[1]
        if (domain && allWhitelistDomains.includes(domain)) return false
      }

      return true
    })
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
    maxSeverity: calculateMaxSeverity(detections),
    summary: buildSummary(detections),
  }
}
