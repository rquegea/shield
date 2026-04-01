import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// GET /api/events/stats — KPIs agregados para dashboard (auth con session)
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = createClient()

  // Verificar sesión de admin
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !authUser) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', authUser.id)
    .eq('role', 'admin')
    .single()

  if (adminError || !adminUser) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const orgId = adminUser.org_id

  // KPIs base via función RPC
  const { data: stats, error: statsError } = await supabase
    .rpc('get_org_stats', { org_uuid: orgId })

  if (statsError) {
    return NextResponse.json({ error: 'Error al obtener stats' }, { status: 500 })
  }

  // Eventos por día (últimos 30 días)
  const { data: eventsPerDay, error: perDayError } = await supabase
    .from('events')
    .select('created_at')
    .eq('org_id', orgId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })

  if (perDayError) {
    return NextResponse.json({ error: 'Error al obtener eventos por día' }, { status: 500 })
  }

  // Agrupar por día
  const dailyCounts: Record<string, number> = {}
  for (const event of eventsPerDay ?? []) {
    const day = event.created_at.slice(0, 10)
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1
  }

  // Rellenar días sin eventos
  const eventsDaily: Array<{ date: string; count: number }> = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    eventsDaily.push({ date: key, count: dailyCounts[key] ?? 0 })
  }

  // Top plataformas (últimos 30 días)
  const { data: platformEvents, error: platformError } = await supabase
    .from('events')
    .select('platform')
    .eq('org_id', orgId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (platformError) {
    return NextResponse.json({ error: 'Error al obtener plataformas' }, { status: 500 })
  }

  const platformCounts: Record<string, number> = {}
  for (const e of platformEvents ?? []) {
    platformCounts[e.platform] = (platformCounts[e.platform] ?? 0) + 1
  }
  const topPlatforms = Object.entries(platformCounts)
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count)

  // Top tipos de dato detectado (últimos 30 días)
  const { data: typeEvents, error: typeError } = await supabase
    .from('events')
    .select('detection_types')
    .eq('org_id', orgId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (typeError) {
    return NextResponse.json({ error: 'Error al obtener tipos' }, { status: 500 })
  }

  const typeCounts: Record<string, number> = {}
  for (const e of typeEvents ?? []) {
    for (const t of e.detection_types ?? []) {
      typeCounts[t] = (typeCounts[t] ?? 0) + 1
    }
  }
  const topDetectionTypes = Object.entries(typeCounts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    ...stats,
    events_daily: eventsDaily,
    top_platforms: topPlatforms,
    top_detection_types: topDetectionTypes,
  })
}
