import { describe, it, expect } from 'vitest'
import { scanText } from '../src/index'
import { detectIban } from '../src/patterns/iban'

// ============================================================================
// CAMBIO 1: Whitelist automática del usuario y su dominio
// ============================================================================

describe('Whitelist automática de email', () => {
  it('descarta el email del propio usuario si está en config', () => {
    const result = scanText('Mi email es rodrigo@trucoytrufa.es', {
      userEmail: 'rodrigo@trucoytrufa.es',
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(0)
  })

  it('no descarta emails de otras personas aunque compartan dominio', () => {
    const result = scanText('El email de Carlos es carlos@trucoytrufa.es', {
      userEmail: 'rodrigo@trucoytrufa.es',
      companyDomains: ['trucoytrufa.es'],
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(1)
    expect(emails[0].severity).toBe('warn')
  })

  it('descarta emails genéricos del dominio de empresa', () => {
    const result = scanText('Enviar a info@trucoytrufa.es', {
      companyDomains: ['trucoytrufa.es'],
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(0) // info@ es genérico + dominio empresa = descartado
  })

  it('descarta emails genéricos de dominios en whitelist', () => {
    const result = scanText('Contactar en noreply@proveedor.com', {
      whitelistDomains: ['proveedor.com'],
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(0)
  })

  it('NO descarta emails personales de dominios whitelist', () => {
    const result = scanText('Email: carlos@proveedor.com', {
      whitelistDomains: ['proveedor.com'],
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(1)
    expect(emails[0].severity).toBe('warn')
  })

  it('case-insensitive en userEmail', () => {
    const result = scanText('Mi email es Rodrigo@TrucoYTrufa.es', {
      userEmail: 'rodrigo@trucoytrufa.es',
    })
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(0)
  })
})

// ============================================================================
// CAMBIO 2: IBAN solo con MOD-97 válido
// ============================================================================

describe('IBAN — validación MOD-97 estricta', () => {
  it('59fe56a7a6da9861955e1ec1 NO detecta como IBAN (ID hex)', () => {
    const detections = detectIban('59fe56a7a6da9861955e1ec1')
    expect(detections).toHaveLength(0)
  })

  it('ES9121000418450200051332 SÍ detecta como IBAN (pasa MOD-97)', () => {
    const detections = detectIban('ES9121000418450200051332')
    expect(detections).toHaveLength(1)
    expect(detections[0].confidence).toBe('high')
  })

  it('ES91 2100 0418 4502 0005 1332 SÍ detecta (con espacios, pasa MOD-97)', () => {
    const result = scanText('IBAN: ES91 2100 0418 4502 0005 1332')
    const ibans = result.detections.filter((d) => d.type === 'IBAN')
    expect(ibans).toHaveLength(1)
    expect(ibans[0].severity).toBe('block')
  })

  it('ES0000000000000000000000 NO detecta (no pasa MOD-97)', () => {
    const detections = detectIban('ES0000000000000000000000')
    expect(detections).toHaveLength(0)
  })

  it('IBAN con dígitos de control inválidos no detecta', () => {
    const detections = detectIban('ES1234567890123456789012')
    expect(detections).toHaveLength(0)
  })

  it('GB válido detecta (MOD-97)', () => {
    // GB29 NWBK 6016 1331 9268 19 es un IBAN válido de ejemplo
    const detections = detectIban('GB29NWBK60161331926819')
    expect(detections).toHaveLength(1)
  })
})

// ============================================================================
// CAMBIO 3: Preview contextual (verificación indirecta desde scanner)
// ============================================================================

describe('Detecciones incluyen posiciones para preview', () => {
  it('las detecciones tienen start y end correctos', () => {
    const text = 'Mi DNI es 03256344S y vivo en España'
    const result = scanText(text)
    const dni = result.detections.find((d) => d.type === 'DNI')
    expect(dni).toBeDefined()
    expect(dni!.start).toBeGreaterThanOrEqual(0)
    expect(dni!.end).toBeGreaterThan(dni!.start)
    expect(text.slice(dni!.start, dni!.end).toUpperCase()).toContain('03256344S')
  })

  it('múltiples detecciones tienen posiciones no solapadas', () => {
    const text = 'DNI 03256344S y email carlos@empresa.com'
    const result = scanText(text)
    expect(result.detections.length).toBeGreaterThanOrEqual(2)

    // Verificar orden y no solapamiento
    for (let i = 1; i < result.detections.length; i++) {
      expect(result.detections[i].start).toBeGreaterThanOrEqual(result.detections[i - 1].end)
    }
  })
})

// ============================================================================
// Test integración combinado (Sprint 1 + 2 + 3)
// ============================================================================

describe('Integración Sprint 3 completo', () => {
  it('texto completo de Apollo con whitelist no genera block', () => {
    const text = `Apollo enrichment error for 59fe56a7a6da9861955e1ec1: 422 Client Error
person_locations: ["Spain", "Mexico", "Colombia", "Argentina"]
El email test se envió exitosamente a rodrigo.quesada@trucoytrufa.es
y el pipeline Prospector Composer Sender está 100% funcional.
Quieres que cambie config.py a LATAM o prefieres otro enfoque?`

    const result = scanText(text, {
      userEmail: 'rodrigo.quesada@trucoytrufa.es',
      companyDomains: ['trucoytrufa.es'],
    })

    // No debe haber block
    expect(result.maxSeverity).not.toBe('block')
    // Con whitelist del usuario, el email personal se descarta
    const emails = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emails).toHaveLength(0)
    // No IBANs falsos
    const ibans = result.detections.filter((d) => d.type === 'IBAN')
    expect(ibans).toHaveLength(0)
  })

  it('email de RRHH con datos sensibles reales genera block', () => {
    const text = 'La nómina de septiembre de Juan Carlos Pérez García (DNI 12345678Z) refleja el incremento salarial. Su IBAN ES9121000418450200051332.'
    const result = scanText(text)
    expect(result.maxSeverity).toBe('block')
    const dni = result.detections.find((d) => d.type === 'DNI')
    expect(dni).toBeDefined()
    expect(dni!.severity).toBe('block')
    const iban = result.detections.find((d) => d.type === 'IBAN')
    expect(iban).toBeDefined()
    expect(iban!.severity).toBe('block')
  })
})
