import type { Detection } from '../types'

// Formato actual (desde 2000): 4 dígitos + 3 letras consonantes
const PLATE_SPAIN_REGEX = /(?<!\d)(\d{4})\s?([BCDFGHJKLMNPRSTVWXYZ]{3})(?![A-Za-z])/g

export function detectPlateSpain(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  PLATE_SPAIN_REGEX.lastIndex = 0
  while ((match = PLATE_SPAIN_REGEX.exec(text)) !== null) {
    const digits = match[1]
    const letters = match[2]
    const fullValue = digits + letters

    detections.push({
      type: 'PLATE_SPAIN',
      value: fullValue,
      masked: '****' + letters,
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
      category: 'PII',
      severity: 'warn',
    })
  }

  return detections
}
