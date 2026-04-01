import { createClient } from '@/lib/supabase/server'
import { DashboardSidebar } from '@/components/dashboard-sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let orgName = 'ShieldAI'
  if (user) {
    const { data: adminUser } = await supabase
      .from('users')
      .select('org_id')
      .eq('auth_id', user.id)
      .eq('role', 'admin')
      .single()

    if (adminUser) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', adminUser.org_id)
        .single()

      if (org) orgName = org.name
    }
  }

  return (
    <div className="flex min-h-screen">
      <DashboardSidebar orgName={orgName} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
