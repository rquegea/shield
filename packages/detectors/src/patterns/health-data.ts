import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican datos de salud
const HEALTH_KEYWORDS = [
  // Diagnósticos / condiciones
  'diagnóstico', 'diagnostico', 'diagnosticado', 'diagnosticada',
  'diabetes', 'cáncer', 'cancer', 'hipertensión', 'hipertension',
  'depresión', 'depresion', 'ansiedad', 'esquizofrenia', 'bipolar',
  'VIH', 'HIV', 'SIDA', 'hepatitis', 'epilepsia', 'asma',
  'alzheimer', 'parkinson', 'esclerosis', 'fibromialgia',
  'trastorno', 'enfermedad', 'patología', 'patologia', 'síndrome', 'sindrome',
  // Tratamientos
  'tratamiento', 'medicación', 'medicacion', 'quimioterapia', 'radioterapia',
  'cirugía', 'cirugia', 'operación', 'operacion', 'intervención', 'intervencion',
  // Baja médica
  'baja médica', 'baja medica', 'baja laboral', 'incapacidad temporal',
  'incapacidad permanente', 'baja por enfermedad',
  // Estado de salud
  'historial clínico', 'historial clinico', 'historia clínica', 'historia clinica',
  'informe médico', 'informe medico', 'parte de baja',
  'discapacidad', 'minusvalía', 'minusvalia',
  'embarazada', 'embarazo',
]

const HEALTH_PATTERN = new RegExp(
  `\\b(${HEALTH_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

export function detectHealthData(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  HEALTH_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HEALTH_PATTERN.exec(text)) !== null) {
    const keyword = match[0]
    const keywordStart = match.index
    const keywordEnd = keywordStart + keyword.length

    // Solo detectar si hay un nombre propio cerca
    const nearbyName = hasNameNearby(text, keywordStart, keywordEnd)
    if (!nearbyName) continue

    // Deduplicar por nombre + keyword
    const key = `${nearbyName.name}:${keyword.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

    // El rango de la detección abarca desde el nombre hasta el keyword (o viceversa)
    const detStart = Math.min(nearbyName.start, keywordStart)
    const detEnd = Math.max(nearbyName.end, keywordEnd)

    detections.push({
      type: 'HEALTH_DATA',
      value: text.slice(detStart, detEnd),
      masked: `[${nearbyName.name}] + dato de salud`,
      start: detStart,
      end: detEnd,
      confidence: 'high',
      category: 'SPECIAL_CATEGORY',
      severity: 'block',
    })
  }

  return detections
}
