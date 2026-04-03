import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords específicos = alta confianza, ventana normal (150 chars)
const STRONG_POLITICAL_KEYWORDS = [
  'delegado sindical', 'delegada sindical', 'representante sindical',
  'comité de empresa', 'afiliación sindical', 'afiliacion sindical',
  'miembro de UGT', 'miembro de CCOO', 'miembro de CGT',
  'militante del', 'militante de', 'militante del PSOE', 'militante de UGT', 'militante de CCOO',
  'es del PP', 'es del PSOE', 'es de Vox', 'es de Podemos', 'es de Sumar', 'es de IU',
  'es católico', 'es católica', 'es musulmán', 'es musulmana',
  'es judío', 'es judía',
  'testigo de Jehová', 'testigo de Jehova',
  'orientación sexual', 'orientacion sexual', 'identidad de género', 'identidad de genero',
  'pareja del mismo sexo',
]

// Keywords genéricos = baja confianza, ventana reducida (40 chars)
const WEAK_POLITICAL_KEYWORDS = [
  'del sindicato', 'es del sindicato', 'sindicalista',
  'afiliado a', 'afiliada a',
  'afiliado al', 'afiliada al', 'simpatizante', 'votante de',
  'católico', 'catolico', 'católica', 'catolica',
  'musulmán', 'musulman', 'musulmana', 'protestante', 'evangélico', 'evangelico',
  'evangelista',
  'judío', 'judio', 'judía', 'judia', 'budista', 'ateo', 'atea', 'agnóstico', 'agnostico',
  'converso', 'conversa',
  'no come cerdo', 'lleva velo', 'ayuna', 'ramadán', 'ramadan',
  'mormón', 'mormon',
  'practicante',
  'homosexual', 'heterosexual', 'bisexual', 'transexual', 'transgénero', 'transgenero',
  'gay', 'lesbiana', 'no binario', 'no binaria', 'pansexual', 'asexual', 'trans',
  'sale del armario', 'ha salido del armario',
]

// Keywords de siglas políticas = CASE-SENSITIVE ONLY (no matchear minúsculas como "pp", "iu")
// Se procesan con un regex separado SIN el flag 'i'
const POLITICAL_SIGLAS = [
  'UGT', 'CCOO', 'CGT', 'USO', 'ELA', 'LAB', 'CIG',
  'PP', 'PSOE', 'Vox', 'Podemos', 'Sumar', 'IU', 'ERC', 'Junts', 'PNV',
]

// Regexes con case-insensitive para palabras/frases genéricas
const STRONG_POLITICAL_PATTERN = new RegExp(
  `\\b(${STRONG_POLITICAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

const WEAK_POLITICAL_PATTERN = new RegExp(
  `\\b(${WEAK_POLITICAL_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

// Regex CASE-SENSITIVE para siglas políticas (solo matchear si están en mayúsculas)
// Sin flag 'i' para que "pp" no matchee "PP", pero "PP" sí
const POLITICAL_SIGLAS_PATTERN = new RegExp(
  `\\b(${POLITICAL_SIGLAS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g' // Solo 'g', sin 'i' para case-sensitive
)

function scanPoliticalKeywords(text: string, pattern: RegExp, windowSize: number): Detection[] {
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
      type: 'POLITICAL_RELIGIOUS',
      value: text.slice(detStart, detEnd),
      masked: `[${nearbyName.name}] + dato protegido`,
      start: detStart,
      end: detEnd,
      confidence: 'high',
      category: 'SPECIAL_CATEGORY',
      severity: 'block',
    })
  }

  return detections
}

export function detectPoliticalReligious(text: string): Detection[] {
  // Pasada 1: Keywords específicos con ventana normal (150)
  const strongDetections = scanPoliticalKeywords(text, STRONG_POLITICAL_PATTERN, 150)

  // Pasada 2: Keywords genéricos con ventana reducida (40)
  const weakDetections = scanPoliticalKeywords(text, WEAK_POLITICAL_PATTERN, 40)

  // Pasada 3: Siglas políticas CASE-SENSITIVE con ventana reducida (40)
  // Solo matchean si están en mayúsculas exactas (PP, UGT, etc., no "pp" o "ugt")
  const siglaDetections = scanPoliticalKeywords(text, POLITICAL_SIGLAS_PATTERN, 40)

  // Combinar, evitando duplicados por position
  const allDetections = [...strongDetections, ...weakDetections, ...siglaDetections]
  const deduped = new Map<string, Detection>()
  for (const det of allDetections) {
    const key = `${det.start}:${det.end}`
    deduped.set(key, det)
  }

  return Array.from(deduped.values())
}
