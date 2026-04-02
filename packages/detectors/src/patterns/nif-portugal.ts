import type { Detection } from '../types'

const NIF_PORTUGAL_REGEX = /(?<!\d)([12356789]\d{8})(?!\d)/g

function validateNifPortugal(nif: string): boolean {
  if (nif.length !== 9) return false

  const digits = nif.split('').map(Number)
  const weights = [9, 8, 7, 6, 5, 4, 3, 2]

  // Calcular suma
  let sum = 0
  for (let i = 0; i < 8; i++) {
    sum += digits[i] * weights[i]
  }

  // Calcular dígito de control
  const remainder = sum % 11
  let expectedCheckDigit = 0
  if (remainder !== 0 && remainder !== 1) {
    expectedCheckDigit = 11 - remainder
  }

  return digits[8] === expectedCheckDigit
}

export function detectNifPortugal(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  NIF_PORTUGAL_REGEX.lastIndex = 0
  while ((match = NIF_PORTUGAL_REGEX.exec(text)) !== null) {
    const fullValue = match[1]
    const isValid = validateNifPortugal(fullValue)

    detections.push({
      type: 'NIF_PORTUGAL',
      value: fullValue,
      masked: '****' + fullValue.slice(-4),
      start: match.index,
      end: match.index + match[0].length,
      confidence: isValid ? 'high' : 'medium',
      category: 'ID_DOCUMENT',
      severity: 'warn',
    })
  }

  return detections
}
