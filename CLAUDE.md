# ShieldAI — DLP para GenAI

Extensión de Chrome + dashboard SaaS que detecta y bloquea el envío de datos sensibles a herramientas de IA (ChatGPT, Gemini, Claude) por parte de empleados de empresas. Enfocado en PYMEs europeas con datos españoles (DNI, NIE, CIF, IBAN).

## Filosofía del producto

- El producto funciona en PILOTO AUTOMÁTICO. El IT manager no gestiona nada día a día.
- La extensión es INVISIBLE hasta que detecta datos sensibles.
- Modal de warning: el empleado acepta el riesgo (queda registrado con su nombre y fecha) o cancela.
- El IT manager recibe email semanal automático y PDF mensual de compliance.
- El dashboard existe para profundizar, NO es el centro del producto.
- Lo que vende el producto: EVIDENCIA DOCUMENTADA de medidas técnicas para GDPR/AI Act.

## Stack

- **Monorepo** con npm workspaces
- **Web app**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **Backend/DB**: Supabase (Postgres, Auth, RLS, Realtime)
- **Extensión**: Chrome ExtensV3, TypeScript, webpack
- **Detección**: librería TypeScript pura con regex (sin dependencias externas)
- **Emails**: Resend

## Directorios

```
/packages/detectors/     — Librería de detección de datos sensibles (TypeScript puro, sin deps)
/packages/detectors/src/patterns/  — Un archivo por patrón: dni.ts, iban.ts, credit-card.ts, etc.
/packages/detectors/tests/         — Tests con vitest
/apps/web/               — Next.js dashboard + API
/apps/web/app/(auth)/    — Login y registro
/apps/web/app/dashboard/ — Páginas del dashboard
/apps/web/app/api/       — API routes (events, users, policies, config, selectors)
/apps/web/lib/supabase/  — Clientes de Supabase (browser, server, middleware)
/apps/extension/         — Chrome Extension
/apps/extension/src/background/   — Service worker
/apps/extension/src/content/      — Content script + interceptores por plataforma
/apps/extension/src/content/ui/   — Modal de warning (Shadow DOM)
/apps/extension/src/popup/        — Popup de configuración
/supabase/migrations/    — SQL migrations
```

## Comandos

- `npm run dev` — Arranca Next.js en dev (desde /apps/web)
- `npm run build` — Build de producción (desde /apps/web)
- `npm test` — Ejecuta vitest (desde /packages/detectors)
- `npm run build:ext` — Build de la extensión (desde /apps/extension)
- `npm run lint` — ESLint

## Convenciones de código

- TypeScript strict mode, nunca `any` — usar `unknown` y narrowing
- Named exports, no default exports (excepto páginas de Next.js que requieren default)
- Componentes React: PascalCase, un componente por archivo
- Usar shadcn/ui para todos los componentes de UI del dashboard
- Tailwind para estilos, nunca CSS custom files
- Server components por defecto en Next.js, client components solo cuando sea necesario (interactividad, hooks)
- Funciones async para API routes, nunca callbacks
- Supabase queries con el client de server en server components, client en client components
- Todos los textos de UI en español

## Base de datos

- Supabase con RLS habilitados
- Cada organización solo ve sus propios datos
- La tabla `platform_selectors` es de lectura pública (la extensión necesita leerlos)
- Extension tokens: UUID único por usuario, se envía en header `Authorization: Bearer {token}`
- Auth de dashboard: Supabase Auth con email/password

### Tablas principales

- `organizations` — Empresas cliente
- `users` — Empleados de cada empresa (con extension_token único)
- `events` — Cada detección de datos sensibles (quién, qué, cuándo, acción tomada)
- `policies` — Reglas por organización/departamento (modo warn/block/monitor, detectores habilitados)
- `platform_selectors` — Selectores CSS de cada plataforma de IA (actualizables sin redeploy)

## Extensión de Chrome

- Manifest V3 — NO Manifest V2
- Content script se inyecta en: chatgpt.com, chat.openai.com, gemini.google.com, claude.ai
- ChatGPT usa `contenteditable div`, no textarea — leer con `element.innerText`
- Interceptar submit con capturing event listeners (`useCapture: true`) para capturar antes de la plataforma
- Modal de warning usa Shadow DOM para aislar estilos
- Los selectores de plataforma CAMBIAN frecuentemente — se almacenan en `platform_selectors` y la extensión los sincroniza cada 6 horas desde el backend
- Comunicación content script → background → backend via `chrome.runtime.sendMessage`
- Configuración (token, URL backend) en `chrome.storage.local`

## Detección de datos sensibles

- La detección corre 100% en el navegador del usuario (la extensión), NO en el backend
- El backend solo recibe metadatos del evento (nunca el texto completo)
- Datos que se almacenan: tipo detectado, valor ENMASCARADO (****5678Z), acción tomada
- Datos que NUNCA se almacenan: texto completo del usuario, datos sensibles en claro

### Patrones implementados (datos españoles/europeos)

- DNI: 8 dígitos + letra, validar con módulo 23
- NIE: X/Y/Z + 7 dígitos + letra, validar con módulo 23
- CIF: letra + 7 dígitos + control
- IBAN: ES + 2 control + 20 dígitos, validar mod 97
- Tarjeta de crédito: 13-19 dígitos, algoritmo de Luhn
- NSS España: 12 dígitos
- Teléfono español: +34 6/7/9XX XXX XXX
- Email: regex estándar

### Niveles de riesgo

- `critical`: >5 datos sensibles O tarjetas de crédito
- `high`: 2-5 datos O IBAN/DNI
- `medium`: 1 dato sensible
- `low`: detección con baja confianza
- `none`: sin detecciones

## API

- `POST /api/events` — Extensión envía evento (auth con extension_token)
- `GET /api/events` — Dashboard lista eventos (auth con Supabase session)
- `GET /api/events/stats` — KPIs agregados para dashboard
- `GET /api/config` — Extensión pide configuración (auth con extension_token)
- `GET /api/selectors` — Extensión pide selectores actualizados (público)
- CRUD `/api/users` y `/api/policies` — Gestión desde dashboard (auth con Supabase session)

## Evitar

- NUNCA almacenar texto completo del usuario ni datos sensibles en claro
- NUNCA usar Manifest V2 para la extensión
- NUNCA depender de selectores CSS hardcodeados — siempre leer de `platform_selectors`
- No usar localStorage en la extensión — usar `chrome.storage.local`
- No enviar datos sensibles al backend para análisis (la detección es en el browser)
- No hacer el dashboard complejo — el IT manager no es un CISO, quiere simplicidad

## Plan de ejecución

Referencia completa en: @./docs/plan-ejecucion-claude-code.md

Orden de construcción:
1. Librería de detección (`/packages/detectors/`) con tests
2. Schema Supabase + auth helpers
3. Extensión Chrome (solo ChatGPT primero)
4. API backend
5. Dashboard web (mínimo funcional)
6. Email semanal automático
7. Testing end-to-end manual
