import { describe, it, expect } from 'vitest'
import { detectBirthdate } from '../src/patterns/birthdate'

describe('detectBirthdate', () => {
  it('detects birthdate with nearby keyword "fecha de nacimiento"', () => {
    const result = detectBirthdate('fecha de nacimiento: 15/03/1990')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'BIRTHDATE',
      value: '15/03/1990',
      confidence: 'medium',
      category: 'PII',
    })
  })

  it('detects birthdate with "nacido el"', () => {
    const result = detectBirthdate('nacido el 01-12-1985')
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('detects birthdate with "born"', () => {
    const result = detectBirthdate('born: 20/05/1975')
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('detects birthdate with "birthday"', () => {
    const result = detectBirthdate('birthday 14/07/1992')
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('detects birthdate with "cumpleaños"', () => {
    const result = detectBirthdate('cumpleaños: 25/12/1988')
    expect(result).toHaveLength(1)
  })

  it('detects birthdate with "DoB"', () => {
    const result = detectBirthdate('DoB: 10/06/1980')
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('medium')
  })

  it('does not detect invoice date without context', () => {
    const result = detectBirthdate('Factura del 15/03/2024')
    // 2024 está fuera del rango (1920-2010)
    expect(result).toHaveLength(0)
  })

  it('detects date with low confidence when no context keyword is present', () => {
    const result = detectBirthdate('15/03/1990')
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('low')
  })

  it('does not detect dates with invalid year (before 1920)', () => {
    const result = detectBirthdate('nacimiento: 01/01/1800')
    expect(result).toHaveLength(0)
  })

  it('does not detect dates with invalid year (after 2010)', () => {
    const result = detectBirthdate('fecha de nacimiento: 15/03/2020')
    expect(result).toHaveLength(0)
  })

  it('does not detect dates with invalid month', () => {
    const result = detectBirthdate('nacido el 01-13-1985')
    expect(result).toHaveLength(0)
  })

  it('does not detect dates with invalid day', () => {
    const result = detectBirthdate('nacido el 32-12-1985')
    expect(result).toHaveLength(0)
  })

  it('supports DD-MM-YYYY format', () => {
    const result = detectBirthdate('fecha de nacimiento: 15-03-1990')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('15-03-1990')
  })

  it('supports DD/MM/YYYY format', () => {
    const result = detectBirthdate('nascita: 20/05/1975')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('20/05/1975')
  })

  it('masks correctly (shows month and year, hides day)', () => {
    const result = detectBirthdate('nacido 15/03/1990')
    expect(result[0].masked).toBe('**/03/1990')
  })

  it('detects birthdate even 50 chars after keyword', () => {
    const result = detectBirthdate('fecha de nacimiento del candidato es aproximadamente 25/06/1985')
    expect(result).toHaveLength(1)
  })

  it('detects birthdate even 50 chars before keyword', () => {
    const result = detectBirthdate('Se registró la fecha 10/04/1995 como fecha de nacimiento')
    expect(result).toHaveLength(1)
  })

  it('detects multiple birthdates', () => {
    const result = detectBirthdate('Padre nacido 01/01/1950 e hijo 15/03/1990')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })
})
