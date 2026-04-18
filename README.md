# SunHub ⚡

> Plataforma unificada de operación solar — consolida en un solo sistema las 6 plataformas de monitoreo (Growatt, Huawei, DeyeCloud, Hoymiles, SRNE…) que Techos Rentables opera hoy.

**Equipo Los Incapaces · TINKU Hackathon 2026** · Info del evento → [README-HACKATHON.md](./README-HACKATHON.md)

---

## ¿Qué hace SunHub?

- **Unifica** el monitoreo de 200+ plantas solares multi-marca en un único dashboard.
- **Detecta fallas en <5 min** con un motor de reglas sobre lecturas normalizadas.
- **Predice fallas 2–7 días** antes con IA (MiniMax).
- **Genera reportes mensuales automáticos** — de 40 min manuales a 30 seg.
- **Recomienda proveedor óptimo** por costo/beneficio histórico.
- **Avisa de clima adverso** con impacto operativo estimado.
- **Portal cliente** (mobile) para que el cliente final vea su planta en una sola app.

→ Detalles completos en [`docs/ESPECIFICACIONES_TECNICAS.md`](./docs/ESPECIFICACIONES_TECNICAS.md)

---

## Stack

- **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui
- **Charts & Maps:** Recharts · react-leaflet
- **Backend:** Next.js API Routes · Node 20
- **DB / ORM:** PostgreSQL 15 · Prisma
- **AI / LLM:** MiniMax (MiniMax-Text-01)
- **Clima:** Open-Meteo (sin API key)
- **Middleware solar:** `techos.thetribu.dev` (provisto por el hackathon)
- **Deploy:** Vercel

---

## Instalación y ejecución

### 1. Pre-requisitos

- Node.js 20+
- Docker (para Postgres local)
- API key del middleware Tinku (en el kit de bienvenida)
- API key de MiniMax

### 2. Clonar y configurar

```bash
git clone <repo-url>
cd tinku_team_los_incapaces
cp .env.example .env.local
# editar .env.local con las keys reales
```

### 3. Base de datos

```bash
docker run --name sunhub-pg \
  -e POSTGRES_PASSWORD=sunhub \
  -e POSTGRES_DB=sunhub \
  -p 5432:5432 -d postgres:15
```

Agregar a `.env.local`:
```
DATABASE_URL=postgresql://postgres:sunhub@localhost:5432/sunhub
```

### 4. Instalar dependencias y migrar

```bash
npm install
npx prisma migrate dev
```

### 5. Correr en desarrollo

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

### 6. Worker de ingestión (terminal aparte)

```bash
npm run ingest
```

```bash
  Scripts disponibles:
  npm run scrape:deye:pw            # headless, continuo (60 s)
  npm run scrape:deye:pw -- --once  # un solo tick y sale
  npm run scrape:deye:pw:headed     # browser visible (debug)
```

---

## Variables de entorno

Ver [`.env.example`](./.env.example). Las críticas:

| Variable | Descripción |
|---|---|
| `MIDDLEWARE_BASE_URL` | `https://techos.thetribu.dev` |
| `MIDDLEWARE_API_KEY` | `tk_...` de tu equipo |
| `MINIMAX_API_KEY` | Key de MiniMax para Copilot |
| `MINIMAX_BASE_URL` | `https://api.minimax.io/v1` |
| `MINIMAX_MODEL` | `MiniMax-Text-01` |
| `DATABASE_URL` | URL Postgres |

> `.env.local` está en `.gitignore`. Nunca subas secretos.

---

## Estructura

```
sunhub/
├─ src/
│  ├─ app/                      # Rutas Next.js (App Router)
│  │  ├─ dashboard/             # Control tower global
│  │  ├─ plantas/               # Lista y detalle de plantas
│  │  ├─ alarmas/               # Centro de alarmas
│  │  ├─ predicciones/          # Alertas predictivas (IA)
│  │  ├─ clima/                 # Inteligencia climática
│  │  ├─ costo-beneficio/       # Benchmark de proveedores
│  │  ├─ onboarding/            # Wizard alta proveedor/cliente
│  │  ├─ copilot/               # Chat AI + reportes
│  │  ├─ app/client/            # Portal móvil del cliente
│  │  └─ api/                   # Endpoints
│  ├─ components/
│  ├─ lib/
│  │  ├─ middleware.ts          # Cliente techos.thetribu.dev
│  │  ├─ normalize.ts           # Adapters multi-marca
│  │  ├─ minimax.ts             # Cliente MiniMax
│  │  ├─ weather.ts             # Open-Meteo
│  │  └─ prisma.ts
│  └─ workers/
│     └─ ingest.ts              # Poller cada 1–5 min
├─ prisma/
│  └─ schema.prisma
└─ docs/
   ├─ ESPECIFICACIONES_TECNICAS.md
   ├─ problem/
   └─ resources/
```

---

## Mockups

Los diseños completos (12 pantallas) están en Stitch, proyecto `5847034811878630995`. Incluye Dashboard Global, Lista de Plantas, Detalle de Planta, Centro de Alarmas, Copilot AI, Alertas Predictivas, Client App (mobile), Onboarding Wizard, Inteligencia Climática, y Costo-Beneficio.

---

## Documentación

- 📄 [`docs/ESPECIFICACIONES_TECNICAS.md`](./docs/ESPECIFICACIONES_TECNICAS.md) — Arquitectura, modelo de datos, APIs, plan 18h.
- 📄 [`docs/problem/problema.md`](./docs/problem/problema.md) — Definición del problema.
- 📄 [`docs/problem/contexto_operacional.md`](./docs/problem/contexto_operacional.md) — Contexto operacional de Techos Rentables.
- 📄 [`docs/resources/technical_guide.md`](./docs/resources/technical_guide.md) — Middleware del hackathon.

---

## Licencia

MIT — ver [`LICENSE`](./LICENSE).

---

**Equipo Los Incapaces** · Robert Triana · Duban Monsalve · John Nieto
