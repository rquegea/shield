export type ExpectedSeverity = 'block' | 'warn' | 'info' | 'none'

export interface TestCase {
  id: string
  name: string
  category: string
  text: string
  expectedMaxSeverity: ExpectedSeverity
  expectedType?: string
  description?: string
}

export const TEST_CASES: TestCase[] = [
  // ========================================================================
  // FALSOS POSITIVOS CONOCIDOS (deben dar none o info, NUNCA block/warn)
  // ========================================================================
  {
    id: 'fp-connection-string',
    name: 'Connection string PostgreSQL',
    category: 'Falsos positivos',
    text: 'postgres://user:pass@db.host.com:5432/mydb',
    expectedMaxSeverity: 'info',
    description: 'No debe generar detección de email. Se detecta como CONNECTION_STRING (info)',
  },
  {
    id: 'fp-calendly',
    name: 'URL de Calendly con nombre',
    category: 'Falsos positivos',
    text: 'Reserva en https://calendly.com/rodrigo-quesada-trucotrufa/30min',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'fp-env-variable',
    name: 'Variable de entorno con ID',
    category: 'Falsos positivos',
    text: 'UNIPILE_EMAIL_ACCOUNT_ID=abc123def456',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'fp-noreply',
    name: 'Email genérico noreply',
    category: 'Falsos positivos',
    text: 'Enviar notificaciones a noreply@empresa.com',
    expectedMaxSeverity: 'info',
  },
  {
    id: 'fp-info-email',
    name: 'Email genérico info@',
    category: 'Falsos positivos',
    text: 'Contactar en info@trucoytrufa.es',
    expectedMaxSeverity: 'info',
  },
  {
    id: 'fp-apollo-id',
    name: 'ID de MongoDB/Apollo',
    category: 'Falsos positivos',
    text: 'Apollo enrichment error for 59fe56a7a6da9861955e1ec1: 422 Client Error',
    expectedMaxSeverity: 'none',
    description: 'NO debe detectar como IBAN',
  },
  {
    id: 'fp-api-key',
    name: 'API key de OpenAI',
    category: 'Falsos positivos',
    text: 'OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl',
    expectedMaxSeverity: 'info',
    description: 'Se detecta como credencial (info), NUNCA block/warn',
  },
  {
    id: 'fp-github-url',
    name: 'URL de GitHub con usuario',
    category: 'Falsos positivos',
    text: 'Ver el repo en https://github.com/rodrigo-quesada/guripa-ai',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'fp-linkedin-url',
    name: 'URL de LinkedIn',
    category: 'Falsos positivos',
    text: 'Mi perfil: https://linkedin.com/in/rodrigo-quesada',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'fp-jwt',
    name: 'Token JWT',
    category: 'Falsos positivos',
    text: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    expectedMaxSeverity: 'info',
    description: 'Se detecta como JWT_TOKEN (info), NUNCA block/warn',
  },
  {
    id: 'fp-codigo-con-email',
    name: 'Email en código/placeholder',
    category: 'Falsos positivos',
    text: "const DEFAULT_EMAIL = 'user@example.com'",
    expectedMaxSeverity: 'none',
    description: 'example.com se descarta como dominio de ejemplo',
  },
  {
    id: 'fp-mongodb-uri',
    name: 'MongoDB connection string',
    category: 'Falsos positivos',
    text: 'MONGO_URI=mongodb+srv://admin:secretpass@cluster0.abc123.mongodb.net/production',
    expectedMaxSeverity: 'info',
    description: 'No es email. Se detecta como CONNECTION_STRING (info)',
  },
  {
    id: 'fp-propio-email',
    name: 'Email del propio usuario (con whitelist)',
    category: 'Falsos positivos',
    text: 'Envié el informe desde rodrigo.quesada@trucoytrufa.es ayer',
    expectedMaxSeverity: 'none',
    description: 'Requiere userEmail en config para pasar',
  },
  {
    id: 'fp-iban-falso',
    name: 'IBAN con dígitos de control inválidos',
    category: 'Falsos positivos',
    text: 'Referencia: ES0000000000000000000000',
    expectedMaxSeverity: 'none',
    description: 'No pasa MOD-97',
  },
  {
    id: 'fp-output-tecnico',
    name: 'Output técnico de Apollo completo',
    category: 'Falsos positivos',
    text: 'Apollo enrichment error for 59fe56a7a6da9861955e1ec1: 422 Client Error\nperson_locations: ["Spain", "Mexico", "Colombia", "Argentina"]\nEl email test se envió exitosamente a rodrigo.quesada@trucoytrufa.es\ny el pipeline Prospector Composer Sender está 100% funcional.\nQuieres que cambie config.py a LATAM o prefieres otro enfoque?',
    expectedMaxSeverity: 'warn',
    description: 'El email personal genera warn (sin whitelist). Con whitelist sería none.',
  },

  // ========================================================================
  // IDENTIFICADORES PERSONALES (deben dar block)
  // ========================================================================
  {
    id: 'id-dni',
    name: 'DNI español',
    category: 'Identificadores',
    text: 'El DNI del cliente es 03256344S',
    expectedMaxSeverity: 'block',
    expectedType: 'DNI',
  },
  {
    id: 'id-dni-contexto',
    name: 'DNI en contexto de nómina',
    category: 'Identificadores',
    text: 'necesito que me hagas una nómina para carlos martinez serrano con dni 03256344s',
    expectedMaxSeverity: 'block',
    expectedType: 'DNI',
  },
  {
    id: 'id-nie',
    name: 'NIE',
    category: 'Identificadores',
    text: 'Mi NIE es X1234567L',
    expectedMaxSeverity: 'block',
    expectedType: 'NIE',
  },
  {
    id: 'id-iban-real',
    name: 'IBAN válido',
    category: 'Identificadores',
    text: 'Transferir a ES9121000418450200051332',
    expectedMaxSeverity: 'block',
    expectedType: 'IBAN',
  },
  {
    id: 'id-iban-espacios',
    name: 'IBAN con espacios',
    category: 'Identificadores',
    text: 'IBAN: ES91 2100 0418 4502 0005 1332',
    expectedMaxSeverity: 'block',
    expectedType: 'IBAN',
  },
  {
    id: 'id-tarjeta',
    name: 'Tarjeta de crédito',
    category: 'Identificadores',
    text: 'Pagar con 4532 0150 1234 5678',
    expectedMaxSeverity: 'block',
    expectedType: 'CREDIT_CARD',
  },
  {
    id: 'id-pasaporte',
    name: 'Pasaporte español',
    category: 'Identificadores',
    text: 'Pasaporte PAA123456',
    expectedMaxSeverity: 'block',
    expectedType: 'PASSPORT_SPAIN',
  },
  {
    id: 'id-ssn',
    name: 'NSS español',
    category: 'Identificadores',
    text: 'Número Seguridad Social 28/12345678/09',
    expectedMaxSeverity: 'block',
    expectedType: 'SSN_SPAIN',
  },

  // ========================================================================
  // DATOS PERSONALES BÁSICOS (deben dar warn)
  // ========================================================================
  {
    id: 'dp-email-real',
    name: 'Email real de persona',
    category: 'Datos personales',
    text: 'Enviar a carlos.martinez@empresa.com el informe',
    expectedMaxSeverity: 'warn',
    expectedType: 'EMAIL',
  },
  {
    id: 'dp-telefono',
    name: 'Teléfono español',
    category: 'Datos personales',
    text: 'Llamar a Pedro al 612345678',
    expectedMaxSeverity: 'warn',
    expectedType: 'PHONE_SPAIN',
  },
  {
    id: 'dp-telefono-formato',
    name: 'Teléfono con formato',
    category: 'Datos personales',
    text: 'Tel: +34 612 345 678',
    expectedMaxSeverity: 'warn',
    expectedType: 'PHONE_SPAIN',
  },
  {
    id: 'dp-fecha-nac',
    name: 'Fecha de nacimiento',
    category: 'Datos personales',
    text: 'Nacido el 15/03/1987',
    expectedMaxSeverity: 'warn',
    expectedType: 'BIRTHDATE',
  },
  {
    id: 'dp-cif',
    name: 'CIF de empresa',
    category: 'Identificadores',
    text: 'CIF: B12345678',
    expectedMaxSeverity: 'block',
    expectedType: 'CIF',
  },
  {
    id: 'dp-matricula',
    name: 'Matrícula española',
    category: 'Datos personales',
    text: 'El coche con matrícula 1234 BCD',
    expectedMaxSeverity: 'warn',
    expectedType: 'PLATE_SPAIN',
  },

  // ========================================================================
  // ART. 9 RGPD — DATOS ESPECIALMENTE PROTEGIDOS
  // (Estos detectores pueden no existir aún — se marcan como block esperado)
  // ========================================================================
  {
    id: 'art9-salud-nombre',
    name: 'Diagnóstico + nombre',
    category: 'Art. 9 RGPD',
    text: 'El diagnóstico de Carlos Martinez es diabetes tipo 2',
    expectedMaxSeverity: 'block',
    expectedType: 'HEALTH_DATA',
  },
  {
    id: 'art9-salud-sin-nombre',
    name: 'Diagnóstico sin nombre',
    category: 'Art. 9 RGPD',
    text: 'La diabetes tipo 2 se diagnostica mediante análisis de sangre',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'art9-baja-medica',
    name: 'Baja médica + nombre',
    category: 'Art. 9 RGPD',
    text: 'María García tiene baja médica desde enero por depresión',
    expectedMaxSeverity: 'block',
    expectedType: 'HEALTH_DATA',
  },
  {
    id: 'art9-nomina-nombre',
    name: 'Nómina + nombre + importe',
    category: 'Art. 9 RGPD',
    text: 'La nómina de Pedro López refleja un salario bruto de 45.000 euros',
    expectedMaxSeverity: 'block',
    expectedType: 'SALARY_DATA',
    description: 'Nombre + keyword salarial en proximidad',
  },
  {
    id: 'art9-salario-generico',
    name: 'Salario sin persona',
    category: 'Art. 9 RGPD',
    text: 'El salario medio en España es de 28.000 euros anuales',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'art9-irpf-nombre',
    name: 'IRPF + nombre',
    category: 'Art. 9 RGPD',
    text: 'Adjunto la nómina de Ana Ruiz con IRPF del 24% y retención de 890 euros',
    expectedMaxSeverity: 'block',
    expectedType: 'SALARY_DATA',
    description: 'Nombre + keyword salarial en proximidad',
  },
  {
    id: 'art9-sindicato-nombre',
    name: 'Afiliación sindical + nombre',
    category: 'Art. 9 RGPD',
    text: 'Juan García es delegado sindical de UGT en la planta de Getafe',
    expectedMaxSeverity: 'block',
    expectedType: 'POLITICAL_RELIGIOUS',
    description: 'Nombre + keyword político/religioso en proximidad',
  },
  {
    id: 'art9-sindicato-generico',
    name: 'Sindicato sin persona',
    category: 'Art. 9 RGPD',
    text: 'UGT convoca huelga general para el viernes',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'art9-partido-nombre',
    name: 'Partido político + nombre',
    category: 'Art. 9 RGPD',
    text: 'Pablo Fernández es militante del PSOE desde 2015',
    expectedMaxSeverity: 'block',
    expectedType: 'POLITICAL_RELIGIOUS',
    description: 'Nombre + keyword político/religioso en proximidad',
  },
  {
    id: 'art9-partido-generico',
    name: 'Partido sin persona',
    category: 'Art. 9 RGPD',
    text: 'El PSOE ganó las elecciones municipales en 2023',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'art9-religion-nombre',
    name: 'Religión + nombre',
    category: 'Art. 9 RGPD',
    text: 'Laura Sánchez es católica practicante y miembro del Opus Dei',
    expectedMaxSeverity: 'block',
    expectedType: 'POLITICAL_RELIGIOUS',
    description: 'Nombre + keyword político/religioso en proximidad',
  },
  {
    id: 'art9-religion-generico',
    name: 'Religión sin persona',
    category: 'Art. 9 RGPD',
    text: 'La iglesia católica celebra Semana Santa esta semana',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'art9-orientacion-nombre',
    name: 'Orientación sexual + nombre',
    category: 'Art. 9 RGPD',
    text: 'El expediente indica que Miguel Torres es homosexual',
    expectedMaxSeverity: 'block',
    expectedType: 'POLITICAL_RELIGIOUS',
    description: 'Nombre + keyword político/religioso en proximidad',
  },
  {
    id: 'art9-antecedentes-nombre',
    name: 'Antecedentes penales + nombre',
    category: 'Art. 9 RGPD',
    text: 'Roberto Díaz tiene antecedentes penales por estafa',
    expectedMaxSeverity: 'block',
    expectedType: 'CRIMINAL_DATA',
    description: 'Nombre + keyword penal en proximidad',
  },

  // ========================================================================
  // CREDENCIALES TÉCNICAS (deben dar info)
  // ========================================================================
  {
    id: 'cred-api-key',
    name: 'API key genérica',
    category: 'Credenciales',
    text: 'sk-proj-abc123def456ghi789',
    expectedMaxSeverity: 'info',
    expectedType: 'API_KEY',
  },
  {
    id: 'cred-aws',
    name: 'AWS access key',
    category: 'Credenciales',
    text: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
    expectedMaxSeverity: 'info',
    expectedType: 'ENV_SECRET',
  },
  {
    id: 'cred-connection',
    name: 'Connection string MySQL',
    category: 'Credenciales',
    text: 'mysql://root:password@localhost:3306/app_db',
    expectedMaxSeverity: 'info',
    expectedType: 'CONNECTION_STRING',
  },
  {
    id: 'cred-private-key',
    name: 'Clave privada',
    category: 'Credenciales',
    text: '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...',
    expectedMaxSeverity: 'info',
    expectedType: 'PRIVATE_KEY',
  },
  {
    id: 'cred-slack-token',
    name: 'Token de Slack',
    category: 'Credenciales',
    text: 'SLACK_BOT_TOKEN=xoxb-fake-test-token-placeholder',
    expectedMaxSeverity: 'info',
    expectedType: 'ENV_SECRET',
  },

  // ========================================================================
  // TEXTOS LARGOS REALISTAS
  // ========================================================================
  {
    id: 'real-email-trabajo',
    name: 'Email de trabajo normal',
    category: 'Textos realistas',
    text: 'Hola equipo, os recuerdo que la reunión de mañana es a las 10:00 en la sala B. Traed los informes del Q1. Saludos, Rodrigo',
    expectedMaxSeverity: 'none',
  },
  {
    id: 'real-codigo',
    name: 'Bloque de código Python',
    category: 'Textos realistas',
    text: "import requests\nresponse = requests.get('https://api.example.com/data', headers={'Authorization': 'Bearer sk-test-123456'})\nprint(response.json())",
    expectedMaxSeverity: 'info',
    description: 'API key detectada como info, NUNCA block/warn',
  },
  {
    id: 'real-rrhh-peligroso',
    name: 'Email de RRHH con datos sensibles',
    category: 'Textos realistas',
    text: 'Hola María, te confirmo que la nómina de septiembre de Juan Carlos Pérez García (DNI 12345678Z) refleja el incremento salarial a 52.000 euros brutos anuales. Está de baja médica por ansiedad desde el 15 de septiembre. Su IBAN para la transferencia es ES9121000418450200051332. Saludos, RRHH',
    expectedMaxSeverity: 'block',
    description: 'Múltiples detecciones: DNI, IBAN',
  },
  {
    id: 'real-mixto',
    name: 'Texto mixto técnico y personal',
    category: 'Textos realistas',
    text: 'Deploy del servicio completado. La config es DATABASE_URL=postgres://admin:pass@db.prod.com:5432/main. Avisar a carlos.lopez@finanzauto.es de que su acceso está listo. Su DNI para el alta es 45678901X.',
    expectedMaxSeverity: 'block',
    description: 'block (DNI), warn (email real), connection string no debe dar email',
  },
]

export const CATEGORIES = [...new Set(TEST_CASES.map((tc) => tc.category))]
