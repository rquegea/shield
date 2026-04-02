import type { Detection } from '../types'

// Formato: 6 letras + 2 dígitos + 1 letra + 2 dígitos + 1 letra + 3 dígitos + 1 letra (total 16 caracteres)
// Mes: A=enero, B=feb, C=mar, D=abr, E=mayo, H=junio, L=julio, M=agosto, P=sept, R=oct, S=nov, T=dic
const CODICE_FISCALE_REGEX = /(?<![A-Za-z0-9])([A-Z]{6}\d{2}[ABCDEHLMPRST]\d{2}[A-Z]\d{3}[A-Z])(?![A-Za-z0-9])/gi

export function detectCodiceFiscale(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  CODICE_FISCALE_REGEX.lastIndex = 0
  while ((match = CODICE_FISCALE_REGEX.exec(text)) !== null) {
    const fullValue = match[1].toUpperCase()

    detections.push({
      type: 'CODICE_FISCALE',
      value: fullValue,
      masked: fullValue.slice(0, 6) + '****' + fullValue.slice(-4),
      start: match.index,
      end: match.index + match[0].length,
      confidence: 'medium',
      category: 'ID_DOCUMENT',
      severity: 'block',
    })
  }

  return detections
}
