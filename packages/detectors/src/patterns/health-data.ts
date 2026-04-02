import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican datos de salud
const HEALTH_KEYWORDS = [
  // Diagnósticos / condiciones
  'diagnóstico', 'diagnostico', 'diagnosticado', 'diagnosticada',
  'diabetes', 'azúcar', 'insulina', 'tiroides',
  'cáncer', 'cancer', 'tumor', 'quimio', 'quimioterapia',
  'hipertensión', 'hipertension',
  'depresión', 'depresion', 'depre', 'ansiedad', 'ataque de ansiedad',
  'esquizofrenia', 'bipolar',
  'VIH', 'HIV', 'SIDA', 'hepatitis', 'epilepsia', 'asma',
  'alzheimer', 'parkinson', 'esclerosis', 'fibromialgia',
  'trastorno', 'enfermedad', 'patología', 'patologia', 'síndrome', 'sindrome',
  'corazón', 'corazon', 'tensión', 'tension', 'tensión alta',
  'alergia', 'intolerancia', 'celiaco', 'celíaco',
  'dolor crónico', 'dolor cronico', 'migraña', 'migrana',
  // Salud mental coloquial
  'nervios', 'mal de los nervios', 'los nervios', 'nervioso', 'nerviosa',
  'agotado', 'agotada', 'quemado', 'quemada', 'burnout',
  'estrés', 'estres', 'no puede más', 'no puede mas',
  'desbordado', 'desbordada',
  'pastillas', 'medicación', 'medicacion', 'terapia',
  'psicólogo', 'psicologo', 'psiquiatra', 'médico', 'medico',
  // Tratamientos
  'tratamiento', 'radioterapia',
  'cirugía', 'cirugia', 'operación', 'operacion', 'operar', 'operado', 'operada',
  'intervención', 'intervencion',
  'hospital', 'hospitalizado', 'hospitalizada', 'ingresado', 'ingresada',
  'recuperándose', 'recuperandose', 'convaleciente',
  // Bajas y ausencias
  'baja', 'de baja', 'está de baja', 'sigue de baja', 'vuelve de baja',
  'baja médica', 'baja medica', 'baja laboral', 'baja por enfermedad',
  'incapacidad temporal', 'incapacidad permanente',
  'no viene', 'no ha venido', 'lleva sin venir', 'ausente',
  'parte de baja', 'parte médico', 'parte medico',
  // Estado de salud
  'historial clínico', 'historial clinico', 'historia clínica', 'historia clinica',
  'informe médico', 'informe medico',
  'discapacidad', 'minusvalía', 'minusvalia', 'grado de discapacidad',
  'embarazada', 'embarazo', 'baja maternal', 'maternidad', 'paternidad',
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
