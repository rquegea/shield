import { useState, useRef, useCallback, useEffect } from 'react'
import { scanText } from '@shieldai/detectors'
import type { ScanResult, Detection } from '@shieldai/detectors'

const SEVERITY_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  block: { bg: 'bg-red-500/15', border: 'border-red-500', badge: 'bg-red-500/20 text-red-400 border-red-500/30' },
  warn: { bg: 'bg-amber-500/15', border: 'border-amber-500', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  info: { bg: 'bg-blue-500/12', border: 'border-blue-500', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  none: { bg: 'bg-slate-500/10', border: 'border-slate-500', badge: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
}

const SEMAPHORE: Record<string, { color: string; label: string }> = {
  block: { color: 'bg-red-500', label: 'BLOCK' },
  warn: { color: 'bg-amber-500', label: 'WARN' },
  info: { color: 'bg-blue-500', label: 'INFO' },
  none: { color: 'bg-green-500', label: 'OK' },
}

interface HistoryEntry {
  text: string
  result: ScanResult
  timestamp: number
}

function HighlightedPreview({ text, detections }: { text: string; detections: Detection[] }) {
  if (!text) return null

  const sorted = [...detections].sort((a, b) => a.start - b.start)
  const parts: Array<{ text: string; detection?: Detection }> = []
  let cursor = 0

  for (const det of sorted) {
    if (det.start < cursor) continue
    if (det.start > cursor) parts.push({ text: text.slice(cursor, det.start) })
    parts.push({ text: text.slice(det.start, det.end), detection: det })
    cursor = det.end
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })

  return (
    <div className="bg-slate-900/60 rounded-lg p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
      {parts.map((p, i) =>
        p.detection ? (
          <span
            key={i}
            className={`px-0.5 rounded border-b-2 ${SEVERITY_COLORS[p.detection.severity]?.bg ?? ''} ${SEVERITY_COLORS[p.detection.severity]?.border ?? ''}`}
            title={`${p.detection.type} (${p.detection.severity})`}
          >
            {p.text}
          </span>
        ) : (
          <span key={i} className="text-slate-400">{p.text}</span>
        )
      )}
    </div>
  )
}

export function ManualTester() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runScan = useCallback((input: string) => {
    if (!input.trim()) {
      setResult(null)
      return
    }
    const r = scanText(input)
    setResult(r)

    // Add to history (max 10)
    setHistory((prev) => {
      const entry: HistoryEntry = { text: input, result: r, timestamp: Date.now() }
      const next = [entry, ...prev.filter((h) => h.text !== input)].slice(0, 10)
      return next
    })
  }, [])

  const handleChange = useCallback((value: string) => {
    setText(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runScan(value), 300)
  }, [runScan])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function copyAsTestCase() {
    if (!result) return
    const tc = {
      id: 'manual-' + Date.now(),
      name: 'Test manual',
      category: 'Manual',
      text,
      expectedMaxSeverity: result.maxSeverity,
      expectedType: result.detections[0]?.type,
    }
    navigator.clipboard.writeText(JSON.stringify(tc, null, 2))
  }

  function handleFileLoad() {
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = reader.result as string
      handleChange(content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const sem = SEMAPHORE[result?.maxSeverity ?? 'none'] ?? SEMAPHORE.none

  return (
    <div className="space-y-4">
      {/* Textarea */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Pega o escribe cualquier texto para escanearlo..."
          rows={8}
          className="w-full bg-slate-900/60 border border-slate-700 rounded-lg p-4 text-sm text-slate-200 font-mono outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-y placeholder:text-slate-600"
        />
        <div className="absolute top-2 right-2 flex items-center gap-2">
          {/* Semaphore */}
          <div className={`w-3 h-3 rounded-full ${sem.color} shadow-lg`} title={sem.label} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={copyAsTestCase}
          disabled={!result}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 border border-slate-700 rounded-lg text-xs transition-colors"
        >
          Copiar como test case
        </button>
        <button
          onClick={handleFileLoad}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs transition-colors"
        >
          Cargar archivo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv,.md,.json"
          onChange={onFileSelected}
          className="hidden"
        />
        {result && (
          <div className="flex items-center gap-3 ml-auto text-xs">
            <span className="text-slate-500">maxSeverity:</span>
            <span className={`font-mono px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[result.maxSeverity]?.badge ?? SEVERITY_COLORS.none.badge}`}>
              {result.maxSeverity}
            </span>
            <span className="text-slate-500">riskLevel:</span>
            <span className="font-mono text-slate-300">{result.riskLevel}</span>
            <span className="text-slate-500">{result.detections.length} detecciones</span>
          </div>
        )}
      </div>

      {/* Preview with highlights */}
      {result && result.detections.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Preview con highlights</div>
          <HighlightedPreview text={text} detections={result.detections} />
        </div>
      )}

      {/* Detections table */}
      {result && result.detections.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Detecciones</div>
          <div className="bg-slate-900/40 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 px-3">Tipo</th>
                  <th className="text-left py-2 px-3">Severity</th>
                  <th className="text-left py-2 px-3">Categoría</th>
                  <th className="text-left py-2 px-3">Texto detectado</th>
                  <th className="text-left py-2 px-3">Posición</th>
                </tr>
              </thead>
              <tbody>
                {result.detections.map((d, i) => (
                  <tr key={i} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono text-slate-300">{d.type}</td>
                    <td className="py-2 px-3">
                      <span className={`font-mono px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[d.severity]?.badge ?? ''}`}>
                        {d.severity}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400">{d.category}</td>
                    <td className="py-2 px-3 font-mono text-slate-400 max-w-[200px] truncate">{text.slice(d.start, d.end)}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{d.start}-{d.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {text.trim() && result && result.detections.length === 0 && (
        <div className="text-center py-8 text-green-400/70 text-sm">
          Sin detecciones de datos sensibles
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Historial reciente</div>
          <div className="space-y-1.5">
            {history.map((h, i) => (
              <div
                key={h.timestamp}
                className="flex items-center gap-3 bg-slate-900/30 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-800/40 transition-colors"
                onClick={() => handleChange(h.text)}
              >
                <div className={`w-2 h-2 rounded-full ${SEMAPHORE[h.result.maxSeverity]?.color ?? 'bg-slate-500'}`} />
                <span className="text-xs text-slate-400 truncate flex-1 font-mono">{h.text.slice(0, 80)}{h.text.length > 80 ? '...' : ''}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[h.result.maxSeverity]?.badge ?? SEVERITY_COLORS.none.badge}`}>
                  {h.result.maxSeverity}
                </span>
                <span className="text-[10px] text-slate-600">{h.result.detections.length}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
