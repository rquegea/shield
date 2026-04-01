import { describe, it, expect } from 'vitest'
import { detectPlateSpain } from '../src/patterns/plate-spain'

describe('detectPlateSpain', () => {
  it('detects valid plate format "1234 BCD"', () => {
    const result = detectPlateSpain('Matrícula: 1234 BCD')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'PLATE_SPAIN',
      value: '1234BCD',
      confidence: 'high',
      category: 'PII',
    })
  })

  it('detects valid plate format "0000BBB"', () => {
    const result = detectPlateSpain('0000BBB')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      type: 'PLATE_SPAIN',
      value: '0000BBB',
    })
  })

  it('does not detect plate with vowel A', () => {
    const result = detectPlateSpain('1234ABC')
    expect(result).toHaveLength(0)
  })

  it('does not detect plate with vowel E', () => {
    const result = detectPlateSpain('5678BED')
    expect(result).toHaveLength(0)
  })

  it('does not detect plate with only 3 digits', () => {
    const result = detectPlateSpain('123BCD')
    expect(result).toHaveLength(0)
  })

  it('detects plate without space', () => {
    const result = detectPlateSpain('1234BCD')
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('1234BCD')
  })

  it('detects multiple plates', () => {
    const result = detectPlateSpain('Placas: 1234BCD y 5678FGH')
    expect(result).toHaveLength(2)
  })

  it('masks last 3 letters correctly', () => {
    const result = detectPlateSpain('1234BCD')
    expect(result[0].masked).toBe('****BCD')
  })

  it('does not detect with invalid consonants like Q', () => {
    const result = detectPlateSpain('1234QRS')
    expect(result).toHaveLength(0)
  })

  it('does not detect with Ñ (Spanish n)', () => {
    const result = detectPlateSpain('1234BÑD')
    expect(result).toHaveLength(0)
  })
})
