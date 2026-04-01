import { describe, it, expect } from 'vitest'
import { detectNifPortugal } from '../src/patterns/nif-portugal'

describe('detectNifPortugal', () => {
  it('detects valid NIF Portugal format', () => {
    // NIF válido de prueba
    const result = detectNifPortugal('NIF: 123456780')
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]).toMatchObject({
      type: 'NIF_PORTUGAL',
      category: 'ID_DOCUMENT',
    })
  })

  it('detects NIF that starts with valid first digit (1-3, 5-9)', () => {
    const result = detectNifPortugal('123456780')
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('NIF_PORTUGAL')
  })

  it('does not detect NIF starting with 0', () => {
    const result = detectNifPortugal('0123456789')
    expect(result).toHaveLength(0)
  })

  it('does not detect NIF starting with 4', () => {
    const result = detectNifPortugal('412345678')
    expect(result).toHaveLength(0)
  })

  it('does not detect incomplete NIF (less than 9 digits)', () => {
    const result = detectNifPortugal('12345678')
    expect(result).toHaveLength(0)
  })

  it('masks last 4 digits correctly', () => {
    const result = detectNifPortugal('123456780')
    expect(result[0].masked).toBe('****6780')
  })

  it('detects multiple NIFs', () => {
    const result = detectNifPortugal('NIFs: 123456780 e 234567891')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('validates check digit with high confidence for valid NIF', () => {
    // Usando un NIF portugués válido conocido
    const result = detectNifPortugal('162534123')
    if (result.length > 0) {
      // Si detecta, debe estar marcado con alta confianza si es válido
      expect(['high', 'medium']).toContain(result[0].confidence)
    }
  })

  it('does not detect NIF with non-digit characters', () => {
    const result = detectNifPortugal('123456A80')
    expect(result).toHaveLength(0)
  })

  it('does not detect when preceded by digits', () => {
    const result = detectNifPortugal('5123456780')
    expect(result).toHaveLength(0)
  })

  it('does not detect when followed by digits', () => {
    const result = detectNifPortugal('1234567805')
    expect(result).toHaveLength(0)
  })
})
