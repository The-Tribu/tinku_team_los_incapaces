# SunHub · Estado actual de la implementación

**Equipo:** Los Incapaces · **Hackathon:** TINKU 2026 · **Cliente:** Techos Rentables
**Rama activa:** `feat/sunhub-mvp` · **Stack:** Next.js 15 + Prisma + Postgres

Este documento resume lo que ya está construido, cómo correrlo localmente, qué
datos son reales vs sintéticos y qué queda pendiente. Léelo si te acabas de
subir al repo.

---

## 1 · Qué hace SunHub hoy

SunHub es una plataforma unificada de operación solar para Techos Rentables.
Integra Growatt y Deye bajo un modelo canónico, monitorea la flota en tiempo
real, genera alarmas automáticamente, predice fallas con IA y produce
reportes ejecutivos.

Vistas implementadas (todas navegables desde el AppShell):

| Ruta | Pantalla |
|---|---|
| `/dashboard` | KPIs globales · gráfica 24h por proveedor · alarmas abiertas · mapa flota + top plantas |
| `/plantas` | Listado filtrable + detalle por planta (`/plantas/[id]`) |
| `/alarmas` | Alarmas abiertas con resolución in-place |
| `/clima` | Pronóstico de generación 5 días (Open-Meteo) + mejor día para mantenimiento |
| `/costo-beneficio` | Scoring de proveedores (PR, uptime, alarmas, CAPEX/warranty) |
| `/copilot` | Chat con LLM (MiniMax) alimentado con contexto de flota |
| `/predicciones` | Predicciones de falla por planta (heurística + MiniMax) |
| `/reportes` | Generación de reportes ejecutivos |
| `/onboarding` | Wizard de 5 pasos para alta de planta |
| `/cliente/[id]` | PWA mobile para el cliente final (kW actual, ahorro, CO₂) |

---

## 2 · Arquitectura en 90 segundos

```
Middleware hackathon (techos.thetribu.dev)
        │
        ▼
src/lib/middleware.ts     ← cliente fetch con Accept-Encoding: identity
        │
src/lib/normalize.ts      ← adapters por proveedor → CanonicalReading
        │
src/workers/ingest.ts     ← tick periódico: fetch → persist → rules
        │
        ▼
Postgres (Prisma)         ← Client · Plant · Device · Reading · Alarm · …
        │
        ▼
src/app/api/*             ← Next route handlers
src/app/*/page.tsx        ← Server components
```

**Modelo canónico (clave):** todo proveedor se normaliza a `CanonicalReading`
(`device_external_id`, `power_ac_kw`, `status`, `ts`, …). La UI y las reglas
nunca tocan la forma cruda del proveedor.

**Motor de reglas** (`src/lib/rules.ts`) es idempotente: si un dispositivo
sigue offline, no crea una segunda alarma; si vuelve online, cierra la
alarma automáticamente (`resolved_at`).

---

## 3 · Puesta en marcha local

```bash
# 1. Postgres en Docker
docker run -d --name sunhub-pg \
  -e POSTGRES_PASSWORD=sunhub -e POSTGRES_DB=sunhub \
  -p 5432:5432 postgres:15

# 2. Variables de entorno
cp .env.example .env.local
# editar .env.local y poner MIDDLEWARE_API_KEY + MINIMAX_API_KEY

# 3. Dependencias + schema + seed
npm install
npm run db:push
npm run db:seed

# 4. Datos reales del hackathon (6 Deye + 1 Growatt)
npm run plants:sync

# 5. Ingest (un ciclo) → lectura + alarmas reales
npm run ingest -- --once

# 6. App
npm run dev   # http://localhost:3000

# 7. (opcional) Prisma Studio para ver la DB
npm run db:studio  # http://localhost:5555
```

---

## 4 · Estado de los datos

### 4.1 Datos reales (verificados con el middleware)

Vienen marcados con `contract_type='real'` y código `RE-DEY-*` / `RE-GRO-*`.

| Código | Planta | Proveedor | Estado |
|---|---|---|---|
| RE-DEY-40760 | Altos de Quimbaya Casa 4 | Deye | online |
| RE-DEY-41053 | Opticalia Herrera | Deye | **offline** (alarma real) |
| RE-DEY-122825 | J&G | Deye | online |
| RE-DEY-148520 | Hacienda San Miguel | Deye | **offline** (alarma real) |
| RE-DEY-155158 | Aicardo | Deye | online |
| RE-DEY-166961 | Novacams 1 | Deye | online |
| RE-GRO-1356131 | Bavaria Tibitó | Growatt | (ver §6) |

### 4.2 Datos sintéticos (seed de demo)

Plantas con códigos `TR-0xxx` y `contract_type` en `{PPA, Leasing, Compra}`.
Se crean con `npm run db:seed` para tener flota suficiente (15 plantas)
para hacer demo visual. Las lecturas sintéticas se generan con
`src/lib/synthetic.ts` cuando `ALLOW_SYNTHETIC=true` (default en dev).

Para el ingest solo-real: `INGEST_SYNTHETIC=0 npm run ingest -- --once`.

### 4.3 Lectura de alarmas (hallazgo importante)

**El middleware NO expone endpoints `/alarm/*`.** Probado con
`scripts/probe-alarms.ts` — todos devuelven 404 (Growatt: HTML login;
Deye: `{"status":404}`). Las alarmas se derivan del estado de los
dispositivos:

- **Growatt:** campo `lost: true` en `/growatt/v1/device/list?plant_id=X`.
- **Deye:** `connectionStatus` (`NORMAL` / `ALL_OFFLINE` / `PARTIAL_OFFLINE`)
  en `/deye/v1.0/station/list` + `lastUpdateTime` stale en
  `/deye/v1.0/station/latest`.

El motor de reglas ya consume esos signals y crea alarmas críticas
(offline) y warnings (low-gen) automáticamente.

---

## 5 · Hallazgos técnicos que costaron tiempo

1. **Encoding fantasma del middleware.** Caddy/CloudFront remueven el
   header `content-encoding` pero el body sigue comprimido. Node's fetch
   no puede auto-descomprimir y devuelve bytes basura. Fix: mandar
   `Accept-Encoding: identity`. Está en `src/lib/middleware.ts:49`.

2. **MiniMax con JSON mode.** Si mandas `response_format: json_object`
   responde con `content=""`. Usamos texto plano con formato
   `CAUSA: … ACCION: …` y regex. Ver `src/lib/predictions.ts`.

3. **Auth del middleware NO es Bearer.** Es `Authorization: tk_...`
   pelado, sin prefijo. Si pones `Bearer ...` devuelve 401.

4. **Growatt `plant/list` rate-limit.** Suele devolver
   `error_frequently_access`. El sync cae al fallback de pedir directo
   `plant/data?plant_id=1356131` (Bavaria Tibitó).

---

## 6 · Pendientes / follow-ups

- **Bavaria Tibitó duplicada.** El device externo `1356131` quedó
  enlazado al seed plant `TR-0201` por la unique-constraint
  `(provider_id, external_id)`. La planta real `RE-GRO-1356131` existe
  pero sin device. Arreglo: migrar el FK del device o dropear una de
  las dos plantas antes del demo.
- **Toggle real vs sintético en UI.** Hoy `/dashboard` mezcla ambas.
  Sugerencia: filtro `?only=real` para que la demo sea 100% veraz.
- **Ingest continuo.** `npm run ingest` corre un loop cada 60s, pero
  no está desplegado. Para prod hay que montarlo como cron job en
  Vercel (o un worker aparte en Railway/Fly).
- **Tests.** No hay suite aún. Prioridad: normalizers y rules.
- **Reportes PDF.** Hoy genera markdown; falta export PDF.

---

## 7 · Archivos clave para leer primero

| Archivo | Por qué |
|---|---|
| `prisma/schema.prisma` | Modelo canónico completo |
| `src/lib/normalize.ts` | Adapters Growatt/Deye → CanonicalReading |
| `src/lib/middleware.ts` | Cliente del middleware (con el fix de encoding) |
| `src/lib/rules.ts` | Motor de alarmas idempotente |
| `src/workers/ingest.ts` | Loop de polling |
| `src/app/dashboard/page.tsx` | Entrada visual principal |
| `scripts/sync-real-plants.ts` | Cómo se sembraron las 7 plantas reales |
| `docs/ESPECIFICACIONES_TECNICAS.md` | Especificación funcional completa |
| `docs/DEPLOYMENT.md` | Cómo llevarlo a Vercel + Neon |
| `docs/PITCH_DEMO.md` | Script del demo de 10 min |

---

## 8 · Quién puede agarrar qué

Sugerencia de reparto si somos varios:

- **Frontend / UX polish** → `/dashboard`, `/plantas`, `/alarmas`,
  responsive del `AppShell`, accesibilidad.
- **Data pipeline** → ingest en prod (cron), backfill histórico,
  investigar si hoymiles/solarman/srne tienen keys válidas en el
  middleware (actualmente 404).
- **IA** → afinar prompts del copilot y predicciones, añadir contexto
  de costos, memoria conversacional.
- **Deploy + DX** → Vercel + Neon siguiendo `docs/DEPLOYMENT.md`,
  seed de datos demo en prod.
- **Pitch** → ensayar `docs/PITCH_DEMO.md`, armar slides, preparar la
  historia del caso Opticalia Herrera (alarma real).

---

**Contacto:** para dudas sobre middleware/data, mirar los scripts en
`scripts/probe-*.ts` — son autocontenidos y muestran la forma real
de cada respuesta.
