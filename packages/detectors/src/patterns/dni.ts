import type { Detection } from '../types'

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'
const DNI_REGEX = /(?<!\d)(\d{8})\s?([A-Za-z])(?![A-Za-z])/g

export function detectDni(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  DNI_REGEX.lastIndex = 0
  while ((match = DNI_REGEX.exec(text)) !== null) {
    const digits = match[1]
    const letter = match[2].toUpperCase()
    const fullValue = digits + letter
    const expectedLetter = DNI_LETTERS[parseInt(digits, 10) % 23]
    const isValid = letter === expectedLetter

    detections.push({
      type: 'DNI',
      value: fullValue,
      masked: '****' + fullValue.slice(-4),
      start: match.index,
      end: match.index + match[0].length,
      confidence: isValid ? 'high' : 'medium',
      category: 'ID_DOCUMENT',
    })
  }

  return detections
}
