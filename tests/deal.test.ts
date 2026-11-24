import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAction, assessRisk, createDeal, DOCS, EXAMPLE_INPUTS, fundsState, LIFECYCLE, REVIEW_CHECKLIST, uploadDocument, validateDealInput, type Action, type Deal, type Role } from '@/lib/deal/engine';
import { ibanValid, vinCheckDigitValid, vinMakes, vinModelYears } from '@/lib/deal/validators';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const ALL_TRUE = REVIEW_CHECKLIST.map(() => true);

function withDocs(d: Deal): Deal {
  for (const doc of DOCS[d.category]) {
    const r = uploadDocument(d, doc.key, { name: doc.key + '.pdf', size: 200_000, type: 'application/pdf', sha256: hash(d.id + doc.key) }, doc.by);
    if (!r.ok) throw new Error(r.error.en);
    d = r.deal;
  }
  return d;
}

function step(d: Deal, ...steps: [Action, Role, string?][]): Deal {
  for (const [a, role, note] of steps) {
    const r = applyAction(d, a, role, { note, checklist: a === 'approve' ? ALL_TRUE : undefined });
    if (!r.ok) throw new Error(`${a}: ${r.error.en}`);
    d = r.deal;
  }
  return d;
}

const vehicle = () => createDeal(EXAMPLE_INPUTS.vehicle, { id: 'AMN-V1' });
const plate = () => createDeal(EXAMPLE_INPUTS.plate, { id: 'AMN-P1' });

describe('Validators', () => {
  it('decodes VIN manufacturer and model year', () => {
    expect(vinMakes('JTMHV05J604123456')).toContain('toyota');
    expect(vinModelYears('JTMHV05J6M4123456')).toContain(2021);
    expect(vinCheckDigitValid('1M8GDM9AXKP042788')).toBe(true);
    expect(vinCheckDigitValid('1M8GDM9A1KP042788')).toBe(false);
  });
  it('validates IBAN check digits', () => {
    expect(ibanValid('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(ibanValid('AE12 3456 7890 1234 5678 901')).toBe(false);
  });
});

describe('Secure Deal: categories', () => {
  it('rejects every unsupported category on validation', () => {
    for (const c of ['real_estate', 'land', 'business', 'goods', 'anything']) {
      const r = validateDealInput({ ...EXAMPLE_INPUTS.vehicle, category: c });
      expect(r.ok).toBe(false);
    }
    expect(validateDealInput(EXAMPLE_INPUTS.vehicle).ok).toBe(true);
    expect(validateDealInput(EXAMPLE_INPUTS.plate).ok).toBe(true);
  });
  it('only defines documents for vehicles and plates', () => {
    expect(Object.keys(DOCS).sort()).toEqual(['plate', 'vehicle']);
  });
});

describe('Secure Deal: vehicle workflow', () => {
  it('runs the full 10-step lifecycle end to end', () => {
    let d = withDocs(vehicle());
    d = step(d, ['submit_documents', 'seller']);
    expect(d.status).toBe('risk_assessed');
    expect(d.risk?.level).toBe('low');
    d = step(d, ['accept_conditions', 'buyer'], ['accept_conditions', 'seller'], ['hold_payment', 'buyer']);
    expect(fundsState(d)).toBe('held');
    d = step(d, ['confirm_transfer', 'seller'], ['approve', 'reviewer'], ['release_payment', 'reviewer']);
    expect(d.status).toBe('completed');
    expect(fundsState(d)).toBe('released');
    expect(LIFECYCLE.every((s) => s.reachedAt(d))).toBe(true);
  });

  it('NEVER releases payment before reviewer approval', () => {
    let d = withDocs(vehicle());
    const states: Deal[] = [d];
    d = step(d, ['submit_documents', 'seller']); states.push(d);
    d = step(d, ['accept_conditions', 'buyer'], ['accept_conditions', 'seller']); states.push(d);
    d = step(d, ['hold_payment', 'buyer']); states.push(d);
    d = step(d, ['confirm_transfer', 'seller']); states.push(d);
    for (const s of states) {
      const r = applyAction(s, 'release_payment', 'reviewer');
      expect(r.ok).toBe(false);
    }
  });

  it('cannot skip steps (no payment hold before both parties accept conditions)', () => {
    let d = step(withDocs(vehicle()), ['submit_documents', 'seller'], ['accept_conditions', 'buyer']);
    expect(d.status).toBe('risk_assessed');
    expect(applyAction(d, 'hold_payment', 'buyer').ok).toBe(false);
    expect(applyAction(d, 'accept_conditions', 'buyer').ok).toBe(false);
  });

  it('enforces roles, the reviewer checklist and document ownership', () => {
    let d = step(withDocs(vehicle()), ['submit_documents', 'seller'], ['accept_conditions', 'buyer'], ['accept_conditions', 'seller'], ['hold_payment', 'buyer'], ['confirm_transfer', 'seller']);
    expect(applyAction(d, 'approve', 'seller', { checklist: ALL_TRUE }).ok).toBe(false);
    expect(applyAction(d, 'approve', 'reviewer', { checklist: [true, false, true, true] }).ok).toBe(false);
    d = step(d, ['approve', 'reviewer']);
    expect(applyAction(d, 'release_payment', 'buyer').ok).toBe(false);
    expect(uploadDocument(vehicle(), 'ownership', { name: 'x.pdf', size: 1000, type: 'application/pdf', sha256: hash('x') }, 'buyer').ok).toBe(false);
    expect(uploadDocument(vehicle(), 'ownership', { name: 'x.exe', size: 1000, type: 'application/x-msdownload', sha256: hash('x') }, 'seller').ok).toBe(false);
  });

  it('blocks submission when required documents are missing', () => {
    expect(applyAction(vehicle(), 'submit_documents', 'seller').ok).toBe(false);
  });

  it('detects vehicle fraud signals and flags the transaction', () => {
    const clean = withDocs(vehicle());
    const risky = withDocs(createDeal(EXAMPLE_INPUTS.vehicleRisky, { id: 'AMN-V2' }));
    const ra = assessRisk(risky, [clean]);
    const got = ra.findings.map((f) => f.id);
    expect(got).toEqual(expect.arrayContaining(['owner-mismatch', 'third-party-payment', 'vin-make-mismatch', 'duplicate-vin', 'cond-off-platform', 'no-inspection']));
    expect(ra.level).toBe('critical');
    const d = step(risky, ['submit_documents', 'seller']);
    expect(d.status).toBe('flagged');
    expect(applyAction(d, 'accept_conditions', 'buyer').ok).toBe(false);
  });

  it('flag → additional verification → resubmission → reassessment', () => {
    let d = step(withDocs(createDeal(EXAMPLE_INPUTS.vehicleRisky, { id: 'AMN-V3' })), ['submit_documents', 'seller']);
    expect(applyAction(d, 'request_verification', 'reviewer').ok).toBe(false); // note required
    d = step(d, ['request_verification', 'reviewer', 'Provide the Mulkiya of the registered owner']);
    expect(d.status).toBe('needs_verification');
    d = step(d, ['submit_documents', 'seller']);
    expect(['flagged', 'risk_assessed']).toContain(d.status);
    expect(d.timeline.filter((e) => e.kind === 'risk_assessment').length).toBe(2);
  });

  it('rejection after payment hold returns the payment (simulated)', () => {
    let d = step(withDocs(vehicle()), ['submit_documents', 'seller'], ['accept_conditions', 'buyer'], ['accept_conditions', 'seller'], ['hold_payment', 'buyer']);
    expect(applyAction(d, 'reject', 'reviewer').ok).toBe(false);
    d = step(d, ['reject', 'reviewer', 'VIN mismatch found at inspection']);
    expect(d.status).toBe('rejected');
    expect(fundsState(d)).toBe('returned');
    expect(applyAction(d, 'release_payment', 'reviewer').ok).toBe(false);
  });

  it('parties cannot cancel once payment is held', () => {
    const d = step(withDocs(vehicle()), ['submit_documents', 'seller'], ['accept_conditions', 'buyer'], ['accept_conditions', 'seller'], ['hold_payment', 'buyer']);
    expect(applyAction(d, 'cancel', 'buyer').ok).toBe(false);
  });
});

describe('Secure Deal: premium plate workflow', () => {
  it('runs the full plate lifecycle', () => {
    let d = withDocs(plate());
    d = step(d, ['submit_documents', 'buyer'], ['accept_conditions', 'seller'], ['accept_conditions', 'buyer'], ['hold_payment', 'buyer'], ['confirm_transfer', 'seller'], ['approve', 'reviewer'], ['release_payment', 'reviewer']);
    expect(d.status).toBe('completed');
  });
  it('detects plate fraud signals: impersonation, beneficiary mismatch, invalid IBAN, fake payment proof, duplicate plate', () => {
    const risky = createDeal(EXAMPLE_INPUTS.plateRisky, { id: 'AMN-P2' });
    const dup = createDeal({ ...EXAMPLE_INPUTS.plateRisky, seller: { name: 'Someone Else', phone: '+971 50 999 0000' } }, { id: 'AMN-P3' });
    const ra = assessRisk(withDocs(risky), [dup]);
    expect(ra.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['owner-mismatch', 'beneficiary-mismatch', 'iban-invalid', 'duplicate-plate', 'cond-off-platform']));
    expect(ra.findings.some((f) => f.id.startsWith('cond-scenario-fake-payment-confirmation') || f.id === 'cond-scenario-plate-sale')).toBe(true);
    expect(ra.level).toBe('critical');
  });
  it('detects the same document file reused across transactions', () => {
    const a = withDocs(plate());
    const b = createDeal(EXAMPLE_INPUTS.plate, { id: 'AMN-P4' });
    const reused = uploadDocument(b, 'plate_ownership', { name: 'own.pdf', size: 200_000, type: 'application/pdf', sha256: a.documents.plate_ownership.sha256 }, 'seller');
    expect(reused.ok).toBe(true);
    if (reused.ok) expect(assessRisk(reused.deal, [a]).findings.map((f) => f.id)).toContain('document-reused');
  });
});

describe('Secure Deal: server enforcement', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'aman-deals-'));
    process.env.AMAN_DATA_DIR = dir;
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects unsupported categories, deduplicates creation and blocks stale versions', async () => {
    const { POST } = await import('@/app/api/deals/route');
    const { mutateDeal } = await import('@/lib/server/deals');
    const post = (body: unknown) => POST(new Request('http://localhost/api/deals', { method: 'POST', headers: { 'content-type': 'application/json', host: 'localhost' }, body: JSON.stringify(body) }));

    const bad = await post({ ...EXAMPLE_INPUTS.vehicle, category: 'real_estate' });
    expect(bad.status).toBe(400);

    const r1 = await (await post({ ...EXAMPLE_INPUTS.vehicle, idempotencyKey: 'k-1' })).json();
    const r2 = await (await post({ ...EXAMPLE_INPUTS.vehicle, idempotencyKey: 'k-1' })).json();
    expect(r1.ok).toBe(true);
    expect(r2.deal.id).toBe(r1.deal.id);

    const early = await mutateDeal(r1.deal.id, { op: 'action', action: 'release_payment', role: 'reviewer', version: r1.deal.version });
    expect(early.ok).toBe(false);

    const stale = await mutateDeal(r1.deal.id, { op: 'action', action: 'cancel', role: 'buyer', version: r1.deal.version - 1 });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.status).toBe(409);

    const ok = await mutateDeal(r1.deal.id, { op: 'action', action: 'cancel', role: 'buyer', version: r1.deal.version });
    expect(ok.ok).toBe(true);
    const twice = await mutateDeal(r1.deal.id, { op: 'action', action: 'cancel', role: 'buyer', version: r1.deal.version });
    expect(twice.ok).toBe(false);
  });
});
