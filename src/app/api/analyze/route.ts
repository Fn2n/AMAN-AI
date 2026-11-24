import { parseAnalyzeRequest, runPipeline } from '@/lib/server/pipeline';
import { clientIp, createLimiter, json, readJson, sameOrigin } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allow = createLimiter(60, 10 * 60 * 1000);

/** Full analysis: deterministic engine + live technical checks + internet research. */
export async function POST(req: Request): Promise<Response> {
  if (!sameOrigin(req)) return json({ ok: false, error: 'forbidden' }, 403);
  if (!allow(clientIp(req))) return json({ ok: false, error: 'rate_limited' }, 429);
  const body = await readJson(req, 32 * 1024);
  const parsed = parseAnalyzeRequest(body);
  if (!parsed) return json({ ok: false, error: 'bad_request' }, 400);
  try {
    const report = await runPipeline(parsed);
    if (!report) return json({ ok: false, error: 'invalid_input' }, 422);
    return json({ ok: true, report });
  } catch (e) {
    console.error('[analyze] pipeline error', e instanceof Error ? e.message.slice(0, 200) : 'unknown');
    return json({ ok: false, error: 'server_error' }, 500);
  }
}
