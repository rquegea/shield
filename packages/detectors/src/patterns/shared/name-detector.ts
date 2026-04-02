// Detección de nombres propios españoles en texto
// Busca patrones de "Nombre Apellido" con mayúsculas iniciales
// Retorna las posiciones de los nombres encontrados

export interface NameMatch {
  name: string
  start: number
  end: number
}

// Regex: 2-4 palabras capitalizadas consecutivas (Nombre Apellido1 [Apellido2] [Apellido3])
// Excluye palabras comunes que empiezan con mayúscula por posición en frase
const NAME_REGEX = /(?<![A-Za-zÁÉÍÓÚÑáéíóúñ])([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,})(?:\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}))?(?:\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}))?(?![a-záéíóúñ])/g

// Palabras que parecen nombres pero no lo son (artículos, preposiciones, sustantivos comunes capitalizados)
const NOT_NAMES = new Set([
  // Artículos y preposiciones
  'El', 'La', 'Los', 'Las', 'Un', 'Una', 'Del', 'Al', 'Con', 'Sin', 'Por', 'Para',
  'Desde', 'Hasta', 'Entre', 'Sobre', 'Bajo', 'Ante', 'Tras',
  // Meses y días
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
  // Sustantivos comunes que pueden aparecer capitalizados
  'España', 'Europa', 'Madrid', 'Barcelona', 'Plan', 'Tipo', 'Seguridad', 'Social',
  'Hola', 'Saludos', 'Adjunto', 'Número', 'Cliente', 'Enviar', 'Pasaporte',
  'Referencia', 'Transferir', 'Pagar', 'Llamar', 'Contactar', 'Email',
  // Orgs/partidos/sindicatos como entidad (no persona)
  'Semana', 'Santa', 'Opus', 'Dei',
])

export function findNames(text: string): NameMatch[] {
  const matches: NameMatch[] = []

  NAME_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = NAME_REGEX.exec(text)) !== null) {
    const words = [match[1], match[2], match[3], match[4]].filter(Boolean) as string[]

    // Al menos las 2 primeras palabras no deben ser de la lista de exclusión
    if (NOT_NAMES.has(words[0]) || NOT_NAMES.has(words[1])) continue

    // Filtrar matches donde todas las palabras son de exclusión
    const realNameWords = words.filter((w) => !NOT_NAMES.has(w))
    if (realNameWords.length < 2) continue

    const fullName = words.join(' ')
    matches.push({
      name: fullName,
      start: match.index,
      end: match.index + fullName.length,
    })
  }

  return matches
}

/**
 * Busca si hay un nombre propio cerca (dentro de windowSize caracteres)
 * de una posición dada en el texto.
 */
export function hasNameNearby(
  text: string,
  keywordStart: number,
  keywordEnd: number,
  windowSize = 150,
): NameMatch | null {
  const names = findNames(text)
  for (const name of names) {
    // Calcular distancia entre el keyword y el nombre
    const distance = Math.min(
      Math.abs(name.start - keywordEnd),
      Math.abs(keywordStart - name.end),
    )
    // Si se solapan, distancia = 0
    const overlaps = name.start < keywordEnd && name.end > keywordStart
    if (overlaps || distance <= windowSize) {
      return name
    }
  }
  return null
}
