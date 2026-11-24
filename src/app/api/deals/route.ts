import { createDealServer, listDeals } from '@/lib/server/deals';
import { clientIp, createLimiter, json, readJson, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createLimiter(120, 10 * 60 * 1000);

export async function GET(): Promise<Response> {
  return json({ ok: true, deals: await listDeals() });
}

/** Create a vehicle or premium-plate transaction. Any other category is rejected server-side. */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false, error: { en: 'Forbidden', ar: 'غير مسموح' } }, 403);
  if (!allow(clientIp(req))) return json({ ok: false, error: { en: 'Too many requests', ar: 'طلبات كثيرة' } }, 429);
  const body = (await readJson(req, 16 * 1024)) as Record<string, unknown> | undefined;
  if (!body) return json({ ok: false, error: { en: 'Invalid request', ar: 'طلب غير صالح' } }, 400);
  const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 64) : undefined;
  const r = await createDealServer(body, key);
  return r.ok ? json({ ok: true, deal: r.deal }, 201) : json({ ok: false, error: r.error }, r.status);
}
