import { useState, useMemo } from 'react'
import { scanText } from '@shieldai/detectors'
import type { ScanResult } from '@shieldai/detectors'
import { TEST_CASES, CATEGORIES } from '../test-cases'
import type { TestCase, ExpectedSeverity } from '../test-cases'
import { ResultCard } from './ResultCard'
import type { TestResult } from './ResultCard'

function evaluateTest(tc: TestCase, result: ScanResult): boolean {
  const actual = result.maxSeverity as string

  // Para "none" esperado: el scanner puede devolver "none" (sin detecciones)
  // o "info" si hay detecciones info que no son relevantes
  if (tc.expectedMaxSeverity === 'none') {
    return actual === 'none'
  }

  // Para "info": aceptar info o none
  if (tc.expectedMaxSeverity === 'info') {
    return actual === 'info' || actual === 'none'
  }

  // Para "warn": aceptar warn (no block, no info, no none)
  if (tc.expectedMaxSeverity === 'warn') {
    return actual === 'warn'
  }

  // Para "block": tiene que ser block
  if (tc.expectedMaxSeverity === 'block') {
    if (actual !== 'block') return false
    // Si esperamos un tipo específico, verificar que existe
    if (tc.expectedType) {
      return result.detections.some((d) => d.type === tc.expectedType)
    }
    return true
  }

  return actual === tc.expectedMaxSeverity
}

export function AutomaticTests() {
  const [results, setResults] = useState<TestResult[] | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'passed' | 'failed'>('all')
  const [running, setRunning] = useState(false)

  function runAll() {
    setRunning(true)
    // Use requestAnimationFrame to let the UI update before running
    requestAnimationFrame(() => {
      const testResults: TestResult[] = TEST_CASES.map((tc) => {
        // Para el test fp-propio-email, simular whitelist
        const config = tc.id === 'fp-propio-email'
          ? { userEmail: 'rodrigo.quesada@trucoytrufa.es', companyDomains: ['trucoytrufa.es'] }
          : {}

        // Para dp-matricula, habilitar el detector
        const enableConfig = tc.expectedType === 'PLATE_SPAIN'
          ? { enabledDetectors: ['DNI', 'NIE', 'CIF', 'IBAN', 'CREDIT_CARD', 'SSN_SPAIN', 'PHONE_SPAIN', 'EMAIL', 'PASSPORT_SPAIN', 'PLATE_SPAIN', 'NIF_PORTUGAL', 'CODICE_FISCALE', 'BIRTHDATE'] as const }
          : {}

        const result = scanText(tc.text, { ...config, ...enableConfig })
        const passed = evaluateTest(tc, result)
        return { testCase: tc, result, passed }
      })
      setResults(testResults)
      setRunning(false)
    })
  }

  const filtered = useMemo(() => {
    if (!results) return []
    return results
      .filter((r) => filterCategory === 'all' || r.testCase.category === filterCategory)
      .filter((r) => filterStatus === 'all' || (filterStatus === 'passed' ? r.passed : !r.passed))
      .sort((a, b) => {
        // Failed first
        if (a.passed !== b.passed) return a.passed ? 1 : -1
        return 0
      })
  }, [results, filterCategory, filterStatus])

  const stats = useMemo(() => {
    if (!results) return null
    const total = results.length
    const passed = results.filter((r) => r.passed).length
    const failed = total - passed
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0
    return { total, passed, failed, pct }
  }, [results])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={runAll}
          disabled={running}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
        >
          {running ? 'Ejecutando...' : 'Ejecutar todos los tests'}
        </button>

        {stats && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-400">{stats.total} tests</span>
            <span className="text-green-400">{stats.passed} pasados</span>
            <span className={stats.failed > 0 ? 'text-red-400' : 'text-slate-500'}>{stats.failed} fallados</span>
            <span className={`font-mono font-bold ${stats.pct === 100 ? 'text-green-400' : stats.pct >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
              {stats.pct}%
            </span>
          </div>
        )}
      </div>

      {/* Filters */}
      {results && (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none"
          >
            <option value="all">Todas las categorías</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {(['all', 'passed', 'failed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  filterStatus === s
                    ? 'bg-slate-700 text-slate-200'
                    : 'bg-slate-800/50 text-slate-500 hover:text-slate-300'
                }`}
              >
                {s === 'all' ? 'Todos' : s === 'passed' ? 'Pasados' : 'Fallados'}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500">{filtered.length} resultados</span>
        </div>
      )}

      {/* Results */}
      <div className="space-y-2">
        {filtered.map((r) => (
          <ResultCard key={r.testCase.id} testResult={r} />
        ))}
      </div>

      {!results && (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg mb-2">Pulsa el botón para ejecutar los tests</p>
          <p className="text-sm">{TEST_CASES.length} test cases en {CATEGORIES.length} categorías</p>
        </div>
      )}
    </div>
  )
}
