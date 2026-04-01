import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// POST /api/events — La extensión envía un evento (auth con extension_token)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const admin = createAdminClient()

  // Buscar usuario por extension_token
  const { data: user, error: userError } = await admin
    .from('users')
    .select('id, org_id, is_active')
    .eq('extension_token', token)
    .single()

  if (userError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'Usuario desactivado' }, { status: 401 })
  }

  // Validar body
  const body = await request.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { platform, detection_types, detection_count, risk_level, action_taken, content_preview, user_accepted_risk, metadata } = body

  if (!platform || !detection_types || detection_count == null || !risk_level || !action_taken) {
    return NextResponse.json({ error: 'Campos requeridos: platform, detection_types, detection_count, risk_level, action_taken' }, { status: 400 })
  }

  const validRiskLevels = ['none', 'low', 'medium', 'high', 'critical']
  const validActions = ['blocked', 'warned_sent', 'warned_cancelled', 'monitored']

  if (!validRiskLevels.includes(risk_level)) {
    return NextResponse.json({ error: `risk_level inválido. Valores: ${validRiskLevels.join(', ')}` }, { status: 400 })
  }

  if (!validActions.includes(action_taken)) {
    return NextResponse.json({ error: `action_taken inválido. Valores: ${validActions.join(', ')}` }, { status: 400 })
  }

  // Insertar evento
  const { data: event, error: insertError } = await admin
    .from('events')
    .insert({
      org_id: user.org_id,
      user_id: user.id,
      platform,
      detection_types,
      detection_count,
      risk_level,
      action_taken,
      content_preview: content_preview ?? null,
      user_accepted_risk: user_accepted_risk ?? false,
      metadata: metadata ?? {},
    })
    .select('id, created_at')
    .single()

  if (insertError) {
    return NextResponse.json({ error: 'Error al guardar evento' }, { status: 500 })
  }

  return NextResponse.json({ id: event.id, created_at: event.created_at }, { status: 201 })
}

// ---------------------------------------------------------------------------
// GET /api/events — Dashboard lista eventos (auth con Supabase session)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const supabase = createClient()

  // Verificar sesión de admin
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !authUser) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Obtener org_id del admin
  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('org_id')
    .eq('auth_id', authUser.id)
    .eq('role', 'admin')
    .single()

  if (adminError || !adminUser) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  // Query params
  const params = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') ?? '20', 10)))
  const platform = params.get('platform')
  const riskLevel = params.get('risk_level')
  const userId = params.get('user_id')
  const dateFrom = params.get('date_from')
  const dateTo = params.get('date_to')

  const offset = (page - 1) * limit

  // Construir query con join a users para obtener nombre
  let query = supabase
    .from('events')
    .select('*, user:users(name, email)', { count: 'exact' })
    .eq('org_id', adminUser.org_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (platform) {
    query = query.eq('platform', platform)
  }
  if (riskLevel) {
    query = query.eq('risk_level', riskLevel)
  }
  if (userId) {
    query = query.eq('user_id', userId)
  }
  if (dateFrom) {
    query = query.gte('created_at', dateFrom)
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo)
  }

  const { data: events, count, error: queryError } = await query

  if (queryError) {
    return NextResponse.json({ error: 'Error al consultar eventos' }, { status: 500 })
  }

  return NextResponse.json({
    events,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / limit),
    },
  })
}
