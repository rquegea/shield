import type { Detection } from '../types'

// Detecta secuencias de 13-19 dígitos con posibles espacios o guiones
const CC_REGEX = /(?<!\d)(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}|\d{13,19})(?!\d)/g

// Patrón para detectar si un match está dentro de un IBAN
// IBAN: código país (2 letras) + 2 dígitos de control + resto de dígitos/letras
const IBAN_PREFIX_PATTERN = /[A-Z]{2}\d{2}/

function luhnCheck(digits: string): boolean {
  let sum = 0
  let alternate = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }

  return sum % 10 === 0
}

/**
 * Verifica si una posición está dentro de un IBAN buscando el patrón
 * de prefijo IBAN (XX + 2 dígitos) que anteceda al match.
 */
function isWithinIban(text: string, matchStart: number): boolean {
  // Buscar hacia atrás desde matchStart para encontrar un prefijo IBAN
  // Un IBAN generalmente empieza 2-4 caracteres antes del área de dígitos
  for (let i = Math.max(0, matchStart - 10); i < matchStart; i++) {
    const chunk = text.slice(i, i + 4)
    if (IBAN_PREFIX_PATTERN.test(chunk)) {
      // Encontrado: XX + 2 dígitos. El match está probablemente dentro del IBAN
      return true
    }
  }
  return false
}

export function detectCreditCard(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  CC_REGEX.lastIndex = 0
  while ((match = CC_REGEX.exec(text)) !== null) {
    const raw = match[0]
    const digits = raw.replace(/[\s-]/g, '')

    if (digits.length < 13 || digits.length > 19) continue
    if (!/^\d+$/.test(digits)) continue

    // Filtrar secuencias de dígitos repetidos (000...0, 111...1, etc.)
    if (/^(\d)\1+$/.test(digits)) continue

    // NUEVA VALIDACIÓN: Si el match está dentro de un IBAN, descartarlo
    if (isWithinIban(text, match.index)) continue

    const isValid = luhnCheck(digits)

    detections.push({
      type: 'CREDIT_CARD',
      value: digits,
      masked: '****' + digits.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: isValid ? 'high' : 'medium',
      category: 'FINANCIAL',
      severity: 'block',
    })
  }

  return detections
}
