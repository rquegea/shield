import type { Detection } from '../types'

// Regex para fechas DD/MM/YYYY o DD-MM-YYYY
const BIRTHDATE_REGEX = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g

// Palabras clave que indican una fecha de nacimiento
const BIRTHDATE_KEYWORDS_PATTERN = /\b(nacimiento|nacido|fecha\s+de\s+nac|birth|born|dob|date\s+of\s+birth|cumpleaños|birthday)\b/i

function isValidDate(day: number, month: number, year: number): boolean {
  // Validar rango de año: 1920-2010
  if (year < 1920 || year > 2010) return false

  // Validar mes: 01-12
  if (month < 1 || month > 12) return false

  // Validar día: 01-31
  if (day < 1 || day > 31) return false

  return true
}

function hasNearbyKeyword(text: string, matchIndex: number, matchLength: number): boolean {
  // Buscar palabras clave en un rango de 50 caracteres antes y después
  const start = Math.max(0, matchIndex - 50)
  const end = Math.min(text.length, matchIndex + matchLength + 50)
  const context = text.substring(start, end)

  // Usar search() en lugar de test() para evitar problemas con lastIndex
  return context.search(BIRTHDATE_KEYWORDS_PATTERN) !== -1
}

export function detectBirthdate(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  BIRTHDATE_REGEX.lastIndex = 0
  while ((match = BIRTHDATE_REGEX.exec(text)) !== null) {
    const day = parseInt(match[1], 10)
    const month = parseInt(match[2], 10)
    const year = parseInt(match[3], 10)

    // Validar fecha
    if (!isValidDate(day, month, year)) {
      continue
    }

    const fullValue = match[0]
    const hasKeyword = hasNearbyKeyword(text, match.index, match[0].length)

    // Solo detectar si hay contexto clave o con baja confianza si no hay contexto
    const confidence = hasKeyword ? 'medium' : 'low'

    detections.push({
      type: 'BIRTHDATE',
      value: fullValue,
      masked: '**/' + match[2] + '/' + match[3],
      start: match.index,
      end: match.index + match[0].length,
      confidence,
      category: 'PII',
      severity: 'warn',
    })
  }

  return detections
}
