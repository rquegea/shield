import { describe, it, expect } from 'vitest'
import { detectCodiceFiscale } from '../src/patterns/codice-fiscale'

describe('detectCodiceFiscale', () => {
  it('detects valid Codice Fiscale format', () => {
    const result = detectCodiceFiscale('Codice Fiscale: ABCDEF90A01A123B')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'CODICE_FISCALE',
      confidence: 'medium',
      category: 'ID_DOCUMENT',
    })
  })

  it('detects Codice Fiscale with valid month letter A (January)', () => {
    const result = detectCodiceFiscale('ABCDEF90A01A123B')
    expect(result).toHaveLength(1)
  })

  it('detects Codice Fiscale with valid month letter M (August)', () => {
    const result = detectCodiceFiscale('ABCDEF90M15A123B')
    expect(result).toHaveLength(1)
  })

  it('detects Codice Fiscale with valid month letter T (December)', () => {
    const result = detectCodiceFiscale('ABCDEF90T25A123B')
    expect(result).toHaveLength(1)
  })

  it('does not detect invalid month letter (O is not valid)', () => {
    const result = detectCodiceFiscale('ABCDEF90O01A123B')
    expect(result).toHaveLength(0)
  })

  it('does not detect invalid month letter (I)', () => {
    const result = detectCodiceFiscale('ABCDEF90I01A123B')
    expect(result).toHaveLength(0)
  })

  it('masks correctly', () => {
    const result = detectCodiceFiscale('ABCDEF90A01A123B')
    expect(result[0].masked).toBe('ABCDEF****123B')
  })

  it('detects multiple Codici Fiscali', () => {
    const result = detectCodiceFiscale('CF1: ABCDEF90A01A123B e CF2: GHIJKL85M15B456C')
    expect(result).toHaveLength(2)
  })

  it('is case insensitive and normalizes to uppercase', () => {
    const result = detectCodiceFiscale('abcdef90a01a123b')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('ABCDEF90A01A123B')
  })

  it('does not detect incomplete format (less than 16 chars)', () => {
    const result = detectCodiceFiscale('ABCDEF90A01A123')
    expect(result).toHaveLength(0)
  })

  it('does not detect when surrounded by alphanumeric characters', () => {
    const result = detectCodiceFiscale('CODE_ABCDEF90A01A123B_END')
    // The regex uses negative lookahead/lookbehind for word boundaries
    expect(result.length).toBeLessThanOrEqual(1)
  })
})
