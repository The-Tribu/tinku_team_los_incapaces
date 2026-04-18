import { gunzipSync, inflateSync } from "node:zlib";

function tryDecompress(s: string): string {
  // The middleware occasionally wraps provider-side gzipped payloads as a
  // JSON string, so a JSON-parsed result may be a binary blob. Detect the
  // gzip / zlib magic number and inflate.
  const buf = Buffer.from(s, "binary");
  try {
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      return gunzipSync(buf).toString("utf8");
    }
    if (buf.length >= 2 && buf[0] === 0x78 && (buf[1] === 0x9c || buf[1] === 0xda || buf[1] === 0x01)) {
      return inflateSync(buf).toString("utf8");
    }
  } catch {
    /* fall through — not compressed after all */
  }
  return s;
}

export class MiddlewareError extends Error {
  constructor(
    public status: number,
    public body: string,
    public path: string,
  ) {
    super(`MW ${status} on ${path}: ${body.slice(0, 200)}`);
    this.name = "MiddlewareError";
  }
}

/** Se lanza cuando agotamos los reintentos contra un 429 del middleware. */
export class MiddlewareRateLimitError extends MiddlewareError {
  constructor(
    status: number,
    body: string,
    path: string,
    public retryAfterSec: number,
  ) {
    super(status, body, path);
    this.name = "MiddlewareRateLimitError";
    this.message = `MW rate-limited (${retryAfterSec}s) on ${path}`;
  }
}

function retryAfterSeconds(res: Response, bodyText: string): number {
  // Preferir el header estándar; fallback al body custom del middleware.
  const header = res.headers.get("Retry-After");
  if (header) {
    const n = Number(header);
    if (Number.isFinite(n) && n > 0) return Math.min(n, 180);
  }
  try {
    const parsed = JSON.parse(bodyText) as { retry_after_seconds?: number };
    if (Number.isFinite(parsed.retry_after_seconds) && (parsed.retry_after_seconds ?? 0) > 0) {
      return Math.min(parsed.retry_after_seconds!, 180);
    }
  } catch {
    /* ignore */
  }
  return 5;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireEnv() {
  const BASE = process.env.MIDDLEWARE_BASE_URL;
  const KEY = process.env.MIDDLEWARE_API_KEY;
  if (!BASE) throw new Error("MIDDLEWARE_BASE_URL is not set");
  if (!KEY) throw new Error("MIDDLEWARE_API_KEY is not set");
  return { BASE, KEY };
}

/** Cache en memoria con TTL para llamadas que cambian poco (station/list, etc). */
type CacheEntry = { until: number; value: unknown };
const mwCache = new Map<string, CacheEntry>();

function cacheKey(path: string, init: RequestInit): string {
  return `${init.method ?? "GET"} ${path} ${typeof init.body === "string" ? init.body : ""}`;
}

export type MwOptions = {
  /** TTL en segundos. Si se define, se sirve desde caché mientras esté fresca. */
  cacheTtlSec?: number;
  /** Máx. reintentos ante 429 (default 2). */
  maxRetries?: number;
};

export async function mw<T = unknown>(
  path: string,
  init: RequestInit = {},
  opts: MwOptions = {},
): Promise<T> {
  const { BASE, KEY } = requireEnv();
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const ttl = opts.cacheTtlSec ?? 0;
  const key = ttl > 0 ? cacheKey(path, init) : "";

  if (ttl > 0) {
    const hit = mwCache.get(key);
    if (hit && hit.until > Date.now()) return hit.value as T;
  }

  const maxRetries = opts.maxRetries ?? 2;
  let attempt = 0;
  // Loop hasta consumir reintentos o recibir respuesta no-429.
  while (true) {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
        // Force identity: Caddy/CloudFront strip the content-encoding header,
        // which leaves Node's fetch unable to auto-decompress the body.
        "Accept-Encoding": "identity",
        ...init.headers,
      },
      signal: AbortSignal.timeout(25_000),
    });
    const raw = Buffer.from(await res.arrayBuffer());
    let text: string;
    if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
      try {
        text = gunzipSync(raw).toString("utf8");
      } catch {
        text = raw.toString("utf8");
      }
    } else {
      text = raw.toString("utf8");
    }

    if (res.status === 429) {
      const wait = retryAfterSeconds(res, text);
      if (attempt >= maxRetries) {
        throw new MiddlewareRateLimitError(429, text, path, wait);
      }
      attempt++;
      console.warn(`[mw] 429 on ${path} · retry ${attempt}/${maxRetries} in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }

    if (!res.ok) throw new MiddlewareError(res.status, text, path);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      if (ttl > 0) mwCache.set(key, { until: Date.now() + ttl * 1000, value: text });
      return text as unknown as T;
    }

    // Some provider responses come back as a JSON-wrapped compressed string.
    if (typeof parsed === "string" && parsed.length > 1) {
      const maybe = tryDecompress(parsed);
      if (maybe !== parsed) {
        try {
          parsed = JSON.parse(maybe);
        } catch {
          parsed = maybe;
        }
      }
    }

    // Growatt devuelve HTTP 200 con `error_code: 10012` ("error_frequently_access")
    // cuando la cuenta upstream entra en cooldown (varios minutos). Tratamos
    // esto como rate-limit transitorio con backoff para que callers reintenten
    // sin contaminar las métricas de ingestión.
    if (path.startsWith("/growatt/") && parsed && typeof parsed === "object") {
      const code = (parsed as { error_code?: number }).error_code;
      if (code === 10012) {
        const wait = 60;
        if (attempt >= maxRetries) {
          throw new MiddlewareRateLimitError(200, text, path, wait);
        }
        attempt++;
        console.warn(`[mw] growatt 10012 on ${path} · retry ${attempt}/${maxRetries} in ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
    }

    // Huawei devuelve HTTP 200 con `failCode: 407` ("Login interval is too
    // short") cuando se reautentica antes del cooldown (~10 req/hora sobre
    // /thirdLogin). Otros failCodes transitorios: 305 (sesión expirada),
    // 401 (token inválido). Tratamos 407 como rate-limit y 305 como reintento
    // inmediato (el middleware re-loguea). Ver docs huawei/README.md §5.
    if (path.startsWith("/huawei/") && parsed && typeof parsed === "object") {
      const envelope = parsed as { success?: boolean; failCode?: number };
      if (envelope.success === false && envelope.failCode === 407) {
        const wait = 60;
        if (attempt >= maxRetries) {
          throw new MiddlewareRateLimitError(200, text, path, wait);
        }
        attempt++;
        console.warn(`[mw] huawei failCode=407 on ${path} · retry ${attempt}/${maxRetries} in ${wait}s`);
        await sleep(wait * 1000);
        continue;
      }
    }

    if (ttl > 0) mwCache.set(key, { until: Date.now() + ttl * 1000, value: parsed });
    return parsed as T;
  }
}

/** Invalida toda la caché in-memory. Útil en tests o tras un sync manual. */
export function clearMwCache() {
  mwCache.clear();
}

export const mwGet = <T = unknown>(path: string, opts?: MwOptions) =>
  mw<T>(path, { method: "GET" }, opts);

export const mwPost = <T = unknown>(path: string, body?: unknown, opts?: MwOptions) =>
  mw<T>(
    path,
    { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) },
    opts,
  );

export const PROVIDERS = [
  "growatt",
  "huawei",
  "deye",
  "hoymiles",
  "srne",
  "solarman",
] as const;

export type ProviderSlug = (typeof PROVIDERS)[number];
