import type { Detection, Severity } from '../types'

const EMAIL_REGEX = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?![A-Za-z0-9])/g

const GENERIC_LOCAL_PARTS = new Set([
  'info', 'admin', 'noreply', 'soporte', 'contact', 'webmaster',
  'no-reply', 'postmaster', 'hostmaster', 'abuse',
])

// Dominios de ejemplo/placeholder que nunca son emails reales
const EXAMPLE_DOMAINS = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.org',
  'localhost', 'mail.example.com',
])

export function detectEmail(text: string): Detection[] {
  const detections: Detection[] = []
  let match: RegExpExecArray | null

  EMAIL_REGEX.lastIndex = 0
  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    const value = match[1]
    const matchStart = match.index

    // Filtrar dominios que no tienen sentido
    const domain = value.split('@')[1]
    if (!domain || domain.length < 3) continue

    // Descartar si está precedido por :// (es parte de una URL/connection string)
    const prefix = text.slice(Math.max(0, matchStart - 3), matchStart)
    if (prefix.endsWith('://')) continue

    // Descartar si hay :// antes en la misma "palabra" (connection string tipo user:pass@host)
    // Buscar hacia atrás hasta 80 chars para encontrar ://
    const lookback = text.slice(Math.max(0, matchStart - 80), matchStart)
    if (/:\/\/[^\s]*$/.test(lookback)) continue

    // Descartar si hay :dígitos justo después (host:puerto, no email)
    const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 10)
    if (/^:\d+/.test(afterMatch)) continue

    // Descartar dominios de ejemplo/placeholder
    if (EXAMPLE_DOMAINS.has(domain.toLowerCase())) continue

    // Determinar severity
    const localPart = value.split('@')[0].toLowerCase()
    let severity: Severity = 'warn'
    if (GENERIC_LOCAL_PARTS.has(localPart)) {
      severity = 'info'
    }

    detections.push({
      type: 'EMAIL',
      value,
      masked: '****' + value.slice(-4),
      start: matchStart,
      end: matchStart + match[0].length,
      confidence: 'high',
      category: 'CONTACT',
      severity,
    })
  }

  return detections
}
