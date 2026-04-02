import type { Detection } from '../types'

const PASSPORT_SPAIN_REGEX = /(?<![A-Za-z])([A-Z]{3})(\d{6})(?!\d)/g

export function detectPassportSpain(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  PASSPORT_SPAIN_REGEX.lastIndex = 0
  while ((match = PASSPORT_SPAIN_REGEX.exec(text)) !== null) {
    const fullValue = match[1] + match[2]

    detections.push({
      type: 'PASSPORT_SPAIN',
      value: fullValue,
      masked: match[1] + '***' + match[2].slice(-3),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'medium',
      category: 'ID_DOCUMENT',
      severity: 'block',
    })
  }

  return detections
}
