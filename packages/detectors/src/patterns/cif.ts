import type { Detection } from '../types'

// Letras válidas para CIF: A-H, J, N, P, Q, R, S, U, V, W
const CIF_REGEX = /(?<![A-Za-z])([A-Ha-hJ-Nj-nP-Sp-sU-Wu-w])(\d{7})([A-Ja-j0-9])(?![A-Za-z0-9])/g

// Entidades que usan letra de control (no dígito)
const LETTER_CONTROL_TYPES = new Set(['P', 'Q', 'R', 'S', 'N', 'W'])
// Entidades que usan dígito de control
const DIGIT_CONTROL_TYPES = new Set(['A', 'B', 'E', 'H'])
// El resto (C, D, F, G, J, U, V) pueden usar dígito o letra

const CONTROL_LETTERS = 'JABCDEFGHI'

function calculateCifControl(cifDigits: string): { digit: string; letter: string } {
  let sumEven = 0
  let sumOdd = 0

  for (let i = 0; i < 7; i++) {
    const n = parseInt(cifDigits[i], 10)
    if (i % 2 === 0) {
      // Posiciones impares (1, 3, 5, 7) — índice 0, 2, 4, 6
      const doubled = n * 2
      sumOdd += Math.floor(doubled / 10) + (doubled % 10)
    } else {
      // Posiciones pares (2, 4, 6) — índice 1, 3, 5
      sumEven += n
    }
  }

  const total = sumEven + sumOdd
  const controlDigit = (10 - (total % 10)) % 10

  return {
    digit: controlDigit.toString(),
    letter: CONTROL_LETTERS[controlDigit],
  }
}

export function detectCif(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  CIF_REGEX.lastIndex = 0
  while ((match = CIF_REGEX.exec(text)) !== null) {
    const entityType = match[1].toUpperCase()
    const digits = match[2]
    const control = match[3]
    const fullValue = entityType + digits + control.toUpperCase()

    const expected = calculateCifControl(digits)
    let isValid = false

    if (LETTER_CONTROL_TYPES.has(entityType)) {
      isValid = control.toUpperCase() === expected.letter
    } else if (DIGIT_CONTROL_TYPES.has(entityType)) {
      isValid = control === expected.digit
    } else {
      isValid = control === expected.digit || control.toUpperCase() === expected.letter
    }

    detections.push({
      type: 'CIF',
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
