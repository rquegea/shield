import { useState } from 'react'
import { AutomaticTests } from './components/AutomaticTests'
import { ManualTester } from './components/ManualTester'

type Tab = 'automatic' | 'manual'

export function App() {
  const [tab, setTab] = useState<Tab>('automatic')

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
            <defs>
              <linearGradient id="sg" x1="5" y1="3" x2="25" y2="27" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#3b82f6"/>
                <stop offset="100%" stopColor="#6366f1"/>
              </linearGradient>
            </defs>
            <path d="M15 2L4 7v8c0 7.5 4.7 12.5 11 14 6.3-1.5 11-6.5 11-14V7L15 2z" fill="url(#sg)" opacity="0.9"/>
            <path d="M12.5 15.5l2.5 2.5 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <h1 className="text-lg font-semibold text-slate-200">Guripa AI — Test Runner</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 font-mono">QA</span>

          {/* Tabs */}
          <nav className="flex ml-auto rounded-lg border border-slate-700 overflow-hidden">
            <button
              onClick={() => setTab('automatic')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'automatic'
                  ? 'bg-slate-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Tests automáticos
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'manual'
                  ? 'bg-slate-700 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Tester manual
            </button>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {tab === 'automatic' ? <AutomaticTests /> : <ManualTester />}
      </main>
    </div>
  )
}
