import type { Detection } from '../types'

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
const NIE_PREFIX_MAP: Record<string, string> = { X: '0', Y: '1', Z: '2' }
const NIE_REGEX = /(?<![A-Za-z])([XYZxyz])\s?(\d{7})\s?([A-Za-z])(?![A-Za-z])/g

export function detectNie(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  NIE_REGEX.lastIndex = 0
  while ((match = NIE_REGEX.exec(text)) !== null) {
    const prefix = match[1].toUpperCase()
    const digits = match[2]
    const letter = match[3].toUpperCase()
    const fullValue = prefix + digits + letter

    const numericStr = NIE_PREFIX_MAP[prefix] + digits
    const expectedLetter = DNI_LETTERS[parseInt(numericStr, 10) % 23]
    const isValid = letter === expectedLetter

    detections.push({
      type: 'NIE',
      value: fullValue,
      masked: '****' + fullValue.slice(-4),
      start: match.index,
      end: match.index + match[0].length,
      confidence: isValid ? 'high' : 'medium',
      category: 'ID_DOCUMENT',
      severity: 'block',
    })
  }

  return detections
}
