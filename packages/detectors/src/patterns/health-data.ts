import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords específicos = alta confianza, ventana normal (150 chars)
const STRONG_HEALTH_KEYWORDS = [
  'diagnóstico', 'diagnostico', 'diagnosticado', 'diagnosticada',
  'diabetes', 'cáncer', 'cancer', 'tumor', 'quimioterapia',
  'hipertensión', 'hipertension',
  'esquizofrenia', 'bipolar',
  'VIH', 'HIV', 'SIDA', 'hepatitis', 'epilepsia',
  'alzheimer', 'parkinson', 'esclerosis', 'fibromialgia',
  'baja médica', 'baja medica', 'baja laboral', 'baja por enfermedad',
  'incapacidad temporal', 'incapacidad permanente',
  'historial clínico', 'historial clinico', 'historia clínica', 'historia clinica',
  'informe médico', 'informe medico',
  'embarazada', 'embarazo', 'baja maternal',
]

// Keywords genéricos = baja confianza, ventana reducida (40 chars)
const WEAK_HEALTH_KEYWORDS = [
  'azúcar', 'insulina', 'tiroides', 'quimio',
  'depresión', 'depresion', 'depre', 'ansiedad', 'ataque de ansiedad',
  'asma', 'alergia', 'intolerancia', 'celiaco', 'celíaco',
  'trastorno', 'enfermedad', 'patología', 'patologia', 'síndrome', 'sindrome',
  'corazón', 'corazon', 'tensión', 'tension', 'tensión alta',
  'dolor crónico', 'dolor cronico', 'migraña', 'migrana',
  'nervios', 'mal de los nervios', 'los nervios', 'nervioso', 'nerviosa',
  'agotado', 'agotada', 'quemado', 'quemada', 'burnout',
  'estrés', 'estres', 'no puede más', 'no puede mas',
  'desbordado', 'desbordada',
  'pastillas', 'medicación', 'medicacion', 'terapia',
  'psicólogo', 'psicologo', 'psiquiatra', 'médico', 'medico',
  'tratamiento', 'radioterapia',
  'cirugía', 'cirugia', 'operación', 'operacion', 'operar', 'operado', 'operada',
  'intervención', 'intervencion',
  'hospital', 'hospitalizado', 'hospitalizada', 'ingresado', 'ingresada',
  'recuperándose', 'recuperandose', 'convaleciente',
  'baja', 'de baja', 'está de baja', 'sigue de baja', 'vuelve de baja',
  'no viene', 'no ha venido', 'lleva sin venir', 'ausente',
  'parte de baja', 'parte médico', 'parte medico',
  'discapacidad', 'minusvalía', 'minusvalia', 'grado de discapacidad',
  'maternidad', 'paternidad',
]

const STRONG_HEALTH_PATTERN = new RegExp(
  `\\b(${STRONG_HEALTH_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

const WEAK_HEALTH_PATTERN = new RegExp(
  `\\b(${WEAK_HEALTH_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

function scanHealthKeywords(text: string, pattern: RegExp, windowSize: number): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const keyword = match[0]
    const keywordStart = match.index
    const keywordEnd = keywordStart + keyword.length

    const nearbyName = hasNameNearby(text, keywordStart, keywordEnd, windowSize)
    if (!nearbyName) continue

    const key = `${nearbyName.name}:${keyword.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)

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

export function detectHealthData(text: string): Detection[] {
  // Pasada 1: Keywords específicos con ventana normal (150)
  const strongDetections = scanHealthKeywords(text, STRONG_HEALTH_PATTERN, 150)

  // Pasada 2: Keywords genéricos con ventana reducida (40)
  const weakDetections = scanHealthKeywords(text, WEAK_HEALTH_PATTERN, 40)

  // Combinar, evitando duplicados por position
  const allDetections = [...strongDetections, ...weakDetections]
  const deduped = new Map<string, Detection>()
  for (const det of allDetections) {
    const key = `${det.start}:${det.end}`
    deduped.set(key, det)
  }

  return Array.from(deduped.values())
}
