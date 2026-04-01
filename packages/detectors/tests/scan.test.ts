import { describe, it, expect } from 'vitest'
import { scanText } from '../src/index'

describe('scanText', () => {
  it('devuelve riskLevel none para texto sin datos sensibles', () => {
    const result = scanText('Hola, esto es un texto normal sin datos sensibles.')
    expect(result.riskLevel).toBe('none')
    expect(result.detections).toHaveLength(0)
  })
})
