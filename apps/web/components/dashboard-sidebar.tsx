'use client'

import { Shield, LayoutDashboard, AlertTriangle, Users } from 'lucide-react'
import { NavLink } from '@/components/nav-link'
import { LogoutButton } from '@/components/logout-button'

export function DashboardSidebar({ orgName }: { orgName: string }) {
  return (
    <aside className="flex w-60 flex-col border-r bg-muted/30">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Guripa AI</p>
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
  )
}
