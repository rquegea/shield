import { createClient } from '@/lib/supabase/server'
import { Shield, LayoutDashboard, AlertTriangle, Users } from 'lucide-react'
import { NavLink } from '@/components/nav-link'
import { LogoutButton } from '@/components/logout-button'

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
      <aside className="flex w-60 flex-col border-r bg-muted/30">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">ShieldAI</p>
              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{orgName}</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavLink href="/dashboard" icon={LayoutDashboard}>Panel</NavLink>
          <NavLink href="/dashboard/events" icon={AlertTriangle}>Eventos</NavLink>
          <NavLink href="/dashboard/users" icon={Users}>Usuarios</NavLink>
        </nav>
        <div className="border-t p-3">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
