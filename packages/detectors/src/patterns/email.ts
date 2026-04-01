import type { Detection } from '../types'

const EMAIL_REGEX = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?![A-Za-z0-9])/g

export function detectEmail(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  EMAIL_REGEX.lastIndex = 0
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    const value = match[1]

    // Filtrar dominios que no tienen sentido
    const domain = value.split('@')[1]
    if (!domain || domain.length < 3) continue

    detections.push({
      type: 'EMAIL',
      value,
      masked: '****' + value.slice(-4),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'high',
      category: 'CONTACT',
    })
  }

  return detections
}
