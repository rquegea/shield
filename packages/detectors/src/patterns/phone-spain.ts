import type { Detection } from '../types'

// Con prefijo +34
const PHONE_WITH_PREFIX = /(?<!\d)(\+34)[\s.-]?([679]\d{2})[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/g

// Sin prefijo: 9 dígitos empezando por 6, 7 o 9
const PHONE_WITHOUT_PREFIX = /(?<!\d|\+)([679]\d{2})[\s.-]?(\d{3})[\s.-]?(\d{3})(?!\d)/g

export function detectPhoneSpain(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<number>()
  let match: RegExpExecArray | null

  // Primero detectar con +34 (mayor confianza)
  PHONE_WITH_PREFIX.lastIndex = 0
  while ((match = PHONE_WITH_PREFIX.exec(text)) !== null) {
    const raw = match[0]
    const digits = '+34' + match[2] + match[3] + match[4]

    seen.add(match.index)

    detections.push({
      type: 'PHONE_SPAIN',
      value: digits,
      masked: '****' + digits.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: 'high',
      category: 'CONTACT',
    })
  }

  // Luego sin prefijo (menor confianza)
  PHONE_WITHOUT_PREFIX.lastIndex = 0
  while ((match = PHONE_WITHOUT_PREFIX.exec(text)) !== null) {
    // Evitar duplicados con los que ya tienen +34
    if (seen.has(match.index) || seen.has(match.index - 3) || seen.has(match.index - 4)) continue

    // Verificar que no es parte de un número más largo (como un IBAN o CC)
    const before = text.slice(Math.max(0, match.index - 5), match.index)
    if (/\d/.test(before)) continue

    const raw = match[0]
    const digits = match[1] + match[2] + match[3]

    detections.push({
      type: 'PHONE_SPAIN',
      value: digits,
      masked: '****' + digits.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: 'medium',
      category: 'CONTACT',
    })
  }

  return detections
}
