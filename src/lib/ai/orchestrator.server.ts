import 'server-only';
import { createHash } from 'node:crypto';
import { TtlCache } from '@/lib/server/util';
import { SYSTEM_INSTRUCTION, buildPrompt, parseAiOutput, type AiAttempt, type AiProvider, type AiResponse, type EvidencePayload } from './contract';

/**
 * Centralized AI orchestration. Provider priority: Gemini → Groq → OpenRouter (free models only).
 * The deterministic engine is the final fallback (handled by the UI: the report is always shown).
 *
 *  - One provider answers each request; the next is tried only on failure (no fan-out).
 *  - A model that returns 429/503/404 is put on a cooldown so later requests skip it instead of re-hitting it.
 *  - Bounded: at most MAX_ATTEMPTS model calls and an overall deadline per request.
 *  - Successful explanations are cached by evidence hash.
 *  - Keys are read only here, on the server. Nothing logged contains a key or the request body.
 */

const ATTEMPT_TIMEOUT_MS = 12_000;
const OVERALL_DEADLINE_MS = 38_000;
const MAX_ATTEMPTS = 5;

/** Defaults verified against each provider's model-list API and a real test call on 2026-11-24. */
const DEFAULTS: Record<AiProvider, string[]> = {
  gemini: ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest'],
  groq: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
  openrouter: ['baidu/ernie-5.5-flash-preview:free', 'nvidia/nemotron-3.5-super-vl:free'],
};
const KEY_ENV: Record<AiProvider, string> = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const PROVIDERS: AiProvider[] = ['gemini', 'groq', 'openrouter'];

const key = (p: AiProvider) => process.env[KEY_ENV[p]]?.trim() || '';

export function modelsFor(p: AiProvider): string[] {
  const env = p === 'gemini' ? process.env.GEMINI_MODELS || process.env.GEMINI_MODEL : p === 'groq' ? process.env.GROQ_MODELS : process.env.OPENROUTER_MODELS;
  const list = (env?.split(',').map((x) => x.trim()).filter(Boolean) ?? []).concat(DEFAULTS[p]);
  const uniq = [...new Set(list)];
  // OpenRouter: never use a paid model. Only ":free" variants are allowed.
  return p === 'openrouter' ? uniq.filter((m) => m.endsWith(':free')) : uniq;
}

export function providerStatus() {
  return PROVIDERS.map((p) => ({ provider: p, configured: !!key(p), models: key(p) ? modelsFor(p) : [] }));
}

export function aiConfigured(): boolean {
  return PROVIDERS.some((p) => !!key(p));
}

const cooldown = new Map<string, number>();
const cache = new TtlCache<AiResponse>(20 * 60 * 1000, 300);

type CallResult = { ok: true; text: string } | { ok: false; outcome: AiAttempt['outcome']; status?: number };

async function callModel(p: AiProvider, model: string, system: string, user: string, signal: AbortSignal): Promise<CallResult> {
  try {
    let r: Response;
    if (p === 'gemini') {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key(p) },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1800, responseMimeType: 'application/json' },
        }),
        signal,
      });
    } else {
      r = await fetch(p === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key(p)}`, ...(p === 'openrouter' ? { 'X-Title': 'AMAN AI' } : {}) },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
        signal,
      });
    }
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const outcome: AiAttempt['outcome'] =
        r.status === 429 ? (/quota|exceeded your current|billing|credits/i.test(body) ? 'quota_exceeded' : 'rate_limited') : r.status === 401 || r.status === 403 ? 'auth_error' : r.status === 404 || r.status >= 500 ? 'unavailable' : 'error';
      return { ok: false, outcome, status: r.status };
    }
    const j = (await r.json()) as Record<string, unknown>;
    const text =
      p === 'gemini'
        ? ((j.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '')
        : ((j.choices as { message?: { content?: string | null } }[] | undefined)?.[0]?.message?.content ?? '');
    return { ok: true, text };
  } catch (e) {
    return { ok: false, outcome: e instanceof Error && /abort|timeout/i.test(e.name + e.message) ? 'timeout' : 'error' };
  }
}

const COOLDOWN_MS: Partial<Record<AiAttempt['outcome'], number>> = {
  rate_limited: 60_000,
  quota_exceeded: 15 * 60_000,
  unavailable: 45_000,
  auth_error: 60 * 60_000,
  timeout: 20_000,
};

export async function explain(p: EvidencePayload): Promise<AiResponse> {
  if (!aiConfigured()) return { ok: false, reason: 'not_configured' };
  const prompt = buildPrompt(p);
  const ck = createHash('sha256').update(prompt).digest('hex');
  const hit = cache.get(ck);
  if (hit) return { ...hit, ...(hit.ok ? { cached: true } : {}) };

  const attempts: AiAttempt[] = [];
  const deadline = Date.now() + OVERALL_DEADLINE_MS;
  for (const provider of PROVIDERS) {
    if (!key(provider)) continue;
    for (const model of modelsFor(provider)) {
      if (attempts.filter((a) => a.outcome !== 'cooling_down').length >= MAX_ATTEMPTS || Date.now() > deadline - 2000) break;
      const id = `${provider}:${model}`;
      if ((cooldown.get(id) ?? 0) > Date.now()) {
        attempts.push({ provider, model, outcome: 'cooling_down', ms: 0 });
        continue;
      }
      const started = Date.now();
      const res = await callModel(provider, model, SYSTEM_INSTRUCTION, prompt, AbortSignal.timeout(Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now())));
      const ms = Date.now() - started;
      if (res.ok) {
        const parsed = parseAiOutput(res.text, provider, model);
        if (parsed) {
          attempts.push({ provider, model, outcome: 'success', ms });
          const out: AiResponse = { ok: true, explanation: parsed, attempts };
          cache.set(ck, out);
          console.info(`[ai] ${provider}/${model} success ${ms}ms after ${attempts.length - 1} failed attempt(s)`);
          return out;
        }
        attempts.push({ provider, model, outcome: 'invalid_output', ms });
        continue;
      }
      attempts.push({ provider, model, outcome: res.outcome, ms });
      const cd = COOLDOWN_MS[res.outcome];
      if (cd) cooldown.set(id, Date.now() + cd);
      console.warn(`[ai] ${provider}/${model} ${res.outcome}${res.status ? ` (HTTP ${res.status})` : ''} ${ms}ms`);
    }
  }
  return { ok: false, reason: 'all_providers_failed', attempts };
}

/** Minimal live connectivity test of one model (used by the diagnostics script/endpoint). */
export async function pingModel(provider: AiProvider, model: string): Promise<{ ok: boolean; outcome: string; ms: number }> {
  const started = Date.now();
  const r = await callModel(provider, model, 'Return only JSON: {"ok":true}', 'Connectivity test. Reply {"ok":true}.', AbortSignal.timeout(ATTEMPT_TIMEOUT_MS));
  return { ok: r.ok, outcome: r.ok ? 'success' : r.outcome, ms: Date.now() - started };
}
