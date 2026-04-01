'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import type { Event, PaginatedEventsResponse } from '@/lib/types'

const riskVariant: Record<string, 'destructive' | 'outline' | 'secondary'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'outline',
  low: 'secondary',
  none: 'secondary',
}

const riskLabel: Record<string, string> = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
  none: 'Ninguno',
}

const actionLabel: Record<string, string> = {
  blocked: 'Bloqueado',
  warned_sent: 'Aceptado',
  warned_cancelled: 'Cancelado',
  monitored: 'Monitoreado',
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)

  // Filters
  const [platform, setPlatform] = useState('')
  const [riskLevel, setRiskLevel] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const fetchEvents = useCallback(async (p: number) => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(p))
    params.set('limit', '20')
    if (platform) params.set('platform', platform)
    if (riskLevel) params.set('risk_level', riskLevel)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    const res = await fetch(`/api/events?${params}`)
    if (res.ok) {
      const data: PaginatedEventsResponse = await res.json()
      setEvents(data.events)
      setPagination(data.pagination)
    }
    setLoading(false)
  }, [platform, riskLevel, dateFrom, dateTo])

  useEffect(() => {
    fetchEvents(page)
  }, [page, fetchEvents])

  function handleFilter() {
    setPage(1)
    fetchEvents(1)
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Eventos</h1>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Plataforma</label>
            <Select value={platform} onValueChange={(v) => setPlatform(v ?? '')}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                <SelectItem value="chatgpt">ChatGPT</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="perplexity">Perplexity</SelectItem>
                <SelectItem value="copilot">Copilot</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Riesgo</label>
            <Select value={riskLevel} onValueChange={(v) => setRiskLevel(v ?? '')}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="critical">Crítico</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="low">Bajo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Desde</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-[150px]"
            />
          </div>
          <Button onClick={handleFilter}>Filtrar</Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha/hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Plataforma</TableHead>
              <TableHead>Datos detectados</TableHead>
              <TableHead>Riesgo</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No se encontraron eventos
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {dateFormatter.format(new Date(event.created_at))}
                  </TableCell>
                  <TableCell className="font-medium">
                    {event.user?.name ?? event.user?.email ?? '—'}
                  </TableCell>
                  <TableCell className="capitalize">{event.platform}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {event.detection_types.map((type) => (
                        <Badge key={type} variant="secondary">{type}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={riskVariant[event.risk_level] ?? 'secondary'}>
                      {riskLabel[event.risk_level] ?? event.risk_level}
                    </Badge>
                  </TableCell>
                  <TableCell>{actionLabel[event.action_taken] ?? event.action_taken}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedEvent(event)}>
                      Detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Página {pagination.page} de {pagination.total_pages}, {pagination.total} eventos totales
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.total_pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => { if (!open) setSelectedEvent(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del evento</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">{dateFormatter.format(new Date(selectedEvent.created_at))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plataforma</p>
                  <p className="font-medium capitalize">{selectedEvent.platform}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Usuario</p>
                  <p className="font-medium">{selectedEvent.user?.name ?? selectedEvent.user?.email ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Riesgo</p>
                  <Badge variant={riskVariant[selectedEvent.risk_level] ?? 'secondary'}>
                    {riskLabel[selectedEvent.risk_level] ?? selectedEvent.risk_level}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Acción</p>
                  <p className="font-medium">{actionLabel[selectedEvent.action_taken] ?? selectedEvent.action_taken}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Datos detectados</p>
                  <p className="font-medium">{selectedEvent.detection_count}</p>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Tipos detectados</p>
                <div className="flex flex-wrap gap-1">
                  {selectedEvent.detection_types.map((t) => (
                    <Badge key={t} variant="secondary">{t}</Badge>
                  ))}
                </div>
              </div>
              {selectedEvent.content_preview && (
                <div>
                  <p className="text-muted-foreground mb-1">Vista previa (enmascarada)</p>
                  <p className="rounded-lg bg-muted p-3 text-xs font-mono break-all">
                    {selectedEvent.content_preview}
                  </p>
                </div>
              )}
              {selectedEvent.user_accepted_risk && (
                <p className="text-sm text-amber-600 font-medium">
                  El usuario aceptó el riesgo de enviar estos datos.
                </p>
              )}
            </div>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  )
}
