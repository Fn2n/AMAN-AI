import { sanitizeEvidence, type AiResponse } from '@/lib/ai/contract';
import { explain } from '@/lib/ai/orchestrator.server';
import { clientIp, createLimiter, json, readJson, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createLimiter(60, 10 * 60 * 1000);

const STATUS: Record<string, number> = { not_configured: 503, rate_limited: 429, all_providers_failed: 502, bad_request: 400, forbidden: 403 };
const reply = (r: AiResponse) => json(r, r.ok ? 200 : (STATUS[r.reason] ?? 502));

export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return reply({ ok: false, reason: 'forbidden' });
  if (!allow(clientIp(req))) return reply({ ok: false, reason: 'rate_limited' });
  const body = await readJson(req, 64 * 1024);
  const evidence = sanitizeEvidence((body as { report?: unknown } | undefined)?.report);
  if (!evidence) return reply({ ok: false, reason: 'bad_request' });
  return reply(await explain(evidence));
}
