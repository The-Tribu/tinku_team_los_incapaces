# Especificaciones Técnicas · SunHub

> Plataforma unificada de operación solar para Techos Rentables — Hackathon Tinku 2026 · Equipo Los Incapaces
> **Versión:** 1.0 · **Fecha:** 2026-04-17

---

## 1. Visión del producto

**SunHub** es un sistema operativo unificado que consolida las plataformas de monitoreo de 5+ fabricantes de inversores en una sola superficie, con IA embebida para detección temprana, predicción de fallas, generación automática de reportes y recomendación de proveedor óptimo.

### Objetivos medibles (meta hackathon)

| Métrica | Estado actual Techos Rentables | Meta SunHub |
|---|---|---|
| Tiempo por reporte mensual | 40 min manual | <30 seg automatizado |
| Horas/mes de trabajo manual | 130+ h | <5 h |
| Detección de falla | manual, reactiva, días | <5 min, automática |
| Fuentes de verdad | 6 plataformas | 1 |
| Anticipación a fallas | 0 | 2–7 días (predictiva) |
| Exposición a penalizaciones visible | no | sí, con monto estimado |

---

## 2. Stack tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | SSR, rutas API integradas, familiar al equipo |
| Estilos | **Tailwind CSS + shadcn/ui** | Acelera UI; encaja con diseño SunHub |
| Gráficos | **Recharts** (o Tremor) | Dashboards financieros ya probados |
| Mapas | **react-leaflet + OpenStreetMap** | Gratis, sin API key |
| Backend | **Next.js API Routes + Node 20** | Sin servicio extra, despliegue simple |
| ORM | **Prisma** | Tipos TypeScript auto-generados |
| DB | **Postgres 15** (local: Docker) | Series de tiempo suficientes para 18h |
| Cache/jobs | **Redis + BullMQ** (opcional) — o `setInterval` para MVP | MVP puede vivir sin Redis |
| LLM | **MiniMax MiniMax-Text-01** (patrocinador) vía REST | Copilot y generación de reportes |
| Clima | **Open-Meteo API** (gratis, sin key) | Pronóstico + radiación |
| Middleware solar | **techos.thetribu.dev** | Provisto por el evento |
| Deploy | **Vercel** (frontend) + **Neon/Railway** (Postgres) | Cero-config |

---

## 3. Arquitectura

```
┌────────────────────────────────────────────────────────────┐
│                         FRONTEND                           │
│   Next.js App Router · SunHub UI · Recharts · Leaflet      │
│   /dashboard  /plantas  /alarmas  /predicciones            │
│   /clima  /costo-beneficio  /onboarding  /copilot          │
│   /app/client (mobile client portal)                       │
└──────────────┬──────────────────────────────┬──────────────┘
               │                              │
               ▼                              ▼
     ┌─────────────────┐            ┌──────────────────┐
     │  Next API Routes│            │   AI Core        │
     │  /api/plants    │            │ - MiniMax chat   │
     │  /api/devices   │            │ - Anomaly detect │
     │  /api/kpis      │            │ - Predictive     │
     │  /api/alarms    │            │ - Report gen     │
     └────────┬────────┘            └────────┬─────────┘
              │                              │
              ▼                              │
     ┌─────────────────┐                     │
     │   PostgreSQL    │◄────────────────────┘
     │  (Prisma ORM)   │
     │  Series, meta   │
     └────────┬────────┘
              │
              ▼
     ┌──────────────────────────────────────┐
     │         INGESTION WORKER             │
     │ - Poll middleware cada 1–5 min       │
     │ - Normaliza KPIs (multi-marca)       │
     │ - Inserta a readings table           │
     │ - Dispara reglas/alarmas             │
     └────────┬─────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────┐
   │  techos.thetribu.dev (middleware evento) │
   │   /deye/*  /huawei/*  /growatt/*         │
   └──────────────────────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────────┐
   │   APIs reales (proveedores)              │
   │   DeyeCloud · Huawei · Growatt           │
   └──────────────────────────────────────────┘

   ┌──────────────────────────────────────────┐
   │ Open-Meteo API (clima + radiación)       │
   └──────────────────────────────────────────┘
```

---

## 4. Modelo de datos canónico

```sql
-- ── Organización comercial ───────────────────────────────────
clients (
  id            uuid pk,
  name          text,             -- "Bavaria S.A."
  contact_email text,
  region        text,             -- "Cundinamarca"
  created_at    timestamptz
)

plants (
  id            uuid pk,
  client_id     uuid fk,
  code          text unique,      -- "TR-0201"
  name          text,             -- "Planta Tibitó"
  location      text,
  lat           numeric,
  lng           numeric,
  capacity_kwp  numeric,
  contract_type text,             -- "PPA" | "Leasing" | "Compra"
  contract_end  date,
  created_at    timestamptz
)

-- ── Proveedores e integración ────────────────────────────────
providers (
  id            uuid pk,
  slug          text unique,      -- "growatt" | "huawei" | "deye"
  display_name  text,
  auth_type     text,             -- gestionado por middleware
  polling_min   int,              -- 1 | 5 | 15
  enabled       bool
)

devices (
  id                uuid pk,
  plant_id          uuid fk,
  provider_id       uuid fk,
  external_id       text,         -- "GRT-4821", "HYML-MIC-011"
  kind              text,         -- "inverter" | "microinverter"
  model             text,
  installed_at      date,
  current_status    text,         -- "online"|"warning"|"offline"|"degraded"
  last_seen_at      timestamptz
)

-- ── Series de tiempo ─────────────────────────────────────────
readings (  -- particionable por mes
  id            bigserial pk,
  device_id     uuid fk,
  ts            timestamptz,
  power_ac_kw   numeric,
  voltage_v     numeric,
  current_a     numeric,
  frequency_hz  numeric,
  power_factor  numeric,
  temperature_c numeric,
  energy_kwh    numeric,          -- acumulado del día
  raw           jsonb              -- payload original por auditoría
)
CREATE INDEX ON readings (device_id, ts DESC);

-- ── Contratos y compromisos ──────────────────────────────────
contracts (
  id              uuid pk,
  plant_id        uuid fk,
  period_month    date,           -- "2026-04-01"
  target_energy_kwh  numeric,
  target_savings_cop numeric,
  target_uptime_pct  numeric,     -- 98.0
  target_pr_pct      numeric,     -- 78.0
  target_co2_ton     numeric,
  penalty_per_breach numeric      -- $COP por breach
)

-- ── Alarmas (reactivas) y predicciones ───────────────────────
alarms (
  id          uuid pk,
  device_id   uuid fk,
  severity    text,               -- "critical" | "warning" | "info"
  type        text,               -- "offline"|"frequency"|"voltage"|"low_gen"
  message     text,
  started_at  timestamptz,
  resolved_at timestamptz null,
  assignee    text,
  ai_suggestion text
)

predictions (
  id              uuid pk,
  device_id       uuid fk,
  predicted_type  text,           -- "failure"|"degradation"|"low_gen"
  probability     numeric,        -- 0..1
  days_to_event   numeric,
  confidence      numeric,
  root_cause      text,
  suggested_action text,
  model_version   text,
  generated_at    timestamptz
)

-- ── Reportes ─────────────────────────────────────────────────
reports (
  id          uuid pk,
  client_id   uuid fk,
  plant_id    uuid fk null,
  period      date,
  status      text,               -- "draft"|"generating"|"sent"
  pdf_url     text,
  compliance_pct numeric,
  generated_at timestamptz
)
```

---

## 5. Integración con el middleware

### 5.1 Cliente HTTP base (`lib/middleware.ts`)

```ts
const BASE = process.env.MIDDLEWARE_BASE_URL!;
const KEY  = process.env.MIDDLEWARE_API_KEY!;

export async function mw(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: KEY,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`MW ${res.status}: ${await res.text()}`);
  return res.json();
}
```

### 5.2 Endpoints a consumir (por proveedor)

| Proveedor | Slug | Método | Endpoint típico | Uso SunHub |
|---|---|---|---|---|
| Growatt | `growatt` | GET | `/growatt/v1/plant/list` | listar plantas |
| Growatt | `growatt` | GET | `/growatt/v1/plant/data?plantId=...` | generación |
| Growatt | `growatt` | GET | `/growatt/v1/device/list?plantId=...` | dispositivos |
| Huawei | `huawei` | POST | `/huawei/thirdData/getStationList` | listar plantas |
| Huawei | `huawei` | POST | `/huawei/thirdData/getStationRealKpi` | KPIs tiempo real |
| Huawei | `huawei` | POST | `/huawei/thirdData/getDevList` | dispositivos |
| DeyeCloud | `deye` | POST | `/deye/v1.0/device/list` | dispositivos |
| DeyeCloud | `deye` | POST | `/deye/v1.0/station/list` | plantas |

> Los endpoints exactos deben validarse contra la doc de cada proveedor (ver `docs/resources/technical_guide.md`).

### 5.3 Normalizador (`lib/normalize.ts`)

Traduce respuesta del proveedor → modelo canónico:

```ts
type Canonical = {
  device_id: string;
  power_ac_kw: number;
  voltage_v?: number;
  current_a?: number;
  frequency_hz?: number;
  temperature_c?: number;
  energy_kwh?: number;
  status: "online" | "warning" | "offline";
  ts: string; // ISO
};

export const normalize = {
  growatt: (r: any): Canonical => ({
    device_id: r.deviceSn,
    power_ac_kw: Number(r.pac) / 1000,
    voltage_v: Number(r.vac1),
    frequency_hz: Number(r.fac),
    temperature_c: Number(r.temperature),
    energy_kwh: Number(r.eToday),
    status: r.status === 1 ? "online" : "offline",
    ts: r.lastUpdateTime,
  }),
  huawei: (r: any): Canonical => ({
    device_id: r.devDn,
    power_ac_kw: Number(r.active_power),
    voltage_v: Number(r.a_u),
    frequency_hz: Number(r.ac_freq),
    temperature_c: Number(r.temperature),
    energy_kwh: Number(r.day_cap),
    status: r.run_state === 1 ? "online" : "offline",
    ts: new Date(r.collect_time).toISOString(),
  }),
  deye: (r: any): Canonical => ({
    device_id: r.deviceSn,
    power_ac_kw: Number(r.totalPower) / 1000,
    voltage_v: Number(r.gridVoltage),
    frequency_hz: Number(r.gridFrequency),
    temperature_c: Number(r.tempInverter),
    energy_kwh: Number(r.todayEnergy),
    status: r.status?.toLowerCase() ?? "offline",
    ts: r.dataTime,
  }),
};
```

### 5.4 Worker de ingestion (`workers/ingest.ts`)

```ts
const POLL_INTERVAL_MS = 60_000; // 1 min MVP; 5 min producción

async function tick() {
  const devices = await prisma.device.findMany({ include: { provider: true, plant: true } });
  for (const d of devices) {
    try {
      const raw = await mw(endpointFor(d));
      const canon = normalize[d.provider.slug](raw);
      await prisma.reading.create({ data: { device_id: d.id, ...canon, raw } });
      await evaluateRules(d, canon); // dispara alarms si aplica
    } catch (e) { logger.warn({ d: d.id, e }); }
  }
}
setInterval(tick, POLL_INTERVAL_MS);
```

---

## 6. Módulos (uno por mockup)

### 6.1 Dashboard Global `/dashboard`
- **Fuente:** agregados sobre `readings` últimas 24h + estado actual `devices`.
- **APIs:** `GET /api/fleet/summary`, `GET /api/fleet/generation-24h`, `GET /api/alarms?status=open&limit=5`.
- **Renderiza:** 6 KPI cards, line chart multi-marca, mapa Leaflet, top 5 plantas, feed alarmas.

### 6.2 Lista de Plantas `/plantas`
- **APIs:** `GET /api/plants?brand=&status=&region=&risk=` con paginación.
- **Server-side filtering** para escalar a 200+.
- **Export CSV:** `GET /api/plants/export`.

### 6.3 Detalle de Planta `/plantas/[id]`
- **APIs:** `GET /api/plants/:id`, `GET /api/plants/:id/devices`, `GET /api/plants/:id/generation?from=&to=`, `GET /api/plants/:id/compliance?period=`.

### 6.4 Centro de Alarmas `/alarmas`
- **APIs:** `GET /api/alarms`, `POST /api/alarms/:id/assign`, `POST /api/alarms/:id/resolve`.
- **Engine de reglas** (simple para MVP):
  ```ts
  // ejemplo rule-engine
  if (reading.status === "offline" && device.last_seen_at < now - 5 min)
    createAlarm({ type: "offline", severity: "critical" });
  if (Math.abs(reading.frequency_hz - 60) / 60 > 0.1)
    createAlarm({ type: "frequency", severity: "critical" });
  if (reading.power_ac_kw < baseline(device) * 0.8)
    createAlarm({ type: "low_gen", severity: "warning" });
  ```

### 6.5 Alertas Predictivas `/predicciones`
- **Modelo simple para MVP:** regresión sobre ventanas móviles de 30 días por device.
  - Features: `avg(power_ac_kw)`, `variance(voltage_v)`, `count(offline_events_7d)`, `temp_delta_vs_baseline`, `age_days`.
  - Output: probabilidad de falla en ventana 7 días + causa raíz dominante.
- **Alternativa rápida:** heurística con IA (MiniMax recibe histórico 30d → responde "riesgo" en JSON estructurado).
- **APIs:** `GET /api/predictions`, `POST /api/predictions/:id/create-work-order`.

### 6.6 Inteligencia Climática `/clima`
- **Open-Meteo:** `GET https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y&hourly=shortwave_radiation,cloud_cover,precipitation,temperature_2m&timezone=America/Bogota`
- Para cada planta → radiación solar esperada → impacto en generación estimada.
- Regla: si `avg(radiation_next_6h) < baseline * 0.6` → alerta climática operativa.

### 6.7 Costo-Beneficio por Proveedor `/costo-beneficio`
- **Calcula:** CAPEX, OPEX mensual, PR promedio, uptime, MTTR, tasa de falla anualizada, costo de penalizaciones — agrupado por `provider_id`.
- **Score SunHub:** ponderación 0–100:
  ```
  score = 0.25*PR + 0.20*uptime + 0.15*(1-fail_rate) + 0.15*roi_per_cop
        + 0.10*(1-mttr_norm) + 0.15*(1-penalty_ratio)
  ```
- **Simulador:** inputs (kWp, región, años) → recomendación con ROI/TCO.

### 6.8 Onboarding Wizard `/onboarding`
- **Dos flujos:** nuevo proveedor · nuevo cliente.
- **Mapeo IA de KPIs:** usuario pega un JSON de muestra del proveedor → MiniMax responde con mapping a modelo canónico (ver §7.2).

### 6.9 Copilot AI `/copilot`
- Ver §7.1 — chat conversacional + generación de reportes.

### 6.10 Client App (mobile) `/app/client`
- Ruta pública con token firmado por cliente.
- APIs de solo-lectura filtradas por `client_id`.
- PWA con manifest para instalación.

---

## 7. AI Core con MiniMax

### 7.1 Cliente MiniMax (`lib/minimax.ts`)

```ts
const KEY = process.env.MINIMAX_API_KEY!;
const BASE = process.env.MINIMAX_BASE_URL!;
const MODEL = process.env.MINIMAX_MODEL!;

export async function chat(messages: {role:string;content:string}[], opts:{json?:boolean}={}) {
  const res = await fetch(`${BASE}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: opts.json ? { type: "json_object" } : undefined,
      temperature: 0.2,
    }),
  });
  const data = await res.json();
  return data.choices[0].message.content as string;
}
```

### 7.2 Prompts clave (system prompts)

**Copilot conversacional:**
```
Eres SunHub Copilot, asistente operativo de Techos Rentables.
Tienes acceso a 218 plantas solares, 1,247 dispositivos (Growatt, Huawei, DeyeCloud, Hoymiles, SRNE).
Cuando el usuario pregunte, puedes invocar las herramientas:
  - query_plants(filters) → retorna plantas
  - query_devices(filters) → retorna dispositivos
  - query_compliance(period) → cumplimiento contractual
  - generate_report(client_id, period) → PDF
Siempre responde en español (Colombia), con cifras exactas en COP y kWh.
Nunca inventes datos — si no los tienes, di "no tengo esa información".
```

**Generador de reporte mensual:**
```
Eres un redactor técnico. Dado el JSON de métricas mensuales de una planta,
produce un reporte ejecutivo en markdown con secciones:
1. Resumen de cumplimiento (verde/amarillo/rojo por metric)
2. Generación y ahorros
3. Performance ratio y uptime
4. CO₂ mitigado
5. Incidentes relevantes
6. Recomendaciones
Tono profesional, máximo 600 palabras.
```

**Mapeador de KPIs (onboarding):**
```
Eres un experto en integración de APIs solares. Dado un JSON de muestra
de un proveedor nuevo, mapea sus campos al modelo canónico SunHub:
{power_ac_kw, voltage_v, current_a, frequency_hz, temperature_c, energy_kwh, status, ts, device_id}.
Responde JSON con forma:
{ "mapping": { "power_ac_kw": "ac_power_output_watts/1000", ... },
  "missing": ["current_a"],
  "confidence": 0.98 }
```

### 7.3 Detección de anomalías (MVP)

- Baseline por dispositivo: media móvil 7 días de `power_ac_kw` a misma hora.
- Si lectura actual < 80% baseline por 3 lecturas consecutivas → alarma `low_gen`.
- Para predicción 7 días: pasar ventana 30d a MiniMax con prompt JSON-output.

---

## 8. Seguridad

- **Secretos** solo en `.env.local` (gitignored) + variables de entorno en Vercel.
- **API key del middleware** nunca en el cliente (todo pasa por Next API Routes).
- **MiniMax API key** idem — solo server-side.
- **Client App** usa JWT firmado con `CLIENT_JWT_SECRET`, scoped a `client_id`.
- **Rate limiting** básico en API Routes (`@upstash/ratelimit` si hay tiempo).
- **Rotación:** si este repo se hace público, rotar ambas keys con organizadores y MiniMax.

---

## 9. Estructura propuesta del repositorio

```
tinku_team_los_incapaces/
├─ .env.local                   # gitignored, con las keys
├─ .env.example
├─ .gitignore
├─ docs/                        # ya existe
│  ├─ problem/
│  ├─ resources/
│  └─ ESPECIFICACIONES_TECNICAS.md  # este archivo
├─ README.md
├─ package.json
├─ next.config.ts
├─ prisma/
│  └─ schema.prisma
├─ src/
│  ├─ app/
│  │  ├─ dashboard/page.tsx
│  │  ├─ plantas/page.tsx
│  │  ├─ plantas/[id]/page.tsx
│  │  ├─ alarmas/page.tsx
│  │  ├─ predicciones/page.tsx
│  │  ├─ clima/page.tsx
│  │  ├─ costo-beneficio/page.tsx
│  │  ├─ onboarding/page.tsx
│  │  ├─ copilot/page.tsx
│  │  ├─ app/client/page.tsx
│  │  └─ api/
│  │     ├─ plants/route.ts
│  │     ├─ devices/route.ts
│  │     ├─ alarms/route.ts
│  │     ├─ predictions/route.ts
│  │     ├─ weather/route.ts
│  │     ├─ reports/route.ts
│  │     └─ copilot/route.ts
│  ├─ components/
│  │  ├─ ui/              # shadcn
│  │  ├─ charts/
│  │  ├─ layout/
│  │  └─ sunhub/          # componentes propios
│  ├─ lib/
│  │  ├─ middleware.ts    # cliente del MW
│  │  ├─ normalize.ts     # adapters por marca
│  │  ├─ minimax.ts       # cliente LLM
│  │  ├─ weather.ts       # Open-Meteo
│  │  ├─ rules.ts         # motor de alarmas
│  │  └─ prisma.ts
│  └─ workers/
│     └─ ingest.ts        # poller cada 1–5 min
└─ tsconfig.json
```

---

## 10. Plan de ataque 18 horas

| Bloque | Tiempo | Entregable |
|---|---|---|
| **H0–H2 · Bootstrap** | 2h | Next.js + Tailwind + shadcn + Prisma + Postgres en Docker · Hola Mundo en `/dashboard` · ping al middleware con la key funcionando |
| **H2–H5 · Ingesta** | 3h | Worker que trae datos reales de Growatt **o** Huawei (1 marca, no las 3), normaliza y guarda en `readings` · modelo canónico funcionando |
| **H5–H8 · Dashboard + Plants list + Detail** | 3h | 3 pantallas con datos reales (no mock) · KPIs calculados · tabla con filtros |
| **H8–H11 · Alarmas + reglas + Copilot básico** | 3h | Engine de reglas que crea alarmas · endpoint `/api/copilot` con MiniMax respondiendo una pregunta canned |
| **H11–H13 · Reportes automáticos** | 2h | Generación de reporte markdown → PDF (usa `@react-pdf/renderer` o imprime como PDF) |
| **H13–H15 · Módulo diferenciador** | 2h | Elegir 1: Predicciones IA **o** Costo-Beneficio **o** Clima — el que más impacte en demo |
| **H15–H17 · Deploy + polish** | 2h | Vercel deploy · cargar datos seed · reparar detalles visuales · ensayar demo |
| **H17–H18 · Pitch** | 1h | Ensayar 3 veces con cronómetro (meta 4:45) · ajustar script |

### Regla de oro
> Vertical sobre horizontal. A la hora 8 debes poder hacer demo de una planta real con datos del middleware. Si no llegas, sacrificá módulos (empezá por Clima → Costo-Beneficio → Predicciones).

---

## 11. Comandos de setup (referencia)

```bash
# 1. Bootstrap Next.js
npx create-next-app@latest . --ts --tailwind --app --no-src-dir=false --import-alias "@/*"

# 2. Dependencias core
npm i prisma @prisma/client zod @tanstack/react-query recharts leaflet react-leaflet
npm i -D @types/leaflet

# 3. shadcn
npx shadcn@latest init
npx shadcn@latest add button card table badge dialog input select tabs

# 4. Postgres local
docker run --name sunhub-pg -e POSTGRES_PASSWORD=sunhub -e POSTGRES_DB=sunhub -p 5432:5432 -d postgres:15

# 5. Prisma
npx prisma init
# (editar schema.prisma con modelo de §4)
npx prisma migrate dev --name init

# 6. Dev
npm run dev

# 7. Test al middleware
curl -H "Authorization: $MIDDLEWARE_API_KEY" \
  "$MIDDLEWARE_BASE_URL/growatt/v1/plant/list"
```

---

## 12. Checklist de calidad (rúbrica de Tinku)

- [ ] **Impacto:** demo muestra un reporte de 40 min → 30s y una planta con breach detectado visiblemente.
- [ ] **Innovación:** Copilot conversacional + mapeo IA de nuevos proveedores + predictivo (al menos heurística LLM).
- [ ] **UX/UI:** alineado a mockups SunHub · responsive · sin bloqueos visibles.
- [ ] **Viabilidad técnica:** consume middleware real del evento, no mockea datos en la demo.
- [ ] **Escalabilidad comercial:** pitch menciona TAM (todas las EPC/O&M solares LATAM) + modelo SaaS.
- [ ] **Pitch:** 3 ensayos con cronómetro · <5 min · una anécdota memorable (ej: "hoy Bavaria perdía $2.4M, SunHub lo vio y lo evitó").

---

## 13. Referencias

- Mockups Stitch: proyecto `5847034811878630995` (12 pantallas)
- Middleware: `docs/resources/technical_guide.md`
- Problema: `docs/problem/problema.md` y `docs/problem/contexto_operacional.md`
- Rúbrica: `docs/resources/rubrica_participantes.md`
