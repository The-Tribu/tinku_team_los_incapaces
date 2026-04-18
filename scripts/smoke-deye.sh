#!/usr/bin/env bash
# =============================================================================
# Deye API — Smoke test (18 endpoints de lectura)
# =============================================================================
#
# Script para que los equipos verifiquen rápidamente que la API está arriba y
# que su API key tiene acceso correcto a todos los endpoints documentados.
#
# REQUISITO: necesitas tu API key de equipo (formato tk_…). Por seguridad la
#            key NO viene hardcodeada en el archivo — se pasa por variable de
#            entorno TEAM_KEY antes de ejecutar el script.
#
# Uso (macOS / Linux):
#
#   export TEAM_KEY="tk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
#   bash deye/smoke_test.sh
#
# En una sola línea:
#
#   TEAM_KEY="tk_XXX..." bash deye/smoke_test.sh
#
# Opcionalmente puedes sobreescribir STATION_ID / DEVICE_SN por env var si
# quieres probar con otra planta/inversor diferente a los por defecto:
#
#   TEAM_KEY="tk_XXX..." STATION_ID=122825 DEVICE_SN="2503293234" \
#     bash /deye/smoke_test.sh
#
# Salida esperada al final del run:
#   - 15 endpoints con code 1000000 (success)
#   - 2  endpoints con code 2106001 (config/battery y config/system en este
#        inversor específico — "config point not supported"; es reachable OK)
#   - 1  endpoint  con code 2101043 (order/0 — orderId inválido; es reachable OK)
#   - 1  endpoint  con code 2101019 (device/list — quirk upstream conocido;
#        usa station/listWithDevice en su lugar)
#
# Si ves HTTP 401 -> revisa tu TEAM_KEY.
# Si ves HTTP 429 -> rate limit, espera y reintenta (ver README § Rate limiting).
# Si ves HTTP 5xx -> reporta a los organizadores con el requestId.
# =============================================================================
set -u

BASE="${DEYE_BASE_URL:-https://techos.thetribu.dev/deye}"

# --- Validación de TEAM_KEY --------------------------------------------------
if [ -z "${TEAM_KEY:-}" ]; then
  echo "ERROR: falta la variable de entorno TEAM_KEY." >&2
  echo "       Ejemplo: export TEAM_KEY=\"tk_XXXXXXXX...\" && bash $0" >&2
  exit 1
fi
case "$TEAM_KEY" in
  tk_*) : ;;
  *) echo "ERROR: TEAM_KEY debe empezar con 'tk_' (valor recibido: ${TEAM_KEY:0:6}…)." >&2
     exit 1 ;;
esac

KEY="$TEAM_KEY"

# IDs por defecto. Para descubrirlos dinámicamente ver /deye/02-station.md
STATION_ID="${STATION_ID:-40760}"
DEVICE_SN="${DEVICE_SN:-2402010117}"

# --- Cálculo de ventanas de tiempo -------------------------------------------
NOW_S=$(date +%s)
DAY_AGO_S=$(( NOW_S - 86400 ))
TODAY=$(date -u +%Y-%m-%d)

# 'date' de GNU (Linux) usa '-d "yesterday"'; 'date' de BSD (macOS) usa '-v-1d'.
# Intentamos ambos para que el script sea portable.
if YESTERDAY=$(date -u -v-1d +%Y-%m-%d 2>/dev/null); then
  :
elif YESTERDAY=$(date -u -d "yesterday" +%Y-%m-%d 2>/dev/null); then
  :
else
  echo "ERROR: no pude calcular la fecha de ayer con este 'date'." >&2
  exit 1
fi

# Archivo temporal de respuestas (se limpia al salir).
RESP_FILE=$(mktemp -t deye_resp.XXXXXX)
trap 'rm -f "$RESP_FILE"' EXIT

# --- Contadores --------------------------------------------------------------
PASS=0
WARN=0
FAIL=0

run() {
  local label="$1" method="$2" path="$3" body="${4:-}"
  local http_code curl_rc

  printf '=== %-4s %-4s %s ===\n' "$label" "$method" "$path"

  if [ "$method" = "GET" ]; then
    http_code=$(curl -sS --http1.1 -o "$RESP_FILE" -w "%{http_code}" \
      "$BASE$path" -H "Authorization: $KEY" 2>&1) || curl_rc=$?
  else
    http_code=$(curl -sS --http1.1 -o "$RESP_FILE" -w "%{http_code}" \
      -X "$method" "$BASE$path" \
      -H "Authorization: $KEY" -H "Content-Type: application/json" \
      -d "$body" 2>&1) || curl_rc=$?
  fi

  # Si curl falló (curl_rc != 0 y no hay HTTP code válido), reporta y sigue.
  if ! [[ "$http_code" =~ ^[0-9]{3}$ ]]; then
    echo "     curl error: $http_code"
    FAIL=$(( FAIL + 1 ))
    echo
    return
  fi

  # Extrae el 'code' de la respuesta JSON (sin jq, con grep/sed).
  local upstream_code
  upstream_code=$(grep -o '"code":"[^"]*"' "$RESP_FILE" | head -n1 | sed 's/.*"code":"//;s/"$//')
  [ -z "$upstream_code" ] && upstream_code="n/a"

  printf '     HTTP %s · code=%s\n' "$http_code" "$upstream_code"
  # Imprime las primeras 500 chars del body para inspección humana.
  head -c 500 "$RESP_FILE"; echo

  # Clasifica el resultado.
  if [ "$http_code" = "200" ] && [ "$upstream_code" = "1000000" ]; then
    PASS=$(( PASS + 1 ))
  elif [ "$http_code" = "200" ]; then
    # HTTP 200 con code de dominio (2101006, 2106001, etc.) = reachable,
    # la API funciona y respondió — solo el upstream rechazó parámetros o similar.
    WARN=$(( WARN + 1 ))
  else
    FAIL=$(( FAIL + 1 ))
  fi
  echo
}

# --- Banner ------------------------------------------------------------------
echo "### Deye smoke-test"
echo "### base URL:    $BASE"
echo "### API key:     ${KEY:0:6}…${KEY: -4}   (enmascarada; completa en \$TEAM_KEY)"
echo "### stationId:   $STATION_ID"
echo "### deviceSn:    $DEVICE_SN"
echo "### window:      $YESTERDAY → $TODAY   ($DAY_AGO_S → $NOW_S seconds)"
echo

# --- 1. Account --------------------------------------------------------------
run "#1"  POST "/v1.0/account/info"           '{}'

# --- 2. Station --------------------------------------------------------------
run "#2"  POST "/v1.0/station/list"           '{"page":1,"size":20}'
run "#3"  POST "/v1.0/station/listWithDevice" '{"page":1,"size":20}'
run "#4"  POST "/v1.0/station/device"         "{\"page\":1,\"size\":10,\"stationIds\":[$STATION_ID]}"
run "#5"  POST "/v1.0/station/latest"         "{\"stationId\":$STATION_ID}"
run "#6"  POST "/v1.0/station/history"        "{\"stationId\":$STATION_ID,\"granularity\":2,\"startAt\":\"$YESTERDAY\",\"endAt\":\"$TODAY\"}"
run "#7"  POST "/v1.0/station/history/power"  "{\"stationId\":$STATION_ID,\"startTimestamp\":$DAY_AGO_S,\"endTimestamp\":$NOW_S}"
run "#8"  POST "/v1.0/station/alertList"      "{\"stationId\":$STATION_ID,\"startTimestamp\":$DAY_AGO_S,\"endTimestamp\":$NOW_S,\"page\":1,\"size\":10}"

# --- 3. Device ---------------------------------------------------------------
run "#9"  POST "/v1.0/device/list"            '{"page":1,"size":20}'
run "#10" POST "/v1.0/device/latest"          "{\"deviceList\":[\"$DEVICE_SN\"]}"
run "#11" POST "/v1.0/device/history"         "{\"deviceSn\":\"$DEVICE_SN\",\"granularity\":1,\"startAt\":\"$YESTERDAY\",\"endAt\":\"$TODAY\",\"measurePoints\":[\"SOC\"]}"
run "#12" POST "/v1.0/device/historyRaw"      "{\"deviceSn\":\"$DEVICE_SN\",\"startTimestamp\":$DAY_AGO_S,\"endTimestamp\":$NOW_S,\"measurePoints\":[\"SOC\"]}"
run "#13" POST "/v1.0/device/alertList"       "{\"deviceSn\":\"$DEVICE_SN\",\"startTimestamp\":$DAY_AGO_S,\"endTimestamp\":$NOW_S,\"page\":1,\"size\":10}"
run "#14" POST "/v1.0/device/measurePoints"   "{\"deviceSn\":\"$DEVICE_SN\"}"

# --- 4. Config ---------------------------------------------------------------
run "#15" POST "/v1.0/config/battery"         "{\"deviceSn\":\"$DEVICE_SN\"}"
run "#16" POST "/v1.0/config/system"          "{\"deviceSn\":\"$DEVICE_SN\"}"
run "#17" POST "/v1.0/config/tou"             "{\"deviceSn\":\"$DEVICE_SN\"}"

# --- 5. Order lookup ---------------------------------------------------------
run "#18" GET  "/v1.0/order/0"                ''

# --- Resumen -----------------------------------------------------------------
TOTAL=$(( PASS + WARN + FAIL ))
echo "============================================================"
echo " Resumen: $TOTAL endpoints probados"
echo "   OK    (HTTP 200 + code 1000000): $PASS"
echo "   WARN  (HTTP 200 + code dominio): $WARN   <- reachable, ver notas"
echo "   FAIL  (HTTP no-200 o curl err):  $FAIL"
echo "============================================================"

if [ "$FAIL" -gt 0 ]; then
  exit 2
fi
exit 0
