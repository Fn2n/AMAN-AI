import { listThreats, summarize } from '@/lib/server/threats';
import { json } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Early-warning feed: analyses performed on this AMAN server (redacted). */
export async function GET(): Promise<Response> {
  const list = await listThreats();
  return json({ summary: summarize(list), recent: list.slice(0, 40) });
}
