# SunHub · Pitch & Demo Script

**Equipo:** Los Incapaces · **Hackathon TINKU 2026** · **Cliente:** Techos Rentables

---

## 1. Elevator Pitch (30 seg)

> Techos Rentables opera **+200 plantas solares** en Colombia con **6 marcas diferentes de inversores**,
> cada una con su propia app. Los operadores pasan **2h diarias saltando entre dashboards**,
> los reportes mensuales toman **40 min por planta** y las fallas **se descubren cuando ya perdieron energía**.
>
> **SunHub** unifica la operación en una sola plataforma: un **dashboard único**, un **copiloto IA**
> que responde en lenguaje natural, **predicción de fallas** 3–14 días antes, **reportes en <30 seg** y
> una **app móvil para clientes** (CFO de Bavaria, gerente de Éxito) que ven en vivo cuánto ahorran.

---

## 2. Problema (2 min)

| Dolor | Magnitud |
|---|---|
| 6 apps de proveedor (Growatt, Huawei, Deye, Hoymiles, SRNE, Solarman) | 2 h/día perdidas |
| Reportes mensuales manuales (Excel + screenshots) | 40 min × 200 plantas = **133 h/mes** |
| Fallas detectadas tarde | –15% PR promedio, penalizaciones PPA |
| Clientes sin visibilidad | Churn + llamadas de soporte |
| Onboarding de planta nueva | ~2 días de papeleo |

**Caso real (Bavaria Tibitó, TR-0201):** planta con PR cayendo 21 pp/día, uptime 75%,
sin detección hasta que llegó la factura. **Penalización: $2.5 M COP.**

---

## 3. Solución — 9 módulos en SunHub (1 min)

1. **Dashboard** · KPIs flota + mapa + generación 24h
2. **Plantas** · tabla + detalle con PR, alarmas, lecturas
3. **Alarmas** · centro unificado, reglas + self-healing
4. **Predicción IA** · heurística + MiniMax root-cause ⭐
5. **Copilot IA** · pregunta-respuesta en español con contexto de la flota ⭐
6. **Reportes** · mensuales <30 seg con narrativa MiniMax ⭐
7. **Clima** · Open-Meteo 5 días → mejor día para mantenimiento
8. **Proveedores** · comparador costo-beneficio (score datos reales + catálogo)
9. **Onboarding** · wizard 5 pasos, planta reportando en <10 min

Más: **app móvil para clientes** en `/cliente/[id]` · ahorros en vivo + CO₂ + árboles equivalentes.

---

## 4. Demo en vivo (10 min) · Orden exacto

### (0) Set-up previo
- Terminal 1: `docker ps` (sunhub-pg corriendo)
- Terminal 2: `npm run dev` en http://localhost:3000
- Terminal 3: `npm run ingest -- --once` para fresh data
- Navegador: 3 pestañas pre-cargadas (`/dashboard`, `/cliente/<bavaria-id>`, Copilot)

### (1) `/dashboard` · 1 min
**Narrar:** "Este es el punto de entrada del operador. 8 plantas, 62% online ahora mismo,
2 en riesgo. Reemplaza 6 pestañas de proveedor."
**Mostrar:**
- KPIs (Plantas, Online%, MW ahora, MWh hoy, Alarmas)
- Gráfico generación 24h (actualiza cada 60s)
- Mapa con 8 plantas Colombia

### (2) `/plantas` · 1 min
**Narrar:** "La tabla maestra. Marca el rojo: offline. TR-0204 Olímpica Barranquilla."
**Click** en TR-0201 Tibitó → ver PR, uptime, últimas 50 lecturas, dispositivos.

### (3) `/alarmas` · 1 min
**Narrar:** "Reglas que corren en cada ingesta: offline, low-gen, voltaje, frecuencia, temperatura.
Idempotentes + self-healing."
**Mostrar:** alarmas abiertas, click "Resolver" en una → desaparece.

### (4) `/predicciones` · **2 min** ⭐ DIFERENCIADOR
**Narrar:** "Aquí está la magia. Analizamos 14 días de PR, uptime, voltaje y temperatura.
La heurística detecta señales; MiniMax diagnostica la causa raíz."
**Demo:**
- Seleccionar **TR-0201 Tibitó**
- Click **"✦ Predecir fallas"**
- Esperar ~3 seg → aparece tarjeta:
  - **60% failure · 7 días**
  - **Causa raíz (MiniMax):** "Posible acumulación de suciedad en paneles solares reduciendo eficiencia..."
  - **Próxima acción:** "Programar limpieza inmediata y revisar monitoreo..."

**Cierre:** "Esto no lo ves en Growatt. Esto no lo ves en Huawei. **Esto es SunHub.**"

### (5) `/copilot` · **2 min** ⭐ DIFERENCIADOR
**Narrar:** "El operador no aprende SQL. Pregunta en español."
**Prompts a probar:**
1. `¿Cuáles plantas están en riesgo?`
2. `Dame un resumen del estado de la flota`
3. `¿Qué pasa con la planta TR-0201?`
4. `¿Por qué TR-0204 está offline?` → lee alarmas abiertas
5. `¿Cuánta energía generamos hoy?`

**Cierre:** "Respuesta en ~3 seg con contexto real de la flota en cada mensaje."

### (6) `/reportes` · **2 min** ⭐ DIFERENCIADOR
**Narrar:** "40 min/planta → **<30 seg**. Reemplaza el Excel."
**Demo:**
- Seleccionar TR-0201 Tibitó
- Click "Generar reporte"
- Cronómetro en pantalla: ~11 seg
- **Leer narrativa MiniMax** (3 párrafos ejecutivos):
  - Qué pasó
  - Riesgos detectados
  - Recomendaciones abril
- Click **"⎙ Imprimir / PDF"** → pre-visualización print-ready

**Cierre:** "133 horas/mes recuperadas. Listo para enviar al cliente."

### (7) `/cliente/[bavaria-id]` · 1 min
**Narrar:** "Y esto es lo que ve el CFO de Bavaria en su celular."
**Mostrar:**
- Generación en vivo (kW grandes)
- Ahorro COP del mes
- CO₂ evitado + árboles equivalentes 🌳
- Estado de plantas con badge OK/revisar
- Último reporte (link)

**Cierre:** "Reduce llamadas de soporte + aumenta confianza + justifica el PPA."

### (8) `/clima` + `/costo-beneficio` + `/onboarding` · rápido (30 seg c/u)
- **Clima:** "¿Cuándo hago mantenimiento?" → día con pronóstico bajo
- **Proveedores:** tabla con score real 7d + CAPEX + warranty
- **Onboarding:** wizard 5 pasos → planta nueva reportando

---

## 5. Diferenciadores técnicos (2 min)

1. **Adapter pattern** · 1 canonical reading schema + N adapters (growatt, deye implementados)
2. **Fallback sintético** · readings encriptadas del middleware → generador físico-realista para demo
3. **Rules engine idempotente** · alarmas no se duplican y auto-resuelven
4. **MiniMax-Text-01 grounded** · cada llamada inyecta contexto de flota (top plantas + alarmas abiertas + KPIs)
5. **Next.js 15 + React 19 + Prisma 5** · Server Components para datos reales, client components para interactividad
6. **Open-Meteo** · sin API key, pronóstico 5 días convertido a kWh esperado con PR=0.8

**Stack:** TypeScript · Next.js 15 · PostgreSQL · Prisma · Tailwind · Recharts · Leaflet · MiniMax · Open-Meteo

---

## 6. Impacto de negocio (1 min)

| Métrica | Antes | Con SunHub |
|---|---|---|
| Reportes mensuales | 133 h/mes | **3 h/mes** (–97%) |
| Tiempo para detectar falla | Días | **<15 min** (alarma) o **3–14 días antes** (predicción) |
| Tiempo operador/día en apps | 2 h | **15 min** |
| Onboarding planta nueva | 2 días | **<10 min** |
| Visibilidad cliente | 0 (emails) | App 24/7 |
| Costo licencia/planta/mes | $50 USD × 6 apps | **1 plataforma** |

**ROI conservador:** 200 plantas × 40 min × 12 meses = **1,600 h/año** recuperadas = **~$200 M COP** en eficiencia.

---

## 7. Lo que NO construimos (transparencia)

- Decriptación de payloads AES de Growatt/Deye (necesita key del proveedor) → usamos fallback sintético físico-realista
- Integración real con las otras 4 marcas (huawei, hoymiles, srne, solarman) — adapters son pluggables, faltan credenciales
- Deploy público en Vercel (correrá en localhost durante la demo)

---

## 8. Q&A · respuestas preparadas

**¿Y si MiniMax cae?**
Tenemos fallback en todos los endpoints que usan IA (narrativa, root-cause). El usuario recibe señales heurísticas y acción sugerida aunque la IA no responda.

**¿Cuánto cuesta correr esto?**
Postgres ~$10/mes (Neon/Railway), Vercel free tier o $20/mes pro, MiniMax pay-per-use (~$0.001 por reporte). Total <$50/mes para 200 plantas.

**¿Seguridad?**
API keys en env (nunca en código), PostgreSQL row-level security ready para multi-tenant, HTTPS-only en prod. Hackathon sin OAuth pero arquitectura lo soporta.

**¿Escala a 2,000 plantas?**
Ingest worker es pollable por proveedor paralelo. Readings tabla indexada por `(device_id, ts DESC)`. Cron + queue ya modelados en `src/workers/ingest.ts`.

**¿Por qué MiniMax y no GPT?**
Más barato para español LATAM y cumple con los requisitos del hackathon. Stack fácil de intercambiar (1 archivo `src/lib/minimax.ts`).

---

## 9. Checklist pre-demo

- [ ] Docker Postgres corriendo: `docker ps | grep sunhub-pg`
- [ ] Seed ejecutado: 8 plantas visibles en /dashboard
- [ ] Ingest corrido al menos 14 días: `npm run ingest:backfill`
- [ ] `npm run dev` estable, sin errores en consola
- [ ] Pestañas pre-cargadas: dashboard, copilot, cliente/<bavaria-id>
- [ ] MiniMax key válida (test con un reporte)
- [ ] Micrófono probado, pantalla compartida OK
- [ ] Backup screenshots por si se cae la red

---

## 10. Créditos

**Los Incapaces** · Hackathon TINKU 2026 · `rstriana04` + equipo
Repositorio: `tinku_team_los_incapaces` · branch `main`
