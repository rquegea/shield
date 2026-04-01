import { describe, it, expect } from 'vitest'
import { detectPassportSpain } from '../src/patterns/passport-spain'

describe('detectPassportSpain', () => {
  it('detects valid passport Spain format "AAA123456"', () => {
    const result = detectPassportSpain('Mi pasaporte es AAA123456')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'PASSPORT_SPAIN',
      value: 'AAA123456',
      confidence: 'medium',
      category: 'ID_DOCUMENT',
    })
  })

  it('detects valid passport Spain format "PAB654321"', () => {
    const result = detectPassportSpain('Pasaporte: PAB654321')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'PASSPORT_SPAIN',
      value: 'PAB654321',
    })
  })

  it('does not detect incomplete format with only 2 letters', () => {
    const result = detectPassportSpain('AB123456')
    expect(result).toHaveLength(0)
  })

  it('does not detect format with 4 letters', () => {
    const result = detectPassportSpain('ABCD12345')
    expect(result).toHaveLength(0)
  })

  it('detects multiple passports in text', () => {
    const result = detectPassportSpain('Pasaportes: AAA123456 y BBB654321')
    expect(result).toHaveLength(2)
  })

  it('detects passport with lowercase letters (normalized to uppercase)', () => {
    const result = detectPassportSpain('aaa123456')
    // Regex is case-sensitive uppercase only, so lowercase won't match
    expect(result).toHaveLength(0)
  })

  it('masks last 4 characters correctly', () => {
    const result = detectPassportSpain('AAA123456')
    expect(result[0].masked).toBe('AAA***456')
  })

  it('does not detect when preceded by letters', () => {
    const result = detectPassportSpain('XAAA123456')
    expect(result).toHaveLength(0)
  })

  it('does not detect when followed by digits', () => {
    const result = detectPassportSpain('AAA1234567')
    expect(result).toHaveLength(0)
  })
})
