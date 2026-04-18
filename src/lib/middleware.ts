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

function requireEnv() {
  const BASE = process.env.MIDDLEWARE_BASE_URL;
  const KEY = process.env.MIDDLEWARE_API_KEY;
  if (!BASE) throw new Error("MIDDLEWARE_BASE_URL is not set");
  if (!KEY) throw new Error("MIDDLEWARE_API_KEY is not set");
  return { BASE, KEY };
}

export async function mw<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { BASE, KEY } = requireEnv();
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
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
  // Read raw bytes so we can gunzip even when the middleware wraps a
  // binary provider payload inside a JSON string.
  const raw = Buffer.from(await res.arrayBuffer());
  let text = raw.toString("binary");

  if (raw.length >= 2 && raw[0] === 0x1f && raw[1] === 0x8b) {
    try {
      text = gunzipSync(raw).toString("utf8");
    } catch {
      text = raw.toString("utf8");
    }
  } else {
    text = raw.toString("utf8");
  }

  if (!res.ok) throw new MiddlewareError(res.status, text, path);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text as unknown as T;
  }

  // Some provider responses come back as a JSON-wrapped compressed string.
  if (typeof parsed === "string" && parsed.length > 1) {
    const maybe = tryDecompress(parsed);
    if (maybe !== parsed) {
      try {
        return JSON.parse(maybe) as T;
      } catch {
        return maybe as unknown as T;
      }
    }
  }

  return parsed as T;
}

export const mwGet = <T = unknown>(path: string) => mw<T>(path, { method: "GET" });

export const mwPost = <T = unknown>(path: string, body?: unknown) =>
  mw<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const PROVIDERS = [
  "growatt",
  "huawei",
  "deye",
  "hoymiles",
  "srne",
  "solarman",
] as const;

export type ProviderSlug = (typeof PROVIDERS)[number];
