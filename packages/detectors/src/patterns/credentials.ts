import type { Detection, DetectorType } from '../types'

// ─── API key prefixes ───

const API_KEY_PREFIXES = [
  'sk-', 'pk_', 'sk_live_', 'sk_test_', 'rk_', 'api_', 'key_', 'token_',
  'ghp_', 'glpat-', 'xoxb-', 'xoxp-',
]

// AWS key: AKIA + 16 alphanumeric
const AWS_KEY_REGEX = /\bAKIA[0-9A-Z]{16}\b/g

// Google API key: AIza + 35 chars
const GOOGLE_KEY_REGEX = /\bAIza[0-9A-Za-z_-]{35}\b/g

// Generic prefixed keys: prefix + at least 10 alphanumeric/dash/underscore chars
function buildPrefixRegex(): RegExp {
  const escaped = API_KEY_PREFIXES.map((p) => p.replace(/[-]/g, '\\-'))
  return new RegExp(`(?:^|[\\s='"(])((${escaped.join('|')})[A-Za-z0-9_\\-]{10,})`, 'g')
}
const PREFIX_KEY_REGEX = buildPrefixRegex()

// ─── Connection strings ───

const CONN_STRING_REGEX = /\b((?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp|mssql):\/\/[^\s'")\]]+)/gi

// ─── JWT tokens ───
// Three base64url segments separated by dots, each segment >= 10 chars

const JWT_REGEX = /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g

// ─── Environment variables with secrets ───

const SECRET_VAR_NAMES = /\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|API|AUTH)[A-Z0-9_]*)=([^\s]{4,})\b/g

// ─── Private keys ───

const PRIVATE_KEY_REGEX = /-----BEGIN\s+(?:RSA\s+)?(?:EC\s+)?(?:OPENSSH\s+)?PRIVATE\s+KEY-----/g

// ─── Detector ───

export function detectCredentials(text: string): Detection[] {
  const detections: Detection[] = []
  const seen = new Set<string>()

  function add(type: DetectorType, value: string, start: number, end: number) {
    const key = `${type}:${start}`
    if (seen.has(key)) return
    seen.add(key)
    detections.push({
      type,
      value,
      masked: value.slice(0, 8) + '****',
      start,
      end,
      confidence: 'high',
      category: 'CREDENTIAL',
      severity: 'info',
    })
  }

  // API keys by prefix
  PREFIX_KEY_REGEX.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PREFIX_KEY_REGEX.exec(text)) !== null) {
    const token = m[1]
    const offset = m[0].indexOf(token)
    add('API_KEY', token, m.index + offset, m.index + offset + token.length)
  }

  // AWS keys
  AWS_KEY_REGEX.lastIndex = 0
  while ((m = AWS_KEY_REGEX.exec(text)) !== null) {
    add('API_KEY', m[0], m.index, m.index + m[0].length)
  }

  // Google keys
  GOOGLE_KEY_REGEX.lastIndex = 0
  while ((m = GOOGLE_KEY_REGEX.exec(text)) !== null) {
    add('API_KEY', m[0], m.index, m.index + m[0].length)
  }

  // Connection strings
  CONN_STRING_REGEX.lastIndex = 0
  while ((m = CONN_STRING_REGEX.exec(text)) !== null) {
    add('CONNECTION_STRING', m[1], m.index, m.index + m[1].length)
  }

  // JWT tokens
  JWT_REGEX.lastIndex = 0
  while ((m = JWT_REGEX.exec(text)) !== null) {
    add('JWT_TOKEN', m[1], m.index, m.index + m[1].length)
  }

  // Env secrets
  SECRET_VAR_NAMES.lastIndex = 0
  while ((m = SECRET_VAR_NAMES.exec(text)) !== null) {
    add('ENV_SECRET', m[0], m.index, m.index + m[0].length)
  }

  // Private keys
  PRIVATE_KEY_REGEX.lastIndex = 0
  while ((m = PRIVATE_KEY_REGEX.exec(text)) !== null) {
    add('PRIVATE_KEY', m[0], m.index, m.index + m[0].length)
  }

  return detections
}
