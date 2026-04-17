# **Definición del Problema (Problem Statement)**

## **Contexto**
Techos Rentables gestiona más de 200 proyectos de generación solar con compromisos contractuales específicos que incluyen:
- Energía ahorrada (kWh)
- Dinero ahorrado
- Disponibilidad del sistema (Uptime)
- Performance Ratio (PR)
- Mitigación de toneladas de CO₂

Cada proyecto utiliza equipos de diferentes marcas (Hoymiles, Growatt, SRNE, Huawei, entre otras), y cada marca tiene su propia plataforma de monitoreo. 

**Para contexto:** Los **inversores** y **microinversores** son dispositivos hardware que convierten la energía solar (corriente directa) en energía utilizable para la red eléctrica (corriente alterna). Piensa en ellos como "dispositivos IoT" o "sensores inteligentes" que:
- Generan datos de rendimiento en tiempo real (energía producida, voltaje, temperatura, estado)
- Tienen identificadores únicos
- Se conectan a plataformas de monitoreo de sus fabricantes

La diferencia principal es la escala: un **inversor** centraliza varios paneles solares (típicamente 10-50 paneles por inversor), mientras que un **microinversor** se instala en cada panel solar individual. Por eso un cliente puede tener desde 2-3 inversores hasta más de 10 microinversores.

---

## **El Problema Central**

**Techos Rentables no puede garantizar el cumplimiento oportuno de sus compromisos contractuales porque el estado operativo de cientos de equipos distribuidos en múltiples plataformas heterogéneas no puede ser supervisado con la oportunidad requerida, resultando en ineficiencia operativa extrema y fragmentación de la información crítica.**

---

## **Manifestaciones del problema:**

1. **Ineficiencia operativa extrema:**
   - Generar un informe mensual para un cliente toma ~40 minutos
   - Con 200+ clientes → **más de 130 horas/persona al mes** en trabajo manual repetitivo
   - Proceso propenso a errores de transcripción y omisión de equipos

2. **Riesgo contractual y financiero:**
   - Existen **penalizaciones económicas** si la generación o disponibilidad cae por debajo de lo pactado
   - La detección tardía de fallas genera **lucro cesante** para Techos Rentables
   - Cada contrato tiene umbrales de rendimiento y tarifas de liquidación específicas que deben validarse

3. **Ceguera operativa:**
   - La supervisión manual hace **imposible detectar fallas en tiempo real** a escala (200+ clientes, cientos de microinversores)
   - Equipos individuales pueden fallar y "perderse de vista" por días o semanas
   - Los datos que se reportan ya están **desactualizados** al momento de entregarse

4. **Imposibilidad de respuesta proactiva:**
   - **No existe capacidad** de detectar una falla en menos de 5 minutos (requisito crítico actual)
   - Clientes corporativos exigen acceso constante a tableros con datos de alta resolución, pero Techos Rentables no puede proveerlos de forma consolidada

5. **Fragmentación de fuentes de verdad:**
   - Cada marca tiene su propia plataforma → **es inviable** entrar a cientos de cuentas manualmente
   - No existe una **vista unificada** del estado de toda la operación
   - Imposibilidad de comparar rendimiento entre equipos de diferentes marcas bajo un estándar común

---

## **Impacto medible del problema:**

- ⏱️ **130+ horas/mes** de trabajo manual repetitivo
- 💸 **Riesgo de penalizaciones** contractuales por incumplimiento no detectado
- 📉 **Fricción con clientes** por errores en validación de ahorros
- ⚠️ **Fallas no detectadas** que generan pérdida de ingresos y afectan la reputación
- 🚫 **Imposibilidad de escalar** el negocio sin multiplicar proporcionalmente el personal operativo

---

## **Contexto técnico y restricciones del entorno:**

- Los sistemas utilizados incluyen marcas como Hoymiles, Growatt, SRNE, Huawei, entre otras
- La detección oportuna de fallas requiere **visibilidad del estado operativo en intervalos no mayores a 5 minutos**
- Techos Rentables continúa incorporando nuevos proyectos con equipos de diversas marcas
- Los compromisos contractuales requieren **validación tanto en tiempo real como retrospectiva** (auditorías de cumplimiento mensual/anual)
- La operación actual depende de acceso manual a múltiples plataformas de monitoreo de diferentes fabricantes

---

# **Pregunta clave para los equipos participantes:**

**¿Cómo podría Techos Rentables garantizar el cumplimiento oportuno de sus compromisos contractuales con 200+ clientes, detectar fallas operativas en menos de 5 minutos, y eliminar el trabajo manual repetitivo de 130+ horas/mes, cuando la información crítica está fragmentada en múltiples plataformas de diferentes fabricantes?**