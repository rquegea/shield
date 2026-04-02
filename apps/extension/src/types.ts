export interface ExtensionConfig {
  token: string | null
  backendUrl: string
  enabled: boolean
  policyMode: 'warn' | 'block' | 'monitor'
  enabledDetectors: string[]
  whitelistPatterns: string[]
  userEmail: string
  companyDomains: string[]
  whitelistDomains: string[]
}

export interface PlatformSelectors {
  textarea: string
  submit_button: string
  content_area: string
  input_container: string
}

export interface SelectorsCache {
  [platform: string]: PlatformSelectors
}

export interface EventPayload {
  platform: string
  detection_types: string[]
  detection_count: number
  risk_level: string
  action_taken: 'blocked' | 'warned_sent' | 'warned_cancelled' | 'monitored'
  content_preview: string
  user_accepted_risk: boolean
  metadata: Record<string, unknown>
}

export type MessageType =
  | { type: 'SEND_EVENT'; payload: EventPayload }
  | { type: 'GET_CONFIG' }
  | { type: 'GET_SELECTORS' }
  | { type: 'CONFIG_UPDATED'; config: ExtensionConfig }
  | { type: 'SELECTORS_UPDATED'; selectors: SelectorsCache }
