// Thin HTTP clients for the two supported providers — no SDK dependency, just
// their documented REST endpoints. Server-side only (they take API keys).

export type AiProvider = "ANTHROPIC" | "OPENAI";

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ANTHROPIC: "claude-sonnet-5-5",
  OPENAI: "gpt-4.1-mini",
};

export type AiCall = {
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  timeoutMs?: number;
};

export type AiResult = { text: string; inputTokens: number; outputTokens: number };

export class AiProviderError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const detail = json?.error?.message ?? text.slice(0, 200);
      const hint =
        res.status === 401 ? "The API key was rejected." : res.status === 404 ? "That model name wasn't found — check it in Settings." : res.status === 429 ? "Rate limit or out of credit at the provider." : "";
      throw new AiProviderError(`${hint ? `${hint} ` : ""}(${res.status}) ${detail}`.trim(), res.status);
    }
    return json;
  } catch (err: any) {
    if (err?.name === "AbortError") throw new AiProviderError("The AI provider didn't respond in time. Try again.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callAnthropic(c: AiCall): Promise<AiResult> {
  const json = await post(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": c.apiKey, "anthropic-version": "2023-06-01" },
    { model: c.model, max_tokens: c.maxTokens, system: c.system, messages: [{ role: "user", content: c.prompt }] },
    c.timeoutMs ?? 50_000
  );
  const text = (json?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n");
  return { text, inputTokens: json?.usage?.input_tokens ?? 0, outputTokens: json?.usage?.output_tokens ?? 0 };
}

export async function callOpenAI(c: AiCall): Promise<AiResult> {
  const json = await post(
    "https://api.openai.com/v1/chat/completions",
    { authorization: `Bearer ${c.apiKey}` },
    {
      model: c.model,
      max_completion_tokens: c.maxTokens,
      messages: [
        { role: "system", content: c.system },
        { role: "user", content: c.prompt },
      ],
    },
    c.timeoutMs ?? 50_000
  );
  return {
    text: json?.choices?.[0]?.message?.content ?? "",
    inputTokens: json?.usage?.prompt_tokens ?? 0,
    outputTokens: json?.usage?.completion_tokens ?? 0,
  };
}

export function callProvider(provider: AiProvider, c: AiCall) {
  return provider === "OPENAI" ? callOpenAI(c) : callAnthropic(c);
}

/** Pulls the first JSON object out of a model reply (tolerates ```json fences / prose). */
export function extractJson<T>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
