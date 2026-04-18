# SunHub · Plan de despliegue (Vercel + Render)

> Objetivo: sacar el MVP a producción con el mínimo de piezas móviles,
> aprovechando Vercel para la app Next.js y Render para la base de datos
> y los jobs de background.

---

## 1. Arquitectura de producción

```
┌─────────────────────────┐         ┌──────────────────────────────┐
│  Vercel                 │         │  Render                      │
│                         │         │                              │
│  ┌───────────────────┐  │         │  ┌────────────────────────┐  │
│  │  sunhub-web       │  │◀───────▶│  │  postgres (managed)    │  │
│  │  (Next.js 15)     │  │  SQL    │  │  plan: Starter 1 GB    │  │
│  │  • UI SSR         │  │         │  └────────────┬───────────┘  │
│  │  • API routes     │  │                         │              │
│  │  • Auth cookies   │  │                         ▼              │
│  └─────────┬─────────┘  │         │  ┌────────────────────────┐  │
│            │            │         │  │  sunhub-cron           │  │
└────────────┼────────────┘         │  │  (Background Worker)   │  │
             │ https                │  │  • ingest  */5 min     │  │
             │                      │  │  • alarms  * min       │  │
             ▼                      │  │  • baselines 03:15 d   │  │
┌────────────────────────────┐      │  │  • report-schedules    │  │
│  Servicios externos        │      │  │  • plants-sync 0 h     │  │
│  • thetribu.dev (MW)       │      │  └────────────────────────┘  │
│  • api.minimax.io          │      │                              │
│  • api.open-meteo.com      │      └──────────────────────────────┘
│  • SMTP (Resend / Gmail)   │
└────────────────────────────┘
```

**Reglas de la segmentación**

- **Vercel** solo aloja lo que es stateless y responde a HTTP: la app
  Next.js (UI + API routes). Nada que requiera estar prendido entre
  requests (crons de 1 minuto, workers long-running).
- **Render** aloja lo que necesita estado persistente (Postgres) o un
  proceso siempre vivo (cron worker).
- **Servicios externos** se consumen vía HTTPS desde ambos lados; no
  los desplegamos nosotros.

---

## 2. Componentes y destino

| Componente                        | Origen en el repo                       | Destino  | Tipo de servicio                  |
| --------------------------------- | --------------------------------------- | -------- | --------------------------------- |
| App Next.js (UI + API)            | `src/app/**`, `next.config.*`           | Vercel   | Next.js Project                   |
| Base de datos                     | `prisma/schema.prisma`                  | Render   | PostgreSQL (managed)              |
| Cron worker                       | `src/workers/cron.ts`                   | Render   | Background Worker (Node)          |
| Script `plants-sync` (arranque)   | `scripts/sync-real-plants.ts`           | Render   | Ejecutado por cron cada hora      |
| Script `update-baselines`         | `scripts/update-baselines.ts`           | Render   | Ejecutado por cron 03:15 diario   |
| `create-user` (bootstrap)         | `scripts/create-user.ts`                | Render   | Shell manual (Job one-off)        |
| `reset-data` (hackathon only)     | `scripts/reset-data.ts`                 | —        | No desplegar; uso local           |
| Prisma migrations                 | `prisma/schema.prisma`                  | Render   | `prisma migrate deploy` en build  |
| Mailpit (SMTP local)              | `docker-compose` local                  | —        | Reemplazado por SMTP de prod      |
| Middleware de marcas (MW)         | `https://techos.thetribu.dev`           | Externo  | No se despliega                   |
| MiniMax (LLM)                     | `api.minimax.io`                        | Externo  | No se despliega                   |
| Open-Meteo (clima)                | `api.open-meteo.com`                    | Externo  | No se despliega                   |
| SMTP transaccional                | Gmail/Resend/Mailtrap                   | Externo  | Credencial en env                 |

---

## 3. Vercel · `sunhub-web`

**Tipo:** Next.js project · **Build command:** `next build` ·
**Output:** `.next`

### 3.1 Configuración del proyecto

- **Framework preset:** Next.js (auto-detectado).
- **Node.js version:** 20.x.
- **Install command:** `npm ci` (respeta `postinstall` → `prisma generate`).
- **Root directory:** `/` (el repo es monorepo-simple).
- **Branch de producción:** `main`.
- **Preview deployments:** todas las ramas de PR.

### 3.2 Variables de entorno (Production + Preview)

> Marca cada variable en el dashboard como **Production** y **Preview**
> según aplique. Las que empiezan por `NEXT_PUBLIC_` se embeben en el
> bundle del cliente.

| Variable                   | Valor ejemplo                                 | Notas                                                    |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`             | `postgresql://…@…pooler.render.com/…?schema=public&pgbouncer=true&connection_limit=1` | **pooler** para serverless                           |
| `DIRECT_URL`               | `postgresql://…@…render.com/…?schema=public`  | conexión directa para migraciones                        |
| `MIDDLEWARE_BASE_URL`      | `https://techos.thetribu.dev`                 | fijo                                                     |
| `MIDDLEWARE_API_KEY`       | `tk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`         | **Sensitive**                                            |
| `MINIMAX_API_KEY`          | `sk-api-xxxxxxxxxxxxxxxxxxxxxxxx`             | **Sensitive**                                            |
| `MINIMAX_BASE_URL`         | `https://api.minimax.io/v1`                   |                                                          |
| `MINIMAX_MODEL`            | `MiniMax-Text-01`                             |                                                          |
| `WEATHER_BASE_URL`         | `https://api.open-meteo.com/v1`               |                                                          |
| `SMTP_HOST`                | `smtp.resend.com` / `smtp.gmail.com`          | **dejar vacío desactiva el canal**                       |
| `SMTP_PORT`                | `465` / `587`                                 |                                                          |
| `SMTP_USER`                | `resend`                                      | **Sensitive**                                            |
| `SMTP_PASSWORD`            | `re_xxxxxxxxxxxxxxxx`                         | **Sensitive**                                            |
| `SMTP_FROM`                | `SunHub <noreply@sunhub.app>`                 |                                                          |
| `APP_BASE_URL`             | `https://sunhub.vercel.app`                   | usado en links de correos                                |
| `NEXT_PUBLIC_APP_NAME`     | `SunHub`                                      |                                                          |
| `NEXT_PUBLIC_APP_URL`      | `https://sunhub.vercel.app`                   |                                                          |
| `NODE_ENV`                 | (lo setea Vercel automáticamente)             |                                                          |

### 3.3 Build & Prisma en Vercel

1. Ya existe `"postinstall": "prisma generate"` en `package.json`, así
   que el cliente se genera en cada build sin tocar nada.
2. Las **migraciones NO se corren desde Vercel** (es serverless y no
   conviene). Se aplican desde Render (sección 4.3) antes del primer
   deploy de la web.
3. Recomendación: habilitar `output: "standalone"` en `next.config.mjs`
   **no es necesario** para Vercel (solo aplica para Docker/selfhost).

### 3.4 Ajustes puntuales del código para serverless

- Confirmar que toda ruta que usa `prisma` agrega
  `export const dynamic = "force-dynamic"` cuando escribe o consulta
  en vivo (ya está en los API routes de SunHub).
- Las rutas `/api/weather` y `/api/copilot` ya usan `fetch` con
  `revalidate` donde aplica; no tocar.
- **Quitar** la dependencia del `Makefile` y de `make smtp-up` en
  producción: Mailpit no existe ahí, se usa SMTP externo.

### 3.5 Dominio

- Asignar dominio `sunhub.app` (o el que corresponda) al proyecto
  Vercel → apunta DNS A/CNAME a `cname.vercel-dns.com`.
- Activar HTTPS automático.

---

## 4. Render · base de datos y worker

Se crean **dos servicios** en el mismo dashboard:

### 4.1 `sunhub-db` · PostgreSQL managed

- Plan sugerido: **Starter** (1 GB RAM · 1 GB disk · $7/mes) para el
  hackathon. Escala a Standard cuando haya retención de readings > 30 días.
- Región: **Oregon** o **Frankfurt** (la más cercana al MW y a MiniMax).
- Versión: PostgreSQL 15+.
- Activar **backups diarios** (incluidos en Starter).
- Guardar los dos endpoints:
  - **Internal Database URL** → para el worker Render (misma red
    privada, más rápido).
  - **External Database URL** → para Vercel (usa el pooler si lo
    expone, o `?connection_limit=1&pgbouncer=true`).

### 4.2 `sunhub-cron` · Background Worker

Render distingue **Web Service** (expone puerto) y **Background Worker**
(proceso persistente sin puerto). Para nuestro caso es **Background Worker**.

| Campo             | Valor                                                        |
| ----------------- | ------------------------------------------------------------ |
| Environment       | `Node`                                                       |
| Branch            | `main`                                                       |
| Root directory    | `/`                                                          |
| Build command     | `npm ci && npx prisma generate && npx prisma migrate deploy` |
| Start command     | `npm run cron`                                               |
| Instance type     | Starter ($7/mes) — suficiente para el hackathon              |
| Auto deploy       | On (al push a `main`)                                        |

> **Importante:** incluir `prisma migrate deploy` en el build hace que
> el worker sea el responsable único de aplicar migraciones antes de
> arrancar. Si luego se separan las migraciones a un job dedicado, se
> quita de aquí.

#### 4.2.1 Variables de entorno del worker

Usar el **Internal Database URL** de `sunhub-db` en `DATABASE_URL`.
El worker no pasa por pooler: corre como proceso persistente.

| Variable                          | Valor                                                     |
| --------------------------------- | --------------------------------------------------------- |
| `DATABASE_URL`                    | `postgresql://…@…internal.render.com/sunhub`              |
| `DIRECT_URL`                      | igual a `DATABASE_URL` (o el external si prefieres)       |
| `MIDDLEWARE_BASE_URL`             | `https://techos.thetribu.dev`                             |
| `MIDDLEWARE_API_KEY`              | **Sensitive**                                             |
| `MINIMAX_API_KEY`                 | **Sensitive**                                             |
| `MINIMAX_BASE_URL`                | `https://api.minimax.io/v1`                               |
| `MINIMAX_MODEL`                   | `MiniMax-Text-01`                                         |
| `WEATHER_BASE_URL`                | `https://api.open-meteo.com/v1`                           |
| `SMTP_HOST` … `SMTP_FROM`         | mismo SMTP de Vercel (para que los correos salgan aquí también si el worker escala alertas) |
| `APP_BASE_URL`                    | `https://sunhub.vercel.app` (para links en correos)       |
| `CRON_INGEST_SCHEDULE`            | `*/5 * * * *`                                             |
| `CRON_ALARMS_SCHEDULE`            | `* * * * *`                                               |
| `CRON_PLANTS_SYNC_SCHEDULE`       | `0 * * * *`                                               |
| `CRON_BASELINES_SCHEDULE`         | `15 3 * * *`                                              |
| `CRON_REPORT_SCHEDULES_SCHEDULE`  | `* * * * *`                                               |
| `CRON_TIMEZONE`                   | `America/Bogota`                                          |
| `CRON_RUN_ON_START`               | `1` (ejecuta un ciclo al arrancar)                        |
| `ALARMS_WINDOW_DAYS`              | `2`                                                       |
| `NODE_ENV`                        | `production`                                              |

### 4.3 Primer bootstrap (una sola vez)

1. Crear `sunhub-db` y dejarlo listo.
2. Crear `sunhub-cron` apuntando a la DB → en el primer deploy corre
   `prisma migrate deploy` y crea todas las tablas.
3. Desde el shell de Render (pestaña Shell del worker) crear el usuario
   admin:
   ```bash
   npx tsx scripts/create-user.ts --email you@sunhub.app --name Robert --role admin
   ```
4. Opcional: cargar plantas reales con
   ```bash
   npx tsx scripts/sync-real-plants.ts
   ```
   (también se ejecuta sola cada hora por el cron).

---

## 5. Servicios externos · credenciales

| Servicio       | Cómo se obtiene                                                                   |
| -------------- | --------------------------------------------------------------------------------- |
| Middleware MW  | Lo provee el hackathon — copiar `MIDDLEWARE_API_KEY` del panel de Tinku.          |
| MiniMax        | `https://www.minimax.io/platform` → API Keys. Plan free incluye quota de pruebas. |
| Open-Meteo     | Sin llave (tier gratuito, 10k req/día). Sólo configurar `WEATHER_BASE_URL`.       |
| SMTP (Resend)  | `https://resend.com` → API key `re_xxx`. Plan free = 3 000 correos/mes.           |
| SMTP (Gmail)   | Cuenta Google → *App password* de 16 chars. Límite 500 correos/día.               |

---

## 6. Secuencia de despliegue (orden recomendado)

1. **Render** → crear `sunhub-db`. Copiar Internal y External URLs.
2. **Render** → crear `sunhub-cron` con env vars (sección 4.2.1) +
   `DATABASE_URL` interno.
   - Primer deploy aplica `prisma migrate deploy`.
   - Verificar logs: deben aparecer líneas `[cron] ▶ ingest start` y
     `[cron] ✓ ingest done`.
3. **Render shell del worker** → `npx tsx scripts/create-user.ts …`
   para el admin inicial.
4. **Vercel** → importar el repo desde GitHub (branch `main`).
   - Añadir env vars (sección 3.2) con `DATABASE_URL` = External URL
     (con `?pgbouncer=true&connection_limit=1`).
   - Deploy.
5. **Humo-test en producción** (sección 7).
6. **Dominio** → conectar el custom domain en Vercel.

---

## 7. Validación post-deploy (humo-test)

- [ ] `https://sunhub.vercel.app/login` carga (UI y estilos OK).
- [ ] Login con el usuario admin creado en paso 6.3 funciona
      (cookie de sesión se emite).
- [ ] `/dashboard` muestra plantas ingestadas por el worker
      (≥ 1 planta después del primer tick).
- [ ] `/alarmas` — la campana del header muestra conteo real.
- [ ] `/clima` — carga pronóstico Open-Meteo y score del día ideal.
- [ ] Copilot FAB → hace una pregunta y recibe respuesta de MiniMax.
- [ ] Crear un ticket en una alarma → llega correo al SMTP configurado.
- [ ] Logs de Render muestran ticks `[cron] ✓ ingest done` cada 5 min.
- [ ] Render DB: `SELECT count(*) FROM readings;` > 0.

---

## 8. Gotchas y contingencia

- **Prisma + Vercel serverless**: siempre usar pooler
  (`?pgbouncer=true&connection_limit=1`) en `DATABASE_URL`. Sin esto,
  cada función fría abre conexiones y la DB se satura.
- **Migraciones desde Vercel**: evitarlo. Si una migración se queda
  pegada, Vercel reintentará el build y puede dejar la tabla
  inconsistente. Las corre Render en el build del worker.
- **Timezone**: el worker debe tener `CRON_TIMEZONE=America/Bogota`,
  porque Render corre en UTC por defecto. Sin eso, los schedules
  como `15 3 * * *` se ejecutan a hora equivocada.
- **Costo total estimado (MVP)**: Vercel Hobby ($0) + Render Starter
  DB ($7) + Render Starter Worker ($7) ≈ **$14/mes**. Plan free de
  MiniMax y Open-Meteo durante el hackathon. Resend free ≈ $0.
- **Upgrade path**: cuando haya > 5 000 readings/día, mover DB a
  Render Standard ($20). La app se mantiene en Vercel Hobby hasta que
  el tráfico justifique Pro.
- **Logs centralizados**: Vercel expone logs 1 h; Render expone 24 h
  gratis. Si se necesita más retención, enviar a Logtail / Datadog vía
  env `LOGTAIL_TOKEN`.

---

## 9. Archivos que hay que tocar antes del primer deploy

- `.env.example` — ya está completo, úsalo de referencia para llenar
  Vercel y Render.
- `package.json` — no requiere cambios; `postinstall` ya corre
  `prisma generate`.
- `prisma/schema.prisma` — `datasource db` ya lee `DATABASE_URL` y
  `DIRECT_URL` del entorno, no hay que tocar.
- `next.config.*` — confirmar que no hay dominios hardcodeados de
  imagenes; si los hubiera, añadirlos a `images.domains`.
- **Crear** (opcional): `render.yaml` en la raíz del repo para
  infra-as-code. Plantilla:

  ```yaml
  databases:
    - name: sunhub-db
      plan: starter
      region: oregon
      postgresMajorVersion: 15

  services:
    - type: worker
      name: sunhub-cron
      env: node
      plan: starter
      region: oregon
      branch: main
      buildCommand: npm ci && npx prisma generate && npx prisma migrate deploy
      startCommand: npm run cron
      envVars:
        - key: DATABASE_URL
          fromDatabase: { name: sunhub-db, property: connectionString }
        - key: DIRECT_URL
          fromDatabase: { name: sunhub-db, property: connectionString }
        - key: CRON_TIMEZONE
          value: America/Bogota
        # … resto de variables se cargan desde el dashboard
  ```

  Con `render.yaml` basta un *Blueprint* en Render y levanta DB + worker
  con un click.
