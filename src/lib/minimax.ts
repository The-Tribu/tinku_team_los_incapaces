/**
 * MiniMax LLM client.
 * Used by the AI Copilot (/copilot), rule-suggestion enrichment and the
 * monthly report generator.
 *
 * MiniMax offers an OpenAI-compatible Chat Completions endpoint at
 * `/v1/text/chatcompletion_v2`.
 */

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type ChatOptions = {
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
};

export class MiniMaxError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`MiniMax ${status}: ${body.slice(0, 200)}`);
    this.name = "MiniMaxError";
  }
}

function requireEnv() {
  const base = process.env.MINIMAX_BASE_URL;
  const key = process.env.MINIMAX_API_KEY;
  const model = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
  if (!base) throw new Error("MINIMAX_BASE_URL is not set");
  if (!key) throw new Error("MINIMAX_API_KEY is not set");
  return { base, key, model };
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const { base, key, model } = requireEnv();
  const res = await fetch(`${base}/text/chatcompletion_v2`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      response_format: opts.json ? { type: "json_object" } : undefined,
    }),
    signal: opts.signal ?? AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new MiniMaxError(res.status, text);
  const data = JSON.parse(text);
  return data?.choices?.[0]?.message?.content ?? "";
}

export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  opts: Omit<ChatOptions, "json"> = {},
): Promise<T> {
  const content = await chat(messages, { ...opts, json: true });
  try {
    return JSON.parse(content) as T;
  } catch {
    // MiniMax sometimes returns a fenced JSON block — strip and retry.
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) return JSON.parse(match[1]) as T;
    throw new Error(`MiniMax returned non-JSON: ${content.slice(0, 200)}`);
  }
}
