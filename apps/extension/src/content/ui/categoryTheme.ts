// Tema visual dinámico por categoría de detección
// Compartido entre InlineBanner y WarningModal

import type { Category, Detection } from '@shieldai/detectors'

// --- Configuración visual por categoría ---

export interface CategoryTheme {
  label: string
  bg: string
  gradient: string
  iconColor: string
  iconBg: string
  dotColor: string
  btnColor: string
  btnBorder: string
  btnHoverBg: string
  hlUnderline: string
}

const THEMES: Record<Category, CategoryTheme> = {
  ID_DOCUMENT: {
    label: 'Identificador personal',
    bg: '#FFF0E6',
    gradient: 'linear-gradient(135deg, rgba(255,240,230,0.95), rgba(255,236,214,0.95), rgba(255,240,230,0.95))',
    iconColor: '#F4A261',
    iconBg: 'rgba(244,162,97,0.15)',
    dotColor: '#F4A261',
    btnColor: '#D4763A',
    btnBorder: 'rgba(244,162,97,0.5)',
    btnHoverBg: 'rgba(244,162,97,0.10)',
    hlUnderline: '#F4A261',
  },
  FINANCIAL: {
    label: 'Dato financiero',
    bg: '#FFF0F0',
    gradient: 'linear-gradient(135deg, rgba(255,240,240,0.95), rgba(255,232,232,0.95), rgba(255,240,240,0.95))',
    iconColor: '#E76F6F',
    iconBg: 'rgba(231,111,111,0.15)',
    dotColor: '#E76F6F',
    btnColor: '#C74B4B',
    btnBorder: 'rgba(231,111,111,0.5)',
    btnHoverBg: 'rgba(231,111,111,0.10)',
    hlUnderline: '#E76F6F',
  },
  CONTACT: {
    label: 'Dato de contacto',
    bg: '#FFFDE7',
    gradient: 'linear-gradient(135deg, rgba(255,253,231,0.95), rgba(255,249,196,0.95), rgba(255,253,231,0.95))',
    iconColor: '#E5B800',
    iconBg: 'rgba(229,184,0,0.15)',
    dotColor: '#E5B800',
    btnColor: '#B89200',
    btnBorder: 'rgba(229,184,0,0.5)',
    btnHoverBg: 'rgba(229,184,0,0.10)',
    hlUnderline: '#E5B800',
  },
  PII: {
    label: 'Dato personal',
    bg: '#F0EDFF',
    gradient: 'linear-gradient(135deg, rgba(240,237,255,0.95), rgba(232,228,255,0.95), rgba(240,237,255,0.95))',
    iconColor: '#7C6FE0',
    iconBg: 'rgba(124,111,224,0.15)',
    dotColor: '#7C6FE0',
    btnColor: '#5F52C4',
    btnBorder: 'rgba(124,111,224,0.5)',
    btnHoverBg: 'rgba(124,111,224,0.10)',
    hlUnderline: '#7C6FE0',
  },
  SPECIAL_CATEGORY: {
    label: 'Dato especialmente protegido',
    bg: '#FFF0F0',
    gradient: 'linear-gradient(135deg, rgba(255,240,240,0.95), rgba(255,224,224,0.95), rgba(255,240,240,0.95))',
    iconColor: '#DC2626',
    iconBg: 'rgba(220,38,38,0.15)',
    dotColor: '#DC2626',
    btnColor: '#B91C1C',
    btnBorder: 'rgba(220,38,38,0.5)',
    btnHoverBg: 'rgba(220,38,38,0.10)',
    hlUnderline: '#DC2626',
  },
  CREDENTIAL: {
    label: 'Credencial',
    bg: '#F0F4F8',
    gradient: 'linear-gradient(135deg, rgba(240,244,248,0.95), rgba(228,236,248,0.95), rgba(240,244,248,0.95))',
    iconColor: '#4A90D9',
    iconBg: 'rgba(74,144,217,0.15)',
    dotColor: '#4A90D9',
    btnColor: '#3572B0',
    btnBorder: 'rgba(74,144,217,0.5)',
    btnHoverBg: 'rgba(74,144,217,0.10)',
    hlUnderline: '#4A90D9',
  },
  INFRASTRUCTURE: {
    label: 'Credencial',
    bg: '#F0F4F8',
    gradient: 'linear-gradient(135deg, rgba(240,244,248,0.95), rgba(228,236,248,0.95), rgba(240,244,248,0.95))',
    iconColor: '#4A90D9',
    iconBg: 'rgba(74,144,217,0.15)',
    dotColor: '#4A90D9',
    btnColor: '#3572B0',
    btnBorder: 'rgba(74,144,217,0.5)',
    btnHoverBg: 'rgba(74,144,217,0.10)',
    hlUnderline: '#4A90D9',
  },
}

const DEFAULT_THEME: CategoryTheme = THEMES.ID_DOCUMENT

// --- Prioridad de categorías (mayor severity primero) ---

const CATEGORY_PRIORITY: Category[] = [
  'SPECIAL_CATEGORY',
  'FINANCIAL',
  'CREDENTIAL',
  'INFRASTRUCTURE',
  'ID_DOCUMENT',
  'PII',
  'CONTACT',
]

// --- API pública ---

export function getThemeForCategory(category: Category): CategoryTheme {
  return THEMES[category] ?? DEFAULT_THEME
}

export function getPrimaryTheme(detections: Detection[]): CategoryTheme {
  for (const cat of CATEGORY_PRIORITY) {
    if (detections.some((d) => d.category === cat)) {
      return THEMES[cat] ?? DEFAULT_THEME
    }
  }
  return DEFAULT_THEME
}

export function getPrimaryCategoryLabel(detections: Detection[]): string {
  for (const cat of CATEGORY_PRIORITY) {
    if (detections.some((d) => d.category === cat)) {
      return (THEMES[cat] ?? DEFAULT_THEME).label
    }
  }
  return DEFAULT_THEME.label
}

// --- Nombres legibles por tipo de detección ---

export const DETECTION_LABELS: Record<string, string> = {
  DNI: 'DNI',
  NIE: 'NIE',
  CIF: 'CIF',
  IBAN: 'IBAN',
  CREDIT_CARD: 'Tarjeta de crédito',
  SSN_SPAIN: 'N\u00BA Seguridad Social',
  PHONE_SPAIN: 'Tel\u00E9fono',
  EMAIL: 'Email personal',
  PASSPORT_SPAIN: 'Pasaporte',
  PLATE_SPAIN: 'Matr\u00EDcula',
  NIF_PORTUGAL: 'NIF Portugal',
  CODICE_FISCALE: 'Codice Fiscale',
  BIRTHDATE: 'Fecha de nacimiento',
  HEALTH_DATA: 'Dato de salud',
  SALARY_DATA: 'Dato salarial',
  POLITICAL_RELIGIOUS: 'Dato protegido Art. 9',
  CRIMINAL_DATA: 'Dato penal',
  API_KEY: 'API key',
  CONNECTION_STRING: 'Connection string',
  JWT_TOKEN: 'Token JWT',
  ENV_SECRET: 'Secret en variable de entorno',
  PRIVATE_KEY: 'Clave privada',
}

// --- SVG del escudo con colores dinámicos ---

export function shieldSvg(fillColor: string, strokeColor: string, size: number = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1L2 3.5v4.25C2 11.85 4.7 15 8 16c3.3-1 6-4.15 6-8.25V3.5L8 1z" fill="${fillColor}" opacity="0.25" stroke="${strokeColor}" stroke-width="1" stroke-linejoin="round"/>
    <path d="M5.5 8.5L7 10l3.5-3.5" stroke="${strokeColor}" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
}

export function shieldSvgLarge(fillColor: string, strokeColor: string): string {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L4 5.5v5.5c0 5.25 3.4 10.15 8 11.5 4.6-1.35 8-6.25 8-11.5V5.5L12 2z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M8.5 12.5L10.5 14.5L15.5 9.5" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
}

// --- Agrupar detecciones por categoría ---

export function groupByCategory(detections: Detection[]): Map<Category, Detection[]> {
  const groups = new Map<Category, Detection[]>()
  // Mantener orden de prioridad
  for (const cat of CATEGORY_PRIORITY) {
    const dets = detections.filter((d) => d.category === cat)
    if (dets.length > 0) groups.set(cat, dets)
  }
  // Categorías no listadas en prioridad
  for (const d of detections) {
    if (!groups.has(d.category)) {
      groups.set(d.category, detections.filter((x) => x.category === d.category))
    }
  }
  return groups
}
