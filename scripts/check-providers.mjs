#!/usr/bin/env node
/**
 * Real minimal connectivity test of every configured provider (Gemini, Groq, OpenRouter free models, Tavily).
 * Synthetic prompt only. Never prints API keys.  Usage: npm run check:providers
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const keys = Object.values(env).filter((v) => v && v.length > 10);
const scrub = (s) => keys.reduce((o, k) => o.split(k).join('***'), String(s));
const list = (v, d) => [...new Set([...(v ? v.split(',').map((x) => x.trim()).filter(Boolean) : []), ...d])];
const MODELS = {
  gemini: list(env.GEMINI_MODELS || env.GEMINI_MODEL, ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest']),
  groq: list(env.GROQ_MODELS, ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b']),
  openrouter: list(env.OPENROUTER_MODELS, ['baidu/ernie-5.5-flash-preview:free', 'nvidia/nemotron-3.5-super-vl:free']).filter((m) => m.endsWith(':free')),
};
const SYS = 'Return only JSON: {"ok":true}';
const USER = 'Connectivity test (synthetic). Reply {"ok":true}.';

async function ping(p, model) {
  const t = Date.now();
  try {
    const r = p === 'gemini'
      ? await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ role: 'user', parts: [{ text: USER }] }], generationConfig: { maxOutputTokens: 50, responseMimeType: 'application/json' } }), signal: AbortSignal.timeout(20000) })
      : await fetch(p === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p === 'groq' ? env.GROQ_API_KEY : env.OPENROUTER_API_KEY}` }, body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'system', content: SYS }, { role: 'user', content: USER }] }), signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    return `${r.ok ? 'SUCCESS' : 'FAILED '} ${p.padEnd(10)} ${model.padEnd(40)} HTTP ${r.status} ${Date.now() - t}ms${r.ok ? '' : ' ' + scrub(body).replace(/\s+/g, ' ').slice(0, 110)}`;
  } catch (e) {
    return `FAILED  ${p.padEnd(10)} ${model.padEnd(40)} ${scrub(e.message)} ${Date.now() - t}ms`;
  }
}

for (const p of ['gemini', 'groq', 'openrouter']) {
  const keyName = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' }[p];
  if (!env[keyName]) { console.log(`SKIPPED ${p} (no ${keyName})`); continue; }
  for (const m of MODELS[p]) console.log(await ping(p, m));
}
if (env.TAVILY_API_KEY) {
  const t = Date.now();
  const r = await fetch('https://api.tavily.com/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TAVILY_API_KEY}` }, body: JSON.stringify({ query: 'fake traffic fine SMS scam warning UAE', max_results: 3 }), signal: AbortSignal.timeout(20000) });
  const j = r.ok ? await r.json() : null;
  console.log(`${r.ok ? 'SUCCESS' : 'FAILED '} tavily     search                                   HTTP ${r.status} ${Date.now() - t}ms ${j ? j.results.map((x) => new URL(x.url).hostname).join(', ') : ''}`);
} else console.log('SKIPPED tavily (no TAVILY_API_KEY)');
