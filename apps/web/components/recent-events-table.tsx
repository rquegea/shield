import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { Event } from '@/lib/types'

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'ahora'
  if (minutes < 60) return `hace ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

export function RecentEventsTable({ events }: { events: Event[] }) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No hay eventos recientes
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Usuario</TableHead>
          <TableHead>Plataforma</TableHead>
          <TableHead>Riesgo</TableHead>
          <TableHead>Acción</TableHead>
          <TableHead className="text-right">Cuándo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => (
          <TableRow key={event.id}>
            <TableCell className="font-medium">
              {event.user?.name ?? event.user?.email ?? '—'}
            </TableCell>
            <TableCell className="capitalize">{event.platform}</TableCell>
            <TableCell>
              <Badge variant={riskVariant[event.risk_level] ?? 'secondary'}>
                {riskLabel[event.risk_level] ?? event.risk_level}
              </Badge>
            </TableCell>
            <TableCell>{actionLabel[event.action_taken] ?? event.action_taken}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {timeAgo(event.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
