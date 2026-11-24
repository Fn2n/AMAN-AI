import { getDeal, mutateDeal } from '@/lib/server/deals';
import { clientIp, createLimiter, json, readJson, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createLimiter(300, 10 * 60 * 1000);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const deal = await getDeal(id);
  return deal ? json({ ok: true, deal }) : json({ ok: false, error: { en: 'Not found', ar: 'غير موجودة' } }, 404);
}

/** State transitions and document metadata. All rules are enforced here, not in the browser. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false, error: { en: 'Forbidden', ar: 'غير مسموح' } }, 403);
  if (!allow(clientIp(req))) return json({ ok: false, error: { en: 'Too many requests', ar: 'طلبات كثيرة' } }, 429);
  const { id } = await ctx.params;
  const body = await readJson(req, 8 * 1024);
  if (!body) return json({ ok: false, error: { en: 'Invalid request', ar: 'طلب غير صالح' } }, 400);
  const r = await mutateDeal(id, body);
  return r.ok ? json({ ok: true, deal: r.deal }) : json({ ok: false, error: r.error }, r.status);
}
