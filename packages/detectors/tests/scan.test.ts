import { describe, it, expect } from 'vitest'
import { scanText } from '../src/index'
import { detectSalaryData } from '../src/patterns/salary-data'
import { detectHealthData } from '../src/patterns/health-data'

describe('scanText', () => {
  it('devuelve riskLevel none para texto sin datos sensibles', () => {
    const result = scanText('Hola, esto es un texto normal sin datos sensibles.')
    expect(result.riskLevel).toBe('none')
    expect(result.maxSeverity).toBe('none')
    expect(result.detections).toHaveLength(0)
  })

  it('IBAN no se detecta como CREDIT_CARD', () => {
    // Test case: IBAN español válido (pasa mod97 validación)
    const result = scanText('Mi IBAN es ES9121000418450200051332')
    // Debería detectar IBAN, no CREDIT_CARD
    expect(result.detections.some(d => d.type === 'IBAN')).toBe(true)
    // No debería haber CREDIT_CARD (porque se solapa con IBAN)
    expect(result.detections.some(d => d.type === 'CREDIT_CARD')).toBe(false)
  })

  it('IBAN con espacios no se detecta como CREDIT_CARD', () => {
    // IBAN válido con espacios
    const result = scanText('IBAN: ES91 2100 0418 4502 0005 1332')
    expect(result.detections.some(d => d.type === 'IBAN')).toBe(true)
    expect(result.detections.some(d => d.type === 'CREDIT_CARD')).toBe(false)
  })
})

describe('Detectores con ventanas reducidas (strong vs weak keywords)', () => {
  it('SALARY: detecta con keyword fuerte (nómina)', () => {
    const text = 'María García recibió una nómina mensual de 2500 euros.'
    const detections = detectSalaryData(text)
    expect(detections.length).toBeGreaterThan(0)
    expect(detections.some(d => d.value.toLowerCase().includes('nómina'))).toBe(true)
  })

  it('SALARY: detecta con keyword débil (bonus) si nombre está cerca', () => {
    const text = 'Juan Rodríguez recibe un bonus mensual de la empresa.'
    const detections = detectSalaryData(text)
    expect(detections.length).toBeGreaterThan(0)
    expect(detections.some(d => d.value.toLowerCase().includes('bonus'))).toBe(true)
  })

  it('HEALTH: detecta con keyword fuerte (diagnóstico)', () => {
    const text = 'El paciente Carlos López recibió un diagnóstico de diabetes tipo 2.'
    const detections = detectHealthData(text)
    expect(detections.length).toBeGreaterThan(0)
    expect(detections.some(d => d.value.toLowerCase().includes('diagnóstico'))).toBe(true)
  })

  it('HEALTH: detecta con keyword débil (nervios) si nombre está cerca', () => {
    const text = 'El paciente Ángel Fernández mencionó que tiene los nervios muy alterados.'
    const detections = detectHealthData(text)
    expect(detections.length).toBeGreaterThan(0)
    expect(detections.some(d => d.value.toLowerCase().includes('nervios'))).toBe(true)
  })
})
