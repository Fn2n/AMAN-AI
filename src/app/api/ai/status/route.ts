import { aiConfigured, providerStatus } from '@/lib/ai/orchestrator.server';
import { researchConfigured } from '@/lib/server/research';
import { json } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tells the UI which capabilities are configured. Never returns keys. */
export function GET(): Response {
  return json({ enabled: aiConfigured(), providers: providerStatus(), research: researchConfigured() });
}
