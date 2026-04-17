# CONTEXTO OPERACIONAL DE TECHOS RENTABLES

## 1. Modelo de Negocio

Techos Rentables es una empresa especializada en la instalación de sistemas de generación de energía solar para clientes comerciales e industriales. Su modelo de negocio se basa en permitir que los clientes generen su propia energía eléctrica a través de "granjas" o "plantas solares", reduciendo significativamente sus facturas de energía y contribuyendo a la sostenibilidad ambiental.

### Escala de Operación

- **Más de 200 proyectos activos** de generación solar distribuidos en diferentes ubicaciones
- Cada cliente puede tener una o más plantas solares
- Cada planta solar está compuesta por múltiples dispositivos (inversores o microinversores)
- Cientos de dispositivos totales bajo supervisión

### Compromisos Contractuales

Techos Rentables establece compromisos contractuales específicos con cada cliente que incluyen:

- **Energía ahorrada (kWh)**: Cantidad mínima de energía que debe generar el sistema
- **Dinero ahorrado**: Reducción económica en las facturas de electricidad
- **Disponibilidad del sistema (Uptime)**: Porcentaje de tiempo que el sistema debe estar operativo
- **Performance Ratio (PR)**: Relación entre la energía real generada vs. la teórica
- **Mitigación de CO₂**: Toneladas de dióxido de carbono que se dejan de emitir

Estos compromisos contractuales implican que Techos Rentables debe monitorear constantemente el desempeño de cada instalación para garantizar su cumplimiento.

---

## 2. Infraestructura Tecnológica

### 2.1 Dispositivos: Inversores y Microinversores

Los sistemas solares utilizan dos tipos principales de dispositivos hardware que convierten la energía solar (corriente directa) en energía utilizable para la red eléctrica (corriente alterna):

**Inversores centralizados**:
- Consolidan la energía de múltiples paneles solares
- Típicamente 10-50 paneles conectados a un solo inversor
- Un cliente puede tener 2-3 inversores en su instalación

**Microinversores**:
- Se instala un microinversor en cada panel solar individual
- Mayor granularidad de monitoreo (panel por panel)
- Un cliente puede tener más de 10 microinversores en su planta

Ambos tipos de dispositivos funcionan como "sensores inteligentes" que:
- Generan datos de rendimiento en tiempo real
- Tienen identificadores únicos
- Se conectan a plataformas de monitoreo de sus fabricantes

### 2.2 Marcas de Dispositivos Utilizadas

Techos Rentables trabaja con dispositivos de múltiples fabricantes:

- **Growatt**
- **Hoymiles**
- **Huawei** (FusionSolar)
- **SolarMan**
- **DeyeCloud**
- **SRNE**

**¿Por qué diferentes marcas?**

En un escenario ideal, la selección de dispositivos se basaría en:
- Optimización del presupuesto según cada proyecto
- Disponibilidad de inventario del proveedor
- Especificaciones técnicas requeridas para cada instalación
- Relación costo-beneficio específica del proyecto

Sin embargo, en la práctica actual, Techos Rentables enfrenta restricciones que limitan esta flexibilidad (ver Sección 3.1).

### 2.3 Plataformas de Monitoreo

Cada fabricante de dispositivos provee su propia plataforma de monitoreo propietaria:

| Marca | Plataforma de Monitoreo | Tipo de Acceso |
|-------|------------------------|----------------|
| Growatt | Growatt Server / ShinePhone App | Web + Móvil |
| Hoymiles | S-Miles Cloud | Web + Móvil |
| Huawei | FusionSolar | Web + Móvil |
| SolarMan | SolarMan Smart | Web + Móvil |
| DeyeCloud | Deye Cloud | Web + Móvil |
| SRNE | SRNE Solar | Web + Móvil |

**Fragmentación de datos**:

Cada plataforma es un sistema cerrado e independiente:
- Formatos de datos diferentes
- Nomenclatura de métricas diferente (ej: "Power Output" vs "Potencia AC" vs "AC Power")
- Granularidad temporal distinta
- Interfaces de usuario completamente diferentes
- APIs propietarias (cuando existen)

**Ejemplo de fragmentación**:  
Si un cliente tiene una instalación con:
- 3 inversores Growatt
- 2 inversores Huawei
- 5 microinversores Hoymiles

Techos Rentables debe acceder a **3 plataformas diferentes** para obtener la información completa de ese único cliente.

---

## 3. Proceso Operacional Actual

### 3.1 Instalación y Configuración

**Presión del cliente**:  
Los clientes corporativos esperan poder monitorizar toda su planta solar desde una única aplicación móvil o plataforma web. La experiencia de usuario ideal para el cliente es:  
_"Abro la app de [Marca X] y veo todos mis paneles, toda mi producción de energía, todo consolidado en un solo lugar"_.

**Solución actual de Techos Rentables**:  
Para satisfacer esta expectativa, Techos Rentables se ve obligado a utilizar dispositivos de la **misma marca** en cada instalación de cliente. Esto garantiza que todos los dispositivos de ese cliente se puedan visualizar en una sola plataforma.

**Consecuencia negativa: Restricción Comercial**

Esta estrategia genera limitaciones importantes:

- **Imposibilidad de optimizar costos**: No pueden mezclar marcas según la relación costo-beneficio específica de cada componente
  - Ejemplo: Si para un proyecto los inversores Growatt son técnicamente superiores pero los microinversores Huawei son más económicos, no pueden combinarlos
- **Dependencia de proveedores**: Si una marca tiene problemas de stock o disponibilidad, puede retrasar todo el proyecto
- **Menor competitividad comercial**: Los presupuestos de instalación no están optimizados, afectando el precio final para el cliente
- **Rigidez operativa**: Cada proyecto queda "encerrado" en el ecosistema de un solo fabricante

### 3.2 Monitoreo Continuo

**Alcance de la operación**:
- Techos Rentables debe supervisar **200+ proyectos simultáneamente**
- Cada proyecto puede tener entre 2-3 inversores o más de 10 microinversores
- En total, **cientos de dispositivos** distribuidos en diferentes ubicaciones geográficas

**Proceso de monitoreo actual**:
- Acceso **manual** a múltiples plataformas web de diferentes fabricantes
- Inicio de sesión individual en cada plataforma
- Navegación manual por cada cuenta de cliente
- Revisión uno por uno de los dispositivos

**Limitaciones del proceso**:
- **Imposibilidad de vista consolidada**: No existe un dashboard que muestre el estado de toda la operación
- **No se puede comparar entre marcas**: Evaluar el rendimiento de un inversor Growatt vs. un Huawei requiere análisis manual
- **Supervisión reactiva, no proactiva**: Es imposible monitorear 200+ proyectos en tiempo real
- **Escalabilidad nula**: Cada cliente nuevo = más tiempo de supervisión manual

### 3.3 Generación de Reportes

**Tipos de reportes**:

1. **Reportes mensuales para clientes**:
   - Validación de cumplimiento de compromisos contractuales
   - Datos de generación de energía (kWh)
   - Cálculo de ahorros económicos
   - Métricas de rendimiento del sistema (PR, uptime)
   - Datos ambientales (CO₂ mitigado)

2. **Reportes ad-hoc para equipo comercial**:
   - Performance de instalaciones existentes
   - Casos de éxito y testimoniales con datos
   - Información para propuestas comerciales
   - Benchmarking entre proyectos

**Proceso manual actual**:

1. Ingresar a la plataforma del fabricante correspondiente
2. Seleccionar el proyecto/cliente
3. Navegar por cada dispositivo individualmente
4. Exportar datos (cuando la plataforma lo permite) o copiar manualmente
5. Consolidar información en hojas de cálculo
6. Calcular métricas derivadas (ahorros, PR, CO₂)
7. Generar visualizaciones y reportes en formato presentable
8. Repetir para cada cliente

**Métricas del esfuerzo**:
- **Tiempo por reporte**: ~40 minutos por cliente
- **Volumen**: 200+ clientes
- **Costo operativo**: **130+ horas/persona al mes** en trabajo repetitivo
- **Riesgo de errores**: Alta probabilidad de errores de transcripción, omisión de dispositivos, cálculos incorrectos

**Audiencias y necesidades**:
- **Clientes**: Requieren reportes precisos para auditorías, validación de ROI, reportes de sostenibilidad corporativa
- **Equipo comercial**: Necesita datos actualizados para propuestas, renovaciones, expansiones de proyectos

---

## 4. Limitaciones del Proceso Actual

### 4.1 Fragmentación de Información

**Problema**: Los datos críticos del negocio están distribuidos en 5+ plataformas propietarias diferentes.

**Manifestaciones**:
- No existe un "single source of truth" del estado operativo de Techos Rentables
- Cada plataforma tiene su propio formato de datos
- La granularidad temporal varía entre plataformas (algunas actualizan cada 5 min, otras cada 15 min)
- No existe vista unificada del portafolio completo
- Imposible hacer análisis consolidados sin consolidación manual previa

**Impacto**: Toma de decisiones basada en información fragmentada e incompleta.

### 4.2 Trabajo Manual Ineficiente

**Problema**: 130+ horas/mes de trabajo humano en tareas repetitivas de extracción y consolidación de datos.

**Manifestaciones**:
- Personal técnico dedicando tiempo a tareas operativas en lugar de estratégicas
- Proceso totalmente manual, sin automatización
- Alta probabilidad de errores humanos en transcripción de datos
- Proceso no escalable: cada nuevo cliente incrementa proporcionalmente el trabajo manual
- Dependencia de personal específico que "sabe cómo sacar los datos"

**Impacto**: Costos operativos elevados, riesgo de errores contractuales, imposibilidad de escalar el negocio.

### 4.3 Imposibilidad de Análisis Avanzado

**Problema**: La fragmentación de datos impide análisis que generen valor agregado.

**Oportunidades perdidas**:

- **Huella de Carbono consolidada**:
  - Difícil calcular el impacto ambiental total de todos los proyectos
  - No pueden generar reportes de sostenibilidad corporativa robustos
  - Pierden oportunidades de certificaciones ambientales

- **Benchmarking entre instalaciones**:
  - No pueden comparar eficiencia entre proyectos de forma sistemática
  - Dificultan identificar "mejores prácticas" replicables
  - No pueden identificar instalaciones de bajo rendimiento para mejora

- **Análisis de tendencias históricas**:
  - Obtener datos históricos consolidados es tortuoso
  - Análisis de estacionalidad o patrones de generación requiere trabajo manual extremo
  - Dificulta proyecciones de crecimiento o expansión

- **Proyecciones de ahorros futuros**:
  - No hay forma eficiente de modelar ahorros futuros basados en data histórica
  - Dificulta propuestas comerciales basadas en datos sólidos

**Impacto**: Subutilización del valor de los datos, pérdida de oportunidades comerciales y estratégicas.

### 4.4 Falta de Proactividad y Gestión de Alarmas

**Problema**: No existe un sistema de alarmas consolidado que permita detectar y anticipar fallas operativas.

**Situación actual**:
- Cada plataforma de fabricante tiene su propio sistema de alertas (inconsistente entre marcas)
- Las alarmas llegan por correo o notificaciones push de apps diferentes
- No hay consolidación de alarmas en un único sistema
- **Imposibilidad de detectar fallas en menos de 5 minutos a escala de 200+ proyectos**

**Consecuencias**:
- **Respuesta reactiva**: Techos Rentables se entera de problemas cuando:
  - El cliente reporta un problema directamente
  - Se detecta en la revisión mensual manual (demasiado tarde)
- **Pérdida de ingresos**: Dispositivos que fallan y permanecen inactivos por días/semanas sin detección
- **Riesgo contractual**: Incumplimiento de SLAs de disponibilidad (uptime) genera penalizaciones económicas
- **Experiencia del cliente deteriorada**: Cliente percibe falta de monitoreo proactivo

**Requisito no cumplido**:  
El negocio actual de Techos Rentables requiere detectar fallas operativas en **menos de 5 minutos**. Con el proceso manual actual, esto es **imposible** a escala de 200+ proyectos.

**Oportunidades perdidas de proactividad**:
- Alertas predictivas antes de que un dispositivo falle completamente
- Notificaciones de degradación gradual de rendimiento
- Alarmas de umbrales personalizados por cliente según contrato
- Sistema de escalamiento automático de incidencias

### 4.5 Restricción Comercial y Competitividad

**Problema**: La obligación de homogeneizar instalaciones con una sola marca limita la competitividad comercial.

**Manifestaciones**:
- **Costos de instalación menos optimizados**: No pueden seleccionar "lo mejor de cada marca" para cada componente
- **Dependencia de stock de proveedores**: Un problema de inventario de una marca puede paralizar un proyecto completo
- **Menor flexibilidad en negociación**: Menor poder de negociación con proveedores al estar "atados" a una sola marca por proyecto
- **Limitaciones técnicas**: Si una marca no tiene un producto específico que el proyecto requiere, deben adaptar el diseño en lugar de elegir el mejor del mercado

**Impacto**: Menor margen de ganancia, proyectos más costosos para clientes, menor competitividad frente a otros instaladores solares.

---

## 5. KPIs Monitorizados

Techos Rentables monitoriza los siguientes indicadores clave de desempeño (KPIs) para cada dispositivo de cada cliente. Con **200+ clientes** y **múltiples dispositivos por cliente** (en total, cientos de inversores y microinversores), el volumen de datos generado es masivo.

### Tabla de KPIs por Dispositivo

| KPI | Frecuencia de Captura | Unidad | Rango Normal | Propósito de Negocio |
|-----|----------------------|--------|--------------|---------------------|
| **Generación de energía** | Cada 10 minutos | kWh (kilovatios-hora) | Depende de instalación, hora del día, clima | **CRÍTICO**: Validar compromisos contractuales de energía ahorrada. Es la base para calcular el dinero ahorrado al cliente y validar el ROI del proyecto. |
| **Voltaje de salida** | Tiempo real | Voltios (V) | ~120V o ~220V (según instalación) | Detectar problemas eléctricos en el sistema. Voltajes fuera de rango indican fallas en inversores o problemas de conexión a red. Asegurar compatibilidad con la red eléctrica del cliente. |
| **Corriente de salida** | Tiempo real | Amperios (A) | Depende de carga del sistema | Monitorear la carga del sistema. Corrientes anormalmente altas indican sobrecargas; corrientes bajas pueden indicar fallas parciales o suciedad en paneles. |
| **Frecuencia** | Tiempo real | Hertz (Hz) | 60 Hz (estándar Colombia) | **CRÍTICO**: Indicador de calidad de energía. Debe mantenerse estable en 60Hz. Desviaciones significativas pueden dañar equipos del cliente y violan regulaciones eléctricas. |
| **Factor de potencia** | Tiempo real | Valor decimal | -1 a +1 (óptimo cerca de 1) | Mide la eficiencia del sistema. Un factor de potencia bajo indica energía reactiva desperdiciada, lo que reduce el ahorro real del cliente. |
| **Estado operativo** | Tiempo real | Enum (Online/Offline/Error) | Online | Disponibilidad del sistema (uptime). **CRÍTICO** para cumplir compromisos contractuales de disponibilidad. Dispositivos offline afectan directamente el cumplimiento de SLAs. |

### Alarmas y Umbrales

**Configuración de alarmas críticas**:

- **Frecuencia fuera de rango**: Alarma si la frecuencia desvía más del 10% del estándar (54-66 Hz)
  - Razón: Protección de equipos del cliente y cumplimiento regulatorio
  
- **Generación anormalmente baja**: Alarma si la generación cae más del 20% del promedio histórico para condiciones climáticas similares
  - Razón: Posible falla de dispositivo, suciedad en paneles, sombreado

- **Dispositivos offline**: Alarma inmediata cuando un dispositivo pierde conexión
  - Razón: Impacta directamente el uptime contractual y genera pérdida de ingresos

- **Voltaje fuera de especificación**: Alarma si el voltaje sale del rango aceptable ±10%
  - Razón: Riesgo de daño a equipos y problemas de conexión a red

### Consideraciones Especiales

**Multi-cliente**:  
Los mismos KPIs se monitorean para todos los clientes, pero los umbrales de alarma y los compromisos contractuales varían según cada contrato específico.

**Multi-dispositivo**:  
Cada inversor y microinversor genera su propio flujo de datos (stream) independiente. Para una instalación con 10 dispositivos, se generan 10 streams paralelos de datos.

**Multi-plataforma (nomenclatura inconsistente)**:  
El mismo KPI puede tener nombres diferentes en cada plataforma:

| KPI | Growatt | Huawei FusionSolar | Hoymiles | SolarMan |
|-----|---------|-------------------|----------|----------|
| Generación de energía | "Power Output" | "Potencia AC" | "AC Power" | "Output Power" |
| Voltaje | "Output Voltage" | "Voltaje de Red" | "Grid Voltage" | "AC Voltage" |
| Frecuencia | "Frequency" | "Frecuencia de Red" | "Grid Freq" | "Grid Frequency" |

Esta inconsistencia complica aún más la consolidación manual de datos y requiere "traducción" constante entre nomenclaturas.

---

## Resumen

El contexto operacional de Techos Rentables revela una empresa en crecimiento (200+ proyectos) que enfrenta limitaciones operativas significativas derivadas de:

1. **Fragmentación tecnológica**: Múltiples marcas de dispositivos, múltiples plataformas propietarias
2. **Restricción autoimpuesta**: Obligación de homogeneizar instalaciones por presión del cliente
3. **Trabajo manual masivo**: 130+ horas/mes en tareas repetitivas
4. **Falta de proactividad**: Imposibilidad de detectar fallas en tiempo real a escala
5. **Subutilización de datos**: Datos valiosos atrapados en silos propietarios

Estas limitaciones no solo generan costos operativos elevados y riesgos contractuales, sino que también **limitan la competitividad comercial** de Techos Rentables al impedir la optimización de costos en instalaciones y la escalabilidad del negocio sin crecimiento proporcional del personal operativo.
