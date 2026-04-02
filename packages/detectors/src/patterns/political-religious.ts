import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican afiliación política, sindical, religiosa u orientación sexual
const POLITICAL_RELIGIOUS_KEYWORDS = [
  // Sindicatos
  'delegado sindical', 'delegada sindical', 'afiliado a', 'afiliada a',
  'afiliación sindical', 'afiliacion sindical', 'miembro de UGT', 'miembro de CCOO',
  'miembro de CGT', 'representante sindical', 'comité de empresa',
  // Partidos políticos
  'militante del', 'militante de', 'afiliado al', 'afiliada al',
  'simpatizante de', 'votante de', 'miembro del',
  // Religión
  'católico', 'catolico', 'católica', 'catolica',
  'musulmán', 'musulman', 'musulmana', 'protestante', 'evangélico', 'evangelico',
  'judío', 'judio', 'judía', 'judia', 'budista', 'ateo', 'atea', 'agnóstico', 'agnostico',
  'practicante', 'converso', 'conversa',
  'testigo de Jehová', 'testigo de Jehova', 'mormón', 'mormon',
  // Orientación sexual
  'homosexual', 'heterosexual', 'bisexual', 'transexual', 'transgénero', 'transgenero',
  'gay', 'lesbiana', 'no binario', 'no binaria', 'pansexual', 'asexual',
  'orientación sexual', 'orientacion sexual', 'identidad de género', 'identidad de genero',
]

const POLITICAL_PATTERN = new RegExp(
  `\\b(${POLITICAL_RELIGIOUS_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
)

export function detectPoliticalReligious(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  POLITICAL_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = POLITICAL_PATTERN.exec(text)) !== null) {
    const keyword = match[0]
    const keywordStart = match.index
    const keywordEnd = keywordStart + keyword.length

    const nearbyName = hasNameNearby(text, keywordStart, keywordEnd)
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
