# Guía Técnica · Tinku Hackathon

Esta **guía técnica** explica cómo tu equipo puede consumir los datos de las plantas solares a través del middleware oficial del evento.

---

## 1. ¿Qué es este servidor y por qué existe?

Durante el hackathon vas a trabajar con datos reales de varios proveedores de plantas solares (DeyeCloud, Huawei FusionSolar y Growatt). Cada uno de ellos expone su propia API, y **todas requieren protocolos de autenticación distintos y relativamente complejos**: tokens Bearer JWT que expiran cada 60 días, tokens XSRF que caducan por inactividad en 30 minutos, sesiones con usuario/contraseña, credenciales hasheadas con SHA-256, etc.

Para que puedas enfocarte en construir tu solución y no en pelear contra cada proveedor, los organizadores montamos un **servidor intermediario (middleware)** que:

- Garantiza la disponibilidad de los datos de los proveedores.
- Centraliza y administra los protocolos de seguridad de cada API.
- Renueva automáticamente los tokens de cada proveedor (tu equipo nunca verá un 401 por expiración).
- Inyecta las credenciales correctas en cada request que envíes.
- Valida que la petición venga de un equipo autorizado mediante la **API key única** que se le entregó a cada equipo.

En resumen: **tú hablas con el middleware; el middleware habla con los proveedores**.

```
Tu equipo  ──►  techos.thetribu.dev  ──►  API del proveedor (DeyeCloud, Huawei, Growatt, …)
```

---

## 2. URL base

Todas las peticiones deben apuntar a:

```
https://techos.thetribu.dev
```

No necesitas configurar nada más. El servidor está desplegado y listo.

---

## 3. Estructura de la URL

La URL sigue siempre este patrón:

```
https://techos.thetribu.dev/<proveedor>/<ruta-del-proveedor>?<query-params>
```

Donde:

| Segmento | Qué es | Quién lo define |
|---|---|---|
| `<proveedor>` | Slug del proveedor al que quieres consultar (`deye`, `huawei`, `growatt`). | Lo define el middleware. |
| `<ruta-del-proveedor>` | La ruta **tal cual** la documenta cada proveedor. | **La define el proveedor.** |
| `<query-params>` | Parámetros de consulta que el endpoint del proveedor requiera. | **Los define el proveedor.** |

> **Muy importante:** todo lo que va **después** del slug del proveedor (la ruta y los parámetros) **depende directamente de la API del proveedor**, no del middleware. El middleware solo reenvía. Esto significa que, para saber qué endpoints existen, qué parámetros recibir y qué formato tiene la respuesta, debes consultar la documentación oficial de cada proveedor (ver sección 6).

### Ejemplo de reescritura

Si en la documentación de DeyeCloud ves este endpoint:

```
POST https://api.deyecloud.com/v1.0/device/list
```

Tú lo consumes a través del middleware así:

```
POST https://techos.thetribu.dev/deye/v1.0/device/list
```

El middleware automáticamente:
1. Valida tu API key de equipo.
2. Inyecta el token de DeyeCloud fresco.
3. Reenvía la petición al host real de Deye.
4. Te devuelve la respuesta del proveedor sin modificarla.

---

## 4. Autenticación del equipo

Cada equipo recibe **una única API key** con el formato `tk_xxxxxxxx...`. Esta key está incluida en el **kit de bienvenida** que fue entregaron al inicio del hackathon, en forma de **código QR**: al escanearlo obtienes la key asignada exclusivamente a tu equipo.

> **Importante:** hay **una sola API key por equipo**. Todos los integrantes deben usar la misma; no se entregan keys individuales.

Debes enviarla en **todas** las peticiones en el header `Authorization`:

```
Authorization: tk_xee3qLXzHwOy5d7zUWy0UIcurrfDsNbc
```

> La API key es de uso exclusivo de tu equipo. No la compartas con otros equipos, no la subas a repositorios públicos ni la expongas en el frontend de tu aplicación. Si pierdes el kit de bienvenida o el QR, contacta a los organizadores.

### Errores comunes de autenticación

| Código | Causa |
|---|---|
| `401 Unauthorized` | Falta el header `Authorization` o la key es inválida. |
| `404 Not Found` | El slug del proveedor no existe. Revisa la lista en la sección 5. |
| `405 Method Not Allowed` | Se usó un método HTTP no permitido. El middleware solo permite `GET` para todos los proveedores, y adicionalmente `POST` para `/deye/*` y `/huawei/*`. |

---

## 5. Proveedores disponibles

| Proveedor | Slug | Métodos | Protocolo de auth (manejado por el middleware) |
|---|---|---|---|
| DeyeCloud | `deye` | `GET`, `POST` | Bearer JWT (60 días) |
| Huawei FusionSolar | `huawei` | `GET`, `POST` | XSRF-TOKEN (30 min inactividad) |
| Growatt | `growatt` | `GET` | Token de sesión |

Los equipos **no necesitan preocuparse por los tokens** de los proveedores: el middleware los renueva solo.

---

## 6. Documentación oficial de cada proveedor

Como la ruta y los parámetros dependen de cada proveedor, consulta siempre su documentación oficial:

- **DeyeCloud** · https://developer.deyecloud.com/api
- **Huawei FusionSolar** · https://support.huawei.com/enterprise/en/doc/EDOC1100520173/baf43abb/basic
- **Growatt** · https://growatt.pl/wp-content/uploads/2020/01/Growatt-Server-API-Guide.pdf

---

## 7. Ejemplos prácticos con `curl`

> Reemplaza `tk_TU_API_KEY` por la key que le entregaron a tu equipo.

### DeyeCloud · listar dispositivos (POST)

```bash
curl -X POST \
  -H "Authorization: tk_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"page": 1, "size": 10}' \
  "https://techos.thetribu.dev/deye/v1.0/device/list"
```

### Huawei FusionSolar · listar plantas (POST)

```bash
curl -X POST \
  -H "Authorization: tk_TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "https://techos.thetribu.dev/huawei/thirdData/getStationList"
```

### Growatt · lista de plantas (GET)

```bash
curl -H "Authorization: tk_TU_API_KEY" \
  "https://techos.thetribu.dev/growatt/v1/plant/list"
```

---

## 8. Ejemplo en JavaScript (fetch)

```javascript
const API_KEY = "tk_TU_API_KEY";
const BASE_URL = "https://techos.thetribu.dev";

async function getHuaweiStations() {
  const response = await fetch(`${BASE_URL}/huawei/thirdData/getStationList`, {
    method: "POST",
    headers: {
      "Authorization": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
```

---

## 9. Ejemplo en Python (requests)

```python
import requests

API_KEY = "tk_TU_API_KEY"
BASE_URL = "https://techos.thetribu.dev"

headers = {"Authorization": API_KEY}

resp = requests.post(
    f"{BASE_URL}/huawei/thirdData/getStationList",
    headers={**headers, "Content-Type": "application/json"},
    json={},
    timeout=30,
)
resp.raise_for_status()
print(resp.json())
```

---

## 10. Buenas prácticas

1. **Cachea respuestas** del lado de tu aplicación cuando sea posible; las APIs de proveedores pueden ser lentas.
2. **Maneja timeouts**: usa un timeout razonable (15–30 s) en tus clientes HTTP.
3. **No hardcodees la API key** en código público; usa variables de entorno.
4. **Lee la doc del proveedor** antes de probar endpoints a ciegas: muchos errores `400/500` vienen de payloads mal formados del lado del proveedor, no del middleware.
5. Si recibes un `502` o `503`, reintenta con backoff exponencial: puede ser un problema temporal del proveedor.

---

## 11. Soporte

Si algo falla y crees que es un problema del middleware (no del proveedor), contacta al equipo de organización del hackathon con:

- El nombre de tu equipo.
- La URL completa que invocaste.
- El código y cuerpo de la respuesta que recibiste.
- La hora aproximada del incidente.
