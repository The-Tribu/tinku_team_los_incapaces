[Tinku Hackathon](https://hackathon.thetribu.dev/)

# Equipo `Los Incapaces` · TINKU Hackathon 2026

**El Ritual CreAItivo · Tu vIAje comienza aquí**

[Sitio del evento](https://hackathon.thetribu.dev/) · [Definición del problema](./docs/problem/problema.md) · [Guía técnica](./docs/resources/technical_guide.md) · [Rúbrica de evaluación](./docs/resources/rubrica_participantes.md)

---

## ¡Ey, **Los Incapaces**! 👋

Equipo, este repositorio es el hogar oficial de su proyecto durante **TINKU Hackathon 2026**. Aquí van a versionar el código, documentar las decisiones técnicas y dejar listo el producto para la entrega final.

> Recuerden: durante el evento este repositorio es **privado**. Al cerrar la hackathon lo haremos **público bajo licencia MIT**, para que cualquier persona del ecosistema pueda aprender, reutilizar y construir sobre lo que ustedes crearon. Así fortalecemos la comunidad. 🌱

### Integrantes del equipo

En TINKU cada equipo tiene **3 integrantes**. Ustedes son los **participantes** de **Los Incapaces** — el equipo que representan en este reto. Entre los tres pueden repartirse el trabajo, apoyarse cuando apriete y llegar a la demo con algo que los haga sentir orgullosos; **cada aporte cuenta**.

**Participantes:** Robert Sty Triana Cortes, Duban Andres Monsalve Suarez, John Sebastian Nieto Gil

> **Tengan claros los roles internos desde el minuto 1.** No importa cómo los definan —lo que importa es que cada integrante sepa qué aporta y de qué es responsable. Un equipo con roles claros toma decisiones más rápido y llega mejor a la entrega.

---

## Contexto del evento

**TINKU** es una hackathon de **18 horas** organizada por **The Tribu** y la **Universidad Cooperativa de Colombia**, sede Cartago, en alianza con **Techos Rentables**, **Celsia Internet**, **Cursor**, **MiniMax** y la comunidad local.

El reto de esta edición nace de un problema **real** del ecosistema solar colombiano: cómo unificar la operación de **200+ proyectos solares** con dispositivos de múltiples marcas (Growatt, Huawei, Hoymiles, DeyeCloud, SRNE…) para garantizar el cumplimiento contractual, detectar fallas en menos de 5 minutos y eliminar +130 horas/mes de trabajo manual repetitivo.

> Lean la [definición completa del problema](./docs/problem/problema.md) y el [contexto operacional](./docs/problem/contexto_operacional.md) **antes** de abrir el editor. La frase con la que describan el problema vale más que las próximas 5 horas de código.

---

## Patrocinadores

Gracias a quienes hacen posible TINKU 2026:

### Organizan

- [The Tribu](https://thetribu.dev)
- [Universidad Cooperativa de Colombia](https://www.ucc.edu.co)

### Patrocinador principal

- [Techos Rentables](https://techosrentables.com)
- [Celsia Internet](https://www.celsiainternet.com/)

### Tecnología

- [Cursor](https://cursor.com)
- [MiniMax](https://www.minimax.io/)

### Aliados

- [Persano](https://www.instagram.com/persano.co)
- [Flavors](https://www.instagram.com/coffe_flavors)
- [La 7 Incluyente](https://www.instagram.com/la7incluyentegf)
- [Vinola](https://www.instagram.com/vinolabar/)

---

## Guía para arrancar la hackathon

Aquí está la **línea de meta**, los **principios** y unos pasos sugeridos para las primeras horas. Lo demás —**stack**, **arquitectura**, **cómo se reparten el trabajo** y **qué construyen**— lo deciden ustedes.

### Guarden este README antes de codear

Cuando ya hayan **leído** este archivo, guarden una **copia** de su contenido en [`docs/`](./docs/) (por ejemplo `docs/README_equipo.md`).

**¿Por qué?** El `README.md` de la **raíz** es lo primero que se ve en GitHub y, en la práctica, lo van a **reutilizar** para lo que más importa durante el evento: cómo instalar y ejecutar **su** solución (comandos, variables de entorno, estructura del código, etc.). Ese archivo solo puede cumplir bien **un rol principal** a la vez. Si lo sustituyen por completo sin haber guardado copia, **pierden en un solo cambio** el texto de bienvenida, la lista de **patrocinadores**, los enlaces al **sitio del hackathon** y los atajos a la documentación del reto. **La copia dentro de `docs/`** mantiene todo eso en el repo, versionado y localizable, aunque el README de la raíz pase a ser la "ficha técnica" del proyecto.

### 🏁 Línea de meta

**Obligatorio**

- ✅ Repositorio con `README.md` y licencia **MIT** (este template ya los incluye).
- ✅ Producto **listo para correr** con instrucciones claras de instalación y ejecución (aunque sea solo en local).
- ✅ **Pitch de 5 minutos** preparado.

**Opcional (no obligatorio)**

- 🎨 **Deck con máximo 10 slides**.

> ⏱️ **MUY IMPORTANTE · El pitch son 5 minutos exactos.**
>
> Tenemos **12 equipos** presentando, así que el tiempo está **súper limitado** y lo vamos a respetar estrictamente: **cuando se acaben los 5 minutos, se corta el pitch** —sin importar si iban en la mitad de la demo o en el último slide.
>
> Ensayen con cronómetro **al menos 3 veces** antes del evento. Si su mejor versión dura 5:30, córtenla hasta que quepa en 4:45 y les sobren 15 segundos de margen. **Un pitch bueno que termina a tiempo siempre le gana a uno brillante que se corta.**

### 🧭 Principios

1. **Lean el problema antes de abrir el editor.** La frase que escriban describiendo lo que van a resolver vale más que las próximas 5 horas de código. → [Léelo aquí](./docs/problem/problema.md).
2. **Manténganlo siempre ejecutable.** Desde la primera hora, el proyecto debe arrancar con un solo comando. Si lo rompen, **arreglarlo viene antes que cualquier feature nuevo**.
3. **Vertical sobre horizontal.** Cada integrante debe poder hacer demo de algo que funciona — no de "la parte del backend".
4. **30 minutos es el límite para cualquier bloqueador.** Si algo no cede: cámbienlo, mockéenlo o pidan ayuda a un mentor.
5. **Sepan cómo los van a evaluar.** Lean la [Rúbrica de evaluación](./docs/resources/rubrica_participantes.md) **antes** de empezar a construir — los 6 criterios moldearán cada decisión que tomen.

> Todo lo demás —cómo llegar allá— **es parte de la hackathon**.
>
> Ante la duda: **entreguen algo pequeño que funciona antes que algo grande que no.**

### 🚀 Pasos sugeridos para las primeras 2 horas

1. **Cloná este repo y verifiquen acceso** de todos los integrantes.
2. **Lectura colectiva** del [problema](./docs/problem/problema.md), [contexto operacional](./docs/problem/contexto_operacional.md) y [rúbrica](./docs/resources/rubrica_participantes.md). (≈ 30 min)
3. **Definan en una sola frase** el problema que van a resolver y compártanla con el equipo.
4. **Validen acceso al middleware** con la API key del equipo siguiendo la [Guía técnica](./docs/resources/technical_guide.md).
5. **Acuerden el stack** y dejen un "Hola Mundo" desplegado/corriendo localmente con un solo comando.
6. **Definan rituales rápidos**: stand-ups cada 3 horas, branch principal protegida, mensajes de commit cortos.

---

## Documentación adicional

En [`docs/problem/`](./docs/problem/) está el **enunciado y el contexto** del reto; en [`docs/resources/`](./docs/resources/) están la **rúbrica**, la **guía técnica del middleware** y el **PDF de Cursor**. Juntos son la fuente de verdad: si algo en este README contradice esos archivos, **gana la documentación oficial**.

### Problema y contexto

- 📄 **[problema.md](./docs/problem/problema.md)** — Definición del problema central (problem statement).
- 📄 **[contexto_operacional.md](./docs/problem/contexto_operacional.md)** — Cómo opera Techos Rentables hoy: KPIs, dispositivos, flujos manuales, restricciones.

### Recursos: evaluación, integración y herramientas

- 📄 **[rubrica_participantes.md](./docs/resources/rubrica_participantes.md)** — Los 6 criterios con los que el jurado va a evaluarlos.

#### Integración con proveedores (APIs)

Durante el evento van a consumir datos reales de plantas solares a través del **middleware oficial** (`techos.thetribu.dev`), que ya resuelve la autenticación contra cada proveedor.

- 📄 **[technical_guide.md](./docs/resources/technical_guide.md)** — Guía técnica completa del middleware: URL base, autenticación con API key del equipo, ejemplos en `curl`, JavaScript y Python.

**Proveedores soportados:**


| Proveedor              | Slug      | Documentación oficial                                                                                        |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| **Growatt**            | `growatt` | [Growatt Server API Guide (PDF)](https://growatt.pl/wp-content/uploads/2020/01/Growatt-Server-API-Guide.pdf) |
| **Huawei FusionSolar** | `huawei`  | [Huawei FusionSolar API](https://support.huawei.com/enterprise/en/doc/EDOC1100520173/baf43abb/basic)         |
| **DeyeCloud**          | `deye`    | [Deye Developer Portal](https://developer.deyecloud.com/api)                                                 |


#### Productividad con IA

- 📄 **[Cursor Cheat Sheet — Hack Cartago (PDF)](./docs/resources/cursor_cheat_sheet_hack_cartago.pdf)** — Atajos, prompts y patrones para sacarle el máximo provecho a Cursor durante la hackathon.

---

## Licencia

Este proyecto se distribuye bajo la licencia **MIT**. Ver [`LICENSE`](./LICENSE).

> Durante el evento el repositorio es privado. Al cerrar la hackathon será público y cualquier persona del ecosistema podrá usarlo, modificarlo y aprender de él. Así crece la comunidad. 🌱

---

Hecho con 💛 por **[TINKU Hackathon 2026](https://hackathon.thetribu.dev/)**.
