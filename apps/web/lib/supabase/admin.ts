import { createClient } from '@supabase/supabase-js'

// Client con service_role key — bypasses RLS
// Usar SOLO en el backend para operaciones que lo requieran
// (ej: buscar user por extension_token)
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY env variable')
  }

  return createClient(url, serviceKey)
}
