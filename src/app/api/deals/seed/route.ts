import { seedExamples } from '@/lib/server/deals';
import { json, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Adds clearly-labelled SYNTHETIC example transactions (marked `seeded: true`). */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false }, 403);
  const created = await seedExamples();
  return json({ ok: true, created: created.map((d) => d.id) });
}
