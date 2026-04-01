import type { Detection } from '../types'

// NSS: 12 dígitos, opcionalmente con barras (XX/XXXXXXXX/XX)
const SSN_REGEX = /(?<!\d)(\d{2})[/-]?(\d{8})[/-]?(\d{2})(?!\d)/g

export function detectSsnSpain(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  SSN_REGEX.lastIndex = 0
  while ((match = SSN_REGEX.exec(text)) !== null) {
    const raw = match[0]
    const digits = match[1] + match[2] + match[3]

    // El primer grupo (provincia) debe estar entre 01 y 53
    const province = parseInt(match[1], 10)
    if (province < 1 || province > 53) continue

    // Filtrar secuencias de dígitos repetidos
    if (/^(\d)\1+$/.test(digits)) continue

    detections.push({
      type: 'SSN_SPAIN',
      value: digits,
      masked: '****' + digits.slice(-4),
      start: match.index,
      end: match.index + raw.length,
      confidence: 'medium',
      category: 'PII',
    })
  }

  return detections
}
