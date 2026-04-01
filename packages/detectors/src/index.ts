// @shieldai/detectors — Librería de detección de datos sensibles

// Tipos y utilidades
export {
  type DetectorType,
  type RiskLevel,
  type Confidence,
  type Category,
  type Detection,
  type ScanResult,
  type ScanConfig,
  calculateRiskLevel,
  buildSummary,
} from './types'

// Función principal
export { scanText } from './scanner'

// Detectores individuales
export { detectDni } from './patterns/dni'
export { detectNie } from './patterns/nie'
export { detectCif } from './patterns/cif'
export { detectIban } from './patterns/iban'
export { detectCreditCard } from './patterns/credit-card'
export { detectSsnSpain } from './patterns/ssn-spain'
export { detectPhoneSpain } from './patterns/phone-spain'
export { detectEmail } from './patterns/email'
export { detectPassportSpain } from './patterns/passport-spain'
export { detectPlateSpain } from './patterns/plate-spain'
export { detectNifPortugal } from './patterns/nif-portugal'
export { detectCodiceFiscale } from './patterns/codice-fiscale'
export { detectBirthdate } from './patterns/birthdate'

// Utilidad de enmascaramiento
export function maskValue(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars) {
    return '****'
  }
  return '****' + value.slice(-visibleChars)
}
