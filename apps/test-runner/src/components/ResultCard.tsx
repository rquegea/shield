import { useState } from 'react'
import type { ScanResult, Detection } from '@shieldai/detectors'
import type { TestCase } from '../test-cases'

const SEVERITY_COLORS: Record<string, string> = {
  block: 'bg-red-500/15 border-b-2 border-red-500 text-red-300',
  warn: 'bg-amber-500/15 border-b-2 border-amber-500 text-amber-300',
  info: 'bg-blue-500/12 border-b-2 border-blue-500 text-blue-300',
}

function HighlightedText({ text, detections }: { text: string; detections: Detection[] }) {
  if (detections.length === 0) return <span className="text-slate-400 font-mono text-xs">{text}</span>

  const sorted = [...detections].sort((a, b) => a.start - b.start)
  const parts: Array<{ text: string; detection?: Detection }> = []
  let cursor = 0

  for (const det of sorted) {
    if (det.start < cursor) continue
    if (det.start > cursor) {
      parts.push({ text: text.slice(cursor, det.start) })
    }
    parts.push({ text: text.slice(det.start, det.end), detection: det })
    cursor = det.end
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) })
  }

  return (
    <span className="font-mono text-xs leading-relaxed">
      {parts.map((p, i) =>
        p.detection ? (
          <span
            key={i}
            className={`px-0.5 rounded ${SEVERITY_COLORS[p.detection.severity] ?? ''}`}
            title={`${p.detection.type} (${p.detection.severity})`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i} className="text-slate-400">{p.text}</span>
        )
      )}
    </span>
  )
}

export interface TestResult {
  testCase: TestCase
  result: ScanResult
  passed: boolean
}

export function ResultCard({ testResult }: { testResult: TestResult }) {
  const [expanded, setExpanded] = useState(false)
  const { testCase, result, passed } = testResult

  return (
    <div
      className={`rounded-lg border cursor-pointer transition-colors ${
        passed
          ? 'border-green-500/20 bg-green-500/5 hover:bg-green-500/8'
          : 'border-red-500/20 bg-red-500/5 hover:bg-red-500/8'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`text-lg ${passed ? 'text-green-400' : 'text-red-400'}`}>
          {passed ? '\u2713' : '\u2717'}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200 truncate">{testCase.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 shrink-0">
              {testCase.category}
            </span>
          </div>
          {!passed && (
            <div className="text-xs text-red-400 mt-0.5">
              Esperado: <span className="font-mono">{testCase.expectedMaxSeverity}</span>
              {' \u2192 '}
              Obtenido: <span className="font-mono">{result.maxSeverity}</span>
              {testCase.expectedType && result.detections.length > 0 && (
                <span>
                  {' '}(tipos: {result.detections.map((d) => d.type).join(', ')})
                </span>
              )}
            </div>
          )}
        </div>
        <span className="text-slate-500 text-xs">{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50 mt-0 pt-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Texto de entrada</div>
            <div className="bg-slate-900/60 rounded p-2 max-h-32 overflow-y-auto">
              <HighlightedText text={testCase.text} detections={result.detections} />
            </div>
          </div>

          {testCase.description && (
            <div className="text-xs text-slate-500 italic">{testCase.description}</div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">maxSeverity</div>
              <SeverityBadge severity={result.maxSeverity} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">riskLevel</div>
              <span className="text-xs font-mono text-slate-300">{result.riskLevel}</span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Detecciones</div>
              <span className="text-xs font-mono text-slate-300">{result.detections.length}</span>
            </div>
          </div>

          {result.detections.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Detecciones</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left py-1 pr-2">Tipo</th>
                    <th className="text-left py-1 pr-2">Severity</th>
                    <th className="text-left py-1 pr-2">Valor</th>
                    <th className="text-left py-1">Posición</th>
                  </tr>
                </thead>
                <tbody>
                  {result.detections.map((d, i) => (
                    <tr key={i} className="border-t border-slate-800/50">
                      <td className="py-1 pr-2 font-mono text-slate-300">{d.type}</td>
                      <td className="py-1 pr-2"><SeverityBadge severity={d.severity} /></td>
                      <td className="py-1 pr-2 font-mono text-slate-400 truncate max-w-[120px]">{d.masked}</td>
                      <td className="py-1 font-mono text-slate-500">{d.start}-{d.end}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    block: 'bg-red-500/20 text-red-400 border-red-500/30',
    warn: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    none: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  }
  return (
    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${colors[severity] ?? colors.none}`}>
      {severity}
    </span>
  )
}
