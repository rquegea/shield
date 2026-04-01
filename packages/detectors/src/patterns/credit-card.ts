import type { Detection } from '../types'

// Detecta secuencias de 13-19 dígitos con posibles espacios o guiones
const CC_REGEX = /(?<!\d)(\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}|\d{13,19})(?!\d)/g

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

    const isValid = luhnCheck(digits)

    detections.push({
      type: 'CREDIT_CARD',
      value: digits,
      masked: '****' + digits.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: isValid ? 'high' : 'medium',
      category: 'FINANCIAL',
    })
  }

  return detections
}
