import type { Detection } from '../types'
import { hasNameNearby } from './shared/name-detector'

// Keywords que indican afiliación política, sindical, religiosa u orientación sexual
const POLITICAL_RELIGIOUS_KEYWORDS = [
  // Sindicatos coloquial
  'del sindicato', 'es del sindicato', 'sindicalista',
  'delegado sindical', 'delegada sindical', 'representante sindical',
  'comité de empresa', 'afiliado a', 'afiliada a',
  'afiliación sindical', 'afiliacion sindical',
  'miembro de UGT', 'miembro de CCOO', 'miembro de CGT',
  'UGT', 'CCOO', 'CGT', 'USO', 'ELA', 'LAB', 'CIG',
  'huelga', 'paro', 'manifestación',
  // Partidos políticos
  'militante', 'militante del', 'militante de',
  'afiliado al', 'afiliada al', 'simpatizante', 'votante de',
  'es del PP', 'es del PSOE', 'es de Vox', 'es de Podemos', 'es de Sumar', 'es de IU',
  'PP', 'PSOE', 'Vox', 'Podemos', 'Sumar', 'IU', 'ERC', 'Junts', 'PNV',
  // Religión coloquial
  'es católico', 'es católica', 'es musulmán', 'es musulmana',
  'es judío', 'es judía', 'practicante',
  'católico', 'catolico', 'católica', 'catolica',
  'musulmán', 'musulman', 'musulmana', 'protestante', 'evangélico', 'evangelico',
  'evangelista',
  'judío', 'judio', 'judía', 'judia', 'budista', 'ateo', 'atea', 'agnóstico', 'agnostico',
  'converso', 'conversa',
  'no come cerdo', 'lleva velo', 'ayuna', 'ramadán', 'ramadan',
  'testigo de Jehová', 'testigo de Jehova', 'mormón', 'mormon',
  // Orientación sexual
  'homosexual', 'heterosexual', 'bisexual', 'transexual', 'transgénero', 'transgenero',
  'gay', 'lesbiana', 'no binario', 'no binaria', 'pansexual', 'asexual', 'trans',
  'orientación sexual', 'orientacion sexual', 'identidad de género', 'identidad de genero',
  'sale del armario', 'ha salido del armario',
  'pareja del mismo sexo',
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
