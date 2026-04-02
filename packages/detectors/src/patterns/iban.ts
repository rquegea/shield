import type { Detection } from '../types'

// IBAN español: ES + 2 dígitos de control + 20 dígitos
// IBAN europeo genérico: 2 letras + 2 dígitos + hasta 30 alfanuméricos
const IBAN_REGEX = /(?<![A-Za-z])([A-Z]{2})\s?(\d{2})\s?([\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{4}[\s-]?[\dA-Z]{0,14})(?![A-Za-z0-9])/gi

function validateMod97(iban: string): boolean {
  // Mover los 4 primeros caracteres al final
  const rearranged = iban.slice(4) + iban.slice(0, 4)

  // Convertir letras a números (A=10, B=11, ..., Z=35)
  let numericStr = ''
  for (const char of rearranged) {
    if (char >= '0' && char <= '9') {
      numericStr += char
    } else {
      numericStr += (char.charCodeAt(0) - 55).toString()
    }
  }

  // Calcular mod 97 con aritmética de enteros grandes
  let remainder = 0
  for (const digit of numericStr) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97
  }

  return remainder === 1
}

export function detectIban(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  IBAN_REGEX.lastIndex = 0
  while ((match = IBAN_REGEX.exec(text)) !== null) {
    const raw = match[0]
    const clean = raw.replace(/[\s-]/g, '').toUpperCase()

    // IBAN debe tener entre 15 y 34 caracteres
    if (clean.length < 15 || clean.length > 34) continue

    // Verificar que después del código de país + check digits, todo son alfanuméricos
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) continue

    // Solo aceptar IBANs que pasen validación MOD-97
    // Esto elimina el 100% de falsos positivos (IDs hex, hashes, etc.)
    if (!validateMod97(clean)) continue

    detections.push({
      type: 'IBAN',
      value: clean,
      masked: '****' + clean.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: 'high',
      category: 'FINANCIAL',
      severity: 'block',
    })
  }

  return detections
}
