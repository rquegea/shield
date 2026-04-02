import { describe, it, expect } from 'vitest'
import { scanText } from '../src/index'
import { detectEmail } from '../src/patterns/email'

// ============================================================================
// Falsos positivos que NO deben saltar como block/warn
// ============================================================================

describe('Falsos positivos — no deben generar block/warn', () => {
  it('connection string postgres:// no genera detección de email', () => {
    const result = scanText('postgres://user:pass@db.host.com:5432/mydb')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(0)
  })

  it('URL de Calendly no genera detección de email', () => {
    const result = scanText('https://calendly.com/rodrigo-quesada-trucotrufa/30min')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(0)
  })

  it('variable de entorno con email account ID no genera detección de email', () => {
    const result = scanText('UNIPILE_EMAIL_ACCOUNT_ID=abc123')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(0)
  })

  it('noreply@empresa.com debe ser severity info, NO block ni warn', () => {
    const result = scanText('Enviado desde noreply@empresa.com')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(1)
    expect(emailDetections[0].severity).toBe('info')
  })

  it('info@trucoytrufa.es debe ser severity info', () => {
    const result = scanText('Contacta en info@trucoytrufa.es')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(1)
    expect(emailDetections[0].severity).toBe('info')
  })

  it('admin@example.com se descarta (dominio de ejemplo)', () => {
    const detections = detectEmail('admin@example.com')
    expect(detections).toHaveLength(0)
  })

  it('IDs alfanuméricos tipo Apollo (59fe56a7a6da9861955e1ec1) no deben detectar como IBAN', () => {
    const result = scanText('Apollo enrichment error for 59fe56a7a6da9861955e1ec1: 422 Client Error')
    const ibanDetections = result.detections.filter((d) => d.type === 'IBAN')
    expect(ibanDetections).toHaveLength(0)
  })
})

// ============================================================================
// Positivos que SÍ deben saltar
// ============================================================================

describe('Positivos reales — deben generar la severity correcta', () => {
  it('carlos.martinez@empresa.com debe ser severity warn (email real de persona)', () => {
    const result = scanText('El email de Carlos es carlos.martinez@empresa.com')
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    expect(emailDetections).toHaveLength(1)
    expect(emailDetections[0].severity).toBe('warn')
  })

  it('03256344S debe ser severity block (DNI)', () => {
    const result = scanText('DNI: 03256344S')
    const dniDetections = result.detections.filter((d) => d.type === 'DNI')
    expect(dniDetections).toHaveLength(1)
    expect(dniDetections[0].severity).toBe('block')
  })

  it('ES91 2100 0418 4502 0005 1332 debe ser severity block (IBAN)', () => {
    const result = scanText('IBAN: ES91 2100 0418 4502 0005 1332')
    const ibanDetections = result.detections.filter((d) => d.type === 'IBAN')
    expect(ibanDetections).toHaveLength(1)
    expect(ibanDetections[0].severity).toBe('block')
  })

  it('4532 0150 1234 5678 debe ser severity block (tarjeta de crédito)', () => {
    const result = scanText('Tarjeta: 4532 0150 1234 5678')
    const ccDetections = result.detections.filter((d) => d.type === 'CREDIT_CARD')
    expect(ccDetections).toHaveLength(1)
    expect(ccDetections[0].severity).toBe('block')
  })

  it('texto con DNI en minúscula debe ser severity block', () => {
    const result = scanText('necesito que me hagas una nomina para carlos martinez serrano con dni 03256344s')
    const dniDetections = result.detections.filter((d) => d.type === 'DNI')
    expect(dniDetections).toHaveLength(1)
    expect(dniDetections[0].severity).toBe('block')
    expect(result.maxSeverity).toBe('block')
  })
})

// ============================================================================
// maxSeverity en ScanResult
// ============================================================================

describe('maxSeverity en ScanResult', () => {
  it('sin detecciones → maxSeverity none', () => {
    const result = scanText('Texto sin datos sensibles')
    expect(result.maxSeverity).toBe('none')
  })

  it('solo emails genéricos → maxSeverity info', () => {
    const result = scanText('Contacta en noreply@empresa.com')
    expect(result.maxSeverity).toBe('info')
  })

  it('email personal → maxSeverity warn', () => {
    const result = scanText('Email: carlos@empresa.com')
    expect(result.maxSeverity).toBe('warn')
  })

  it('DNI presente → maxSeverity block', () => {
    const result = scanText('DNI 03256344S y email carlos@empresa.com')
    expect(result.maxSeverity).toBe('block')
  })
})

// ============================================================================
// riskLevel basado en severity
// ============================================================================

describe('riskLevel basado en severity', () => {
  it('solo detecciones info → riskLevel low', () => {
    const result = scanText('Contacta en noreply@empresa.com')
    expect(result.riskLevel).toBe('low')
  })

  it('detecciones warn → riskLevel medium', () => {
    const result = scanText('Llama al +34 612 345 678')
    expect(result.riskLevel).toBe('medium')
  })

  it('detecciones block → riskLevel high', () => {
    const result = scanText('DNI: 03256344S')
    expect(result.riskLevel).toBe('high')
  })

  it('tarjeta de crédito → riskLevel critical', () => {
    const result = scanText('Tarjeta: 4532 0150 1234 5678')
    expect(result.riskLevel).toBe('critical')
  })
})

// ============================================================================
// Test de integración — texto real de Apollo
// ============================================================================

describe('Test de integración — texto Apollo', () => {
  it('output de Apollo con IDs alfanuméricos debe ser info o none, NUNCA block', () => {
    const text = `Apollo enrichment error for 59fe56a7a6da9861955e1ec1: 422 Client Error
person_locations: ["Spain", "Mexico", "Colombia", "Argentina"]
El email test se envió exitosamente a rodrigo.quesada@trucoytrufa.es
y el pipeline Prospector Composer Sender está 100% funcional.
Quieres que cambie config.py a LATAM o prefieres otro enfoque?`

    const result = scanText(text)

    // No debe haber detecciones de tipo block
    const blockDetections = result.detections.filter((d) => d.severity === 'block')
    expect(blockDetections).toHaveLength(0)

    // maxSeverity debe ser info o warn (por el email real), NUNCA block
    expect(result.maxSeverity).not.toBe('block')

    // No debe haber IBANs falsos
    const ibanDetections = result.detections.filter((d) => d.type === 'IBAN')
    expect(ibanDetections).toHaveLength(0)

    // El email rodrigo.quesada@trucoytrufa.es es real → severity warn
    const emailDetections = result.detections.filter((d) => d.type === 'EMAIL')
    if (emailDetections.length > 0) {
      expect(emailDetections[0].severity).toBe('warn')
    }
  })
})
