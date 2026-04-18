# SunHub · Guía de Despliegue

> **Target:** Vercel (Next.js) + Neon/Railway (Postgres) + MiniMax API. **Tiempo estimado: 20 min.**

---

## 1. Pre-requisitos

- Cuenta **GitHub** con el repo `tinku_team_los_incapaces`
- Cuenta **Vercel** (free tier es suficiente)
- Cuenta **Neon** (preferido) o **Railway** para Postgres gestionado
- API key de **MiniMax** válida
- Token + URL del **middleware** de Techos Rentables (provisionado por hackathon)

---

## 2. Provisionar Postgres

### Opción A · Neon (recomendada)

1. Crear proyecto en https://neon.tech → nombre `sunhub`
2. Copiar **Connection string** (pooled, con `?sslmode=require`)
3. Guardarla como `DATABASE_URL`

### Opción B · Railway

1. https://railway.app → New Project → **PostgreSQL**
2. Variables → copiar `DATABASE_URL` con `?sslmode=require`

### Inicializar schema + seed

Desde la máquina local con la `DATABASE_URL` de producción:

```bash
DATABASE_URL="<neon-url>" npx prisma db push
DATABASE_URL="<neon-url>" npm run db:seed
```

**Verificar:**
```bash
DATABASE_URL="<neon-url>" npx prisma studio
# debería mostrar 8 plantas, 2 providers, ~8 devices
```

---

## 3. Desplegar en Vercel

### 3.1. Importar el repo

1. https://vercel.com/new → **Import Git Repository**
2. Seleccionar `tinku_team_los_incapaces`
3. Framework preset: **Next.js** (autodetectado)
4. **Root Directory:** `.` (raíz)
5. Build Command: `npm run build` (default)
6. Output Directory: `.next` (default)
7. Install Command: `npm install && prisma generate`

### 3.2. Variables de entorno (en Vercel → Settings → Environment Variables)

```bash
# Postgres
DATABASE_URL=<neon-pooled-url>

# MiniMax
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_API_KEY=sk-api-...
MINIMAX_MODEL=MiniMax-Text-01

# Middleware (Techos Rentables)
MIDDLEWARE_BASE_URL=https://techos.thetribu.dev
MIDDLEWARE_TOKEN=tk_...

# Ingesta (opcional en prod serverless)
ALLOW_SYNTHETIC=true
```

Marca todas como **Production**, **Preview**, **Development**.

### 3.3. Deploy

Push a `main` o click **Deploy** en el UI. El primer build tarda ~2-3 min.

---

## 4. Ingesta en producción

Vercel es serverless — **no corre workers permanentes**. Opciones:

### Opción A · Vercel Cron (recomendada para hackathon)

Crear `vercel.json` en la raíz:

```json
{
  "crons": [
    { "path": "/api/cron/ingest", "schedule": "*/5 * * * *" }
  ]
}
```

Y crear `src/app/api/cron/ingest/route.ts`:

```ts
import { NextResponse } from "next/server";
import { runIngestOnce } from "@/workers/ingest"; // exportar la función
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  const result = await runIngestOnce();
  return NextResponse.json(result);
}
```

**Nota:** Vercel cron requiere que la función exporte `runIngestOnce`. El worker
actual está como CLI; extraer el loop a una función pura es un refactor pequeño.

### Opción B · Worker externo (Railway)

1. Railway → New Service → **Deploy from GitHub**
2. Start command: `npm run ingest`
3. Mismas env vars (DATABASE_URL, MIDDLEWARE_*, MINIMAX_*)

Para la demo del hackathon, basta con correr `npm run ingest -- --once` local contra la DB de prod.

---

## 5. Verificación post-deploy

En `https://<tu-app>.vercel.app`:

| Check | URL | Esperado |
|---|---|---|
| Landing | `/` | redirige a /dashboard |
| Dashboard | `/dashboard` | 8 plantas, KPIs visibles |
| API flota | `/api/fleet/summary` | JSON con `totalPlants: 8` |
| Copilot | `/copilot` + pregunta | respuesta MiniMax en <10s |
| Reportes | `/reportes` + generar | reporte en <30s |
| Predicción | `/predicciones` + ejecutar | tarjeta con root cause |
| Cliente | `/cliente` | lista 7 clientes |

---

## 6. Troubleshooting

### "prisma client not generated"
Añadir `postinstall` a `package.json`:
```json
"scripts": { "postinstall": "prisma generate" }
```

### "timeout on /api/copilot"
MiniMax puede tardar >10s. Asegurar `maxDuration = 60` en las rutas (ya aplicado).
Vercel free tier tope: 10s → upgrade a Pro para 60s.

### "DATABASE_URL is not set" en runtime
La env var no se inyectó. Verificar que esté en **Production** scope y redeployar.

### "prisma P1001: Can't reach database server"
`?sslmode=require` falta en la URL de Neon. Corregir y redeployar.

### Readings vacías en prod
La DB está seeded pero sin ingest. Correr backfill:
```bash
DATABASE_URL="<prod>" npm run ingest:backfill -- --days=14
```

---

## 7. Costos (flota de 200 plantas, 24/7)

| Servicio | Plan | Costo/mes |
|---|---|---|
| Vercel | Pro | $20 |
| Neon | Scale | $19 (3 GB storage, 300h compute) |
| MiniMax | Pay-as-you-go | ~$5-15 (depends on copilot+reportes volumen) |
| Open-Meteo | Free | $0 |
| **Total** | | **<$55/mes** |

---

## 8. Rollback

1. Vercel → Deployments → seleccionar deploy anterior → **Promote to Production**
2. Si rompió el schema: Neon → Branches → branch pre-migración

---

## 9. Checklist mínimo para el día del hackathon

- [ ] Build local pasa: `npm run build` (verificado)
- [ ] Typecheck pasa: `npx tsc --noEmit` (verificado)
- [ ] Neon DB creada y seeded
- [ ] Vercel deploy verde
- [ ] MiniMax key funciona en prod (test /copilot)
- [ ] URL pública lista: `sunhub-<hash>.vercel.app`
- [ ] Backup demo local por si falla la red
