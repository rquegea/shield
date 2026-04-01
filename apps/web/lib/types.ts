// Shared TypeScript types matching API response shapes

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'
export type ActionTaken = 'blocked' | 'warned_sent' | 'warned_cancelled' | 'monitored'
export type PolicyMode = 'warn' | 'block' | 'monitor'
export type UserRole = 'admin' | 'user'

export interface User {
  id: string
  email: string
  name: string | null
  role: UserRole
  group_name: string | null
  extension_token: string
  policy_mode: PolicyMode
  is_active: boolean
  created_at: string
}

export interface Event {
  id: string
  org_id: string
  user_id: string | null
  platform: string
  detection_types: string[]
  detection_count: number
  risk_level: RiskLevel
  action_taken: ActionTaken
  content_preview: string | null
  user_accepted_risk: boolean
  metadata: Record<string, unknown>
  created_at: string
  user: { name: string | null; email: string } | null
}

export interface OrgStats {
  events_today: number
  events_this_week: number
  active_users: number
  risk_level: string
  blocked_count: number
  warned_sent_count: number
  warned_cancelled_count: number
  events_daily: Array<{ date: string; count: number }>
  top_platforms: Array<{ platform: string; count: number }>
  top_detection_types: Array<{ type: string; count: number }>
}

export interface PaginatedEventsResponse {
  events: Event[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}
