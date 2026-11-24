import { explain } from '@/lib/ai/orchestrator.server';
import { dealEvidence, getDeal } from '@/lib/server/deals';
import { clientIp, createLimiter, json, readJson, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createLimiter(40, 10 * 60 * 1000);

/**
 * AI explanation of a transaction's risk assessment. Requires explicit consent from the user.
 * Only non-sensitive, redacted evidence is sent (see dealEvidence): no names, phones, IBANs or documents.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false, reason: 'forbidden' }, 403);
  if (!allow(clientIp(req))) return json({ ok: false, reason: 'rate_limited' }, 429);
  const body = (await readJson(req, 1024)) as { consent?: unknown } | undefined;
  if (body?.consent !== true) return json({ ok: false, reason: 'consent_required' }, 400);
  const { id } = await ctx.params;
  const deal = await getDeal(id);
  const ev = deal ? dealEvidence(deal) : null;
  if (!ev) return json({ ok: false, reason: 'bad_request' }, 400);
  const r = await explain(ev);
  return json(r, r.ok ? 200 : 502);
}
