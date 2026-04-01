-- Tabla para almacenar reportes de health check de selectores CSS
CREATE TABLE selector_health_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  missing_elements TEXT[] NOT NULL,
  selectors_used JSONB,
  user_agent TEXT,
  reported_at TIMESTAMPTZ DEFAULT now()
);

-- Índice para buscar rápidamente reportes por plataforma y fecha
CREATE INDEX idx_health_platform_date ON selector_health_reports (platform, reported_at DESC);

-- Índice para buscar por organización
CREATE INDEX idx_health_org ON selector_health_reports (org_id, reported_at DESC);

-- RLS: solo leer/escribir reportes propios
ALTER TABLE selector_health_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org's health reports"
  ON selector_health_reports
  FOR SELECT
  USING (org_id IN (SELECT id FROM organizations WHERE id = auth.uid()));

CREATE POLICY "Users can insert their own health reports"
  ON selector_health_reports
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );
