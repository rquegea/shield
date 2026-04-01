-- ============================================================================
-- Guripa AI — Schema inicial
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tablas
-- --------------------------------------------------------------------------

CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  plan          TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'professional', 'business')),
  max_users     INTEGER DEFAULT 25,
  settings      JSONB DEFAULT '{}',
  weekly_email_enabled   BOOLEAN DEFAULT true,
  monthly_report_enabled BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  auth_id         UUID,
  email           TEXT NOT NULL,
  name            TEXT,
  role            TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  group_name      TEXT,
  extension_token TEXT UNIQUE,
  policy_mode     TEXT DEFAULT 'warn' CHECK (policy_mode IN ('warn', 'block', 'monitor')),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL,
  detection_types     TEXT[] NOT NULL,
  detection_count     INTEGER NOT NULL,
  risk_level          TEXT NOT NULL CHECK (risk_level IN ('none', 'low', 'medium', 'high', 'critical')),
  action_taken        TEXT NOT NULL CHECK (action_taken IN ('blocked', 'warned_sent', 'warned_cancelled', 'monitored')),
  content_preview     TEXT,
  user_accepted_risk  BOOLEAN DEFAULT false,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  applies_to          TEXT DEFAULT 'all',
  enabled_detectors   TEXT[] DEFAULT ARRAY['DNI','NIE','CIF','IBAN','CREDIT_CARD','SSN_SPAIN','PHONE_SPAIN','EMAIL'],
  blocked_platforms   TEXT[] DEFAULT '{}',
  mode                TEXT DEFAULT 'warn' CHECK (mode IN ('warn', 'block', 'monitor')),
  whitelist_patterns  TEXT[] DEFAULT '{}',
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE platform_selectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    TEXT UNIQUE NOT NULL,
  selectors   JSONB NOT NULL,
  version     INTEGER DEFAULT 1,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Índices
-- --------------------------------------------------------------------------

CREATE INDEX idx_events_org_created      ON events (org_id, created_at DESC);
CREATE INDEX idx_events_user_created     ON events (user_id, created_at DESC);
CREATE INDEX idx_events_org_risk_created ON events (org_id, risk_level, created_at DESC);
CREATE INDEX idx_users_org              ON users (org_id);
CREATE INDEX idx_users_extension_token  ON users (extension_token);

-- --------------------------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------------------------

ALTER TABLE organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_selectors  ENABLE ROW LEVEL SECURITY;

-- Helper: devuelve los org_ids donde el usuario autenticado es admin
CREATE OR REPLACE FUNCTION auth_admin_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid() AND role = 'admin';
$$;

-- Helper: devuelve los org_ids donde el usuario autenticado tiene cuenta
CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM users WHERE auth_id = auth.uid();
$$;

-- organizations: solo admins de esa org
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "org_update" ON organizations
  FOR UPDATE USING (id IN (SELECT auth_admin_org_ids()));

-- users: visibles dentro de la misma org (el admin puede ver todos los de su org)
CREATE POLICY "users_select" ON users
  FOR SELECT USING (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "users_insert" ON users
  FOR INSERT WITH CHECK (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "users_update" ON users
  FOR UPDATE USING (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "users_delete" ON users
  FOR DELETE USING (org_id IN (SELECT auth_admin_org_ids()));

-- events: solo visibles dentro de la misma org
CREATE POLICY "events_select" ON events
  FOR SELECT USING (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "events_insert" ON events
  FOR INSERT WITH CHECK (org_id IN (SELECT auth_user_org_ids()));

-- policies: solo visibles dentro de la misma org
CREATE POLICY "policies_select" ON policies
  FOR SELECT USING (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "policies_insert" ON policies
  FOR INSERT WITH CHECK (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "policies_update" ON policies
  FOR UPDATE USING (org_id IN (SELECT auth_admin_org_ids()));

CREATE POLICY "policies_delete" ON policies
  FOR DELETE USING (org_id IN (SELECT auth_admin_org_ids()));

-- platform_selectors: lectura pública (la extensión los necesita sin auth de admin)
CREATE POLICY "selectors_public_read" ON platform_selectors
  FOR SELECT USING (true);

-- --------------------------------------------------------------------------
-- Datos iniciales: platform_selectors
-- --------------------------------------------------------------------------

INSERT INTO platform_selectors (platform, selectors, version) VALUES
(
  'chatgpt',
  '{
    "textarea": "#prompt-textarea",
    "submit_button": "button[data-testid=\"send-button\"]",
    "content_area": "[class*=\"markdown\"]",
    "input_container": "form.stretch"
  }',
  1
),
(
  'gemini',
  '{
    "textarea": "rich-textarea .ql-editor, .text-input-field textarea",
    "submit_button": "button.send-button, button[aria-label=\"Send message\"]",
    "content_area": ".response-container",
    "input_container": ".input-area-container"
  }',
  1
),
(
  'claude',
  '{
    "textarea": "[contenteditable=\"true\"].ProseMirror, div.ProseMirror",
    "submit_button": "button[aria-label=\"Send Message\"]",
    "content_area": "[class*=\"Message\"]",
    "input_container": ".composer-container"
  }',
  1
);

-- --------------------------------------------------------------------------
-- Función: get_org_stats
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_org_stats(org_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'events_today', (
      SELECT count(*) FROM events
      WHERE org_id = org_uuid
        AND created_at >= date_trunc('day', now())
    ),
    'events_this_week', (
      SELECT count(*) FROM events
      WHERE org_id = org_uuid
        AND created_at >= now() - interval '7 days'
    ),
    'active_users', (
      SELECT count(DISTINCT user_id) FROM events
      WHERE org_id = org_uuid
        AND created_at >= now() - interval '7 days'
        AND user_id IS NOT NULL
    ),
    'risk_level', COALESCE((
      SELECT risk_level FROM events
      WHERE org_id = org_uuid
        AND created_at >= date_trunc('day', now())
      ORDER BY
        CASE risk_level
          WHEN 'critical' THEN 5
          WHEN 'high' THEN 4
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 2
          WHEN 'none' THEN 1
        END DESC
      LIMIT 1
    ), 'none'),
    'blocked_count', (
      SELECT count(*) FROM events
      WHERE org_id = org_uuid
        AND created_at >= now() - interval '7 days'
        AND action_taken = 'blocked'
    ),
    'warned_sent_count', (
      SELECT count(*) FROM events
      WHERE org_id = org_uuid
        AND created_at >= now() - interval '7 days'
        AND action_taken = 'warned_sent'
    ),
    'warned_cancelled_count', (
      SELECT count(*) FROM events
      WHERE org_id = org_uuid
        AND created_at >= now() - interval '7 days'
        AND action_taken = 'warned_cancelled'
    )
  ) INTO result;

  RETURN result;
END;
$$;
