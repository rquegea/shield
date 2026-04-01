'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KpiCard } from '@/components/kpi-card'
import { EventsChart } from '@/components/events-chart'
import { RecentEventsTable } from '@/components/recent-events-table'
import { AlertTriangle, Users, ShieldOff, AlertCircle } from 'lucide-react'
import type { OrgStats, Event } from '@/lib/types'

export default function DashboardPage() {
  const [stats, setStats] = useState<OrgStats | null>(null)
  const [recentEvents, setRecentEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [statsRes, eventsRes] = await Promise.all([
        fetch('/api/events/stats'),
        fetch('/api/events?limit=10'),
      ])

      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json()
        setRecentEvents(data.events ?? [])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Panel de control</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-8">
                <div className="h-8 w-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Panel de control</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Incidencias hoy"
          value={stats?.events_today ?? 0}
          icon={AlertTriangle}
        />
        <KpiCard
          title="Usuarios activos"
          value={stats?.active_users ?? 0}
          icon={Users}
        />
        <KpiCard
          title="Envíos bloqueados"
          value={stats?.blocked_count ?? 0}
          icon={ShieldOff}
          subtitle="últimos 7 días"
        />
        <KpiCard
          title="Riesgo aceptado"
          value={stats?.warned_sent_count ?? 0}
          icon={AlertCircle}
          subtitle="últimos 7 días"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Eventos últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent>
            <EventsChart data={stats?.events_daily ?? []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas recientes</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentEventsTable events={recentEvents} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
