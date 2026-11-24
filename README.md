# AMAN AI | أمان

**Bilingual (Arabic / English) UAE fraud-prevention platform with two services:**

1. **AMAN AI Assistant**: fraud detection and early warning backed by verified evidence: detection rules, live domain intelligence (RDAP, DNS, safe HTTPS/redirect inspection), internet research with cited sources (Tavily), and AI explanations (Gemini → Groq → OpenRouter).
2. **AMAN Secure Deal**: fraud prevention for **vehicle** and **premium license plate** transactions, with server-enforced steps, an automated consistency and risk assessment, and simulated payment holding.

Built for the **ScamShield AI Hackathon** (42 Abu Dhabi × Abu Dhabi Police). AMAN AI is a prototype. It is not affiliated with or endorsed by any police force, government entity or bank.

---

## Quick start (Windows)

Requirements: **Node.js 20+** (tested on Node 24).

```powershell
cd aman-ai
npm install
Copy-Item .env.example .env.local   # then add your keys (all have free tiers)
npm run build
npm start                           # http://localhost:3000
```
`npm run dev` also works. Or double-click **`start-demo.bat`** (it installs, builds, picks a free port from 3000 and opens the browser).

Without any keys the app still works: the deterministic engine, the live RDAP/DNS/HTTPS checks and Secure Deal need no key. AI and internet research switch themselves off and say so in each report.

| Command | What it does |
|---|---|
| `npm test` | 64 unit tests (detection rules, SSRF protection, AI failover with mocked providers, Secure Deal state machine and server API) |
| `npm run typecheck` | TypeScript strict check |
| `npm run eval` | Detection-accuracy benchmark; regenerates `docs/EVALUATION.md` |
| `npm run check:providers` | Real minimal connectivity test of every configured AI provider and Tavily (prints no keys) |
| `npm run verify:domains` | Re-verifies the trusted official domains (live DNS + web search); writes `docs/official-domains-verification.json` |

---

## Service 1: AMAN AI Assistant (`/assistant`)

Inputs: **links**, **SMS / WhatsApp / email messages** (Arabic, English, mixed), **business, ad, search-result or Google Maps listing details and phone numbers**, and **social accounts**. Free text also works; the assistant detects what was pasted.

### How an analysis works
```
input ─► 1. Deterministic rules (offline, reproducible)        → findings with weights  ─┐
         2. Live technical checks (server, SSRF-safe)           → cited facts + findings  ├─► score 0–100, level,
            RDAP registration date · DNS/hosting · SPF/DMARC                              │   evidence sufficiency
            safe redirect + HTTPS certificate inspection                                  │
         3. Internet research (Tavily, cached)                  → cited sources          ─┘
            scam reports about the exact domain/number/handle,
            official warnings about the detected scam type
         4. AI explanation (Gemini → Groq → OpenRouter)         → explains, never scores
```

**The deterministic engine controls the score.** AI only explains the evidence and cannot change it. Live and research signals can raise a score to at most 45 ("Caution") on their own; a High or Dangerous verdict needs at least one content-based rule finding. For example, a domain is never called fraudulent just for being new or unknown.

Each report shows, in separate sections:
- **Detected warning signs** (detection rules), **Verified technical evidence** (RDAP / DNS / HTTPS facts with source and timestamp), **Internet research** (source URL, retrieval time, tagged *official* / *scam warning* / *reference*), **Trust signals**, and the **AI interpretation** with the provider and model that answered.
- **Official website comparison** against verified official domains.
- **Evidence sufficiency** (strong / moderate / limited) and a status list of every check (done / failed / skipped / unavailable) plus checks that are never performed.
- **Export:** structured **JSON** and **print / Save as PDF** with report ID, timestamps, redacted submitted content, findings, sources, technical facts, recommended actions and optional screenshots (kept in the browser).

Status labels only appear when true: *Evidence-Based Analysis*, *Live Sources Checked*, *Limited Verification*, *AI Analysis Completed*.

### Detection coverage
- **URLs:** registrable domain via the **Public Suffix List** (`tldts`); verified official-domain matching (41 organizations); brand impersonation; **typosquatting** (edit distance, character substitution such as `paypa1` and `rnashreq`); **Unicode / punycode homographs** (decoding plus a mixed-script and confusable-character skeleton); **deceptive subdomains** (`dubaipolice.gov.ae.fines-portal.online`); brand in path; free-hosting abuse (`*.web.app`, `*.pages.dev`…); URL shorteners; high-abuse TLDs; IP hosts; `@` tricks; non-standard ports; risky downloads (`.apk`); embedded redirects; victim-tracking parameters; credential and payment wording; **fake payment links** (brand + fine/toll/fee/customs path).
- **Messages:** sender spoofing, look-alike sender domains, Reply-To/Return-Path mismatch, SPF/DKIM/DMARC results, links that are not on the claimed organization's official domain, OTP/card/UAE PASS requests, urgency, threats, lures, unusual payment channels. Arabic matching is normalized (hamza, taa marbuta, alef maqsura, diacritics).
- **UAE scenarios:** fake traffic fines, Salik/Darb toll payments, delivery/customs fees, bank account suspension, government service payments, fake customer-service numbers (official brand on a personal mobile number), vehicle-sale and premium-plate-sale scams, fake payment confirmations, investment scams.
- **Listings and phones:** UAE numbering-plan classification (mobile / landline / toll-free / premium), official-brand-on-mobile detection, sponsored-result impersonation, Maps links identified (never fetched), website vs. official domain, and search results that point to a different website.

### Early-warning feed (Assistant → "Early-warning feed")
Built from analyses run on this server only: recent threats, impersonated organizations, detected scam patterns, newly registered suspicious domains (RDAP age < 90 days), risk levels and timestamps. Stored redacted in `.data/threats.json`. **It is not internet-wide monitoring.**

### Verified official domains
`scripts/verify-official-domains.mjs` checks each candidate with live DNS plus a Tavily search showing the organization's site on that domain. **41 of 42** candidates verified on 2026-11-24 (evidence in `docs/official-domains-verification.json`). `ecrime.ae` could not be verified and is therefore not trusted or recommended. The check also surfaced `abudhabipolice.gov.ae` alongside `adpolice.gov.ae` for Abu Dhabi Police.

---

## Service 2: AMAN Secure Deal (`/deal`), vehicles and premium plates only

### Supported categories
Only **Vehicles (المركبات)** and **Premium License Plates (الأرقام المميزة)**. Every other category (real estate, land, businesses, goods) has been removed from the UI, data model, validation, API, samples and tests. The API rejects any other category with HTTP 400. Transactions created before this change in a browser's `localStorage` are **not deleted**: the dashboard lists them read-only and offers a JSON download.

### Transaction lifecycle (enforced on the server)
1. Deal created → 2. Buyer & seller details → 3. Documents submitted → 4. Fraud risk assessed → 5. Conditions accepted (both parties) → 6. Payment held *(simulated)* → 7. Ownership transfer *(simulated)* → 8. Review & approval (checklist) → 9. Payment released *(simulated)* → 10. Completed

Side states: **Flagged** (automatic when risk ≥ 50, or by a reviewer), **Additional verification required** (resubmission triggers a new assessment), **Rejected** (held payment returned, simulated), **Cancelled** (not possible once payment is held).
All transitions, roles and required notes are enforced in `src/lib/deal/engine.ts` and executed only by the server (`/api/deals/[id]`). Optimistic versioning rejects stale or double-clicked actions (HTTP 409), and creation is idempotent. **Payment can never be released before approval.**

### Vehicle form and checks
Make, model, year, VIN, registration emirate, registered owner (as on the Mulkiya), registration number, plate, mileage, agreed price (AED), buyer and seller, payment instructions, conditions, inspection agreement, and documents (Mulkiya, IDs, inspection report).
Checks: VIN format, **VIN model year vs. stated year**, **VIN manufacturer (WMI) vs. stated make**, VIN check digit (North-American VINs), seller ≠ registered owner, duplicate VIN in another active deal, payment to a third party or to a different account holder, IBAN mod-97 / UAE format, cash, no inspection, conditions that push payment off-platform (deposit before inspection, shipping, "send a screenshot"), buyer/seller identity overlap, phone format, duplicate or reused document files.

### Premium plate form and checks
Issuing emirate, plate code/category, number, type, registered owner, price, parties, payment, conditions, documents.
Checks: plate code/number format, seller ≠ registered owner (possible impersonation), duplicate plate in another active deal, document reuse across transactions, payment and conditions checks as above, and a high-value pattern flag (informational).

### What is simulated and what is real
- **Real:** the consistency checks above, SHA-256 fingerprints of documents (computed in the browser; **files never leave the device**), state enforcement, the risk score.
- **Simulated:** payment holding and release, ownership transfer. There is **no** connection to RTA, ITC, MOI, any licensing authority or bank, no access to plate ownership databases, and no market valuations. Documents are not read or authenticated.
- **AI risk explanation:** opt-in and consent-gated. Only redacted, non-sensitive findings are sent (no names, phones, IBANs or documents).

### Dashboard
Totals, active, completed, flagged, awaiting verification, vehicles vs. plates (all computed from stored data), filterable list, risk score per deal, and an "Add example transactions" button. Seeded examples are labelled **Example**.

---

## AI providers and internet research

| Layer | Provider | Models (verified 2026-11-24 via model-list API + real call) |
|---|---|---|
| Primary | Google Gemini (REST v1beta) | `gemini-3.1-flash-lite`, `gemini-flash-lite-latest` |
| Fallback 1 | Groq | `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` |
| Fallback 2 | OpenRouter, **`:free` models only** (enforced in code) | `baidu/ernie-5.5-flash-preview:free`, `nvidia/nemotron-3.5-super-vl:free` |
| Final fallback | Deterministic engine | always available |
| Research | Tavily Search (basic depth, cached 6 h) | n/a |

- One provider answers each request. The next is tried only on failure (429, quota, 5xx, 404, timeout, invalid JSON), so requests are never fanned out to several providers.
- A model that fails is put on a cooldown (rate limit 60 s, quota 15 min). At most 5 model calls per request, 12 s per call, 38 s overall. Explanations are cached by evidence hash.
- Output is strict JSON, validated before display. The UI shows which provider answered and which failed before it.
- **Root cause of the earlier Gemini failures:** the original default model `gemini-3.8-flash` returns *429 "exceeded your current quota"* on this key's free tier, and other flash models were returning *503 high demand*. The original fallback `gemini-flash-latest` was being called through an endpoint version where it does not exist (404), and only 404 triggered a fallback. Fixed by calling the v1beta REST API directly with verified free-tier models and failing over on 429/5xx/timeouts.
- Gemini Google Search grounding is **not** used. Tavily is the research layer, which keeps usage inside free allowances.

### Connectivity results (`npm run check:providers`, 2026-11-24)
Gemini 2/2 models ✓ · Groq 2/2 ✓ · OpenRouter 1/2 ✓ (`ernie` was temporarily rate-limited upstream, `nemotron` answered) · Tavily ✓.
During the end-to-end run, `gemini-3.1-flash-lite` timed out once and `gemini-flash-lite-latest` answered automatically.

---

## Security
- **Keys** are read only in server modules marked `server-only`, which breaks the build if a browser module imports them. The build output was scanned for all four keys (0 matches), and no browser code contacts a provider. `.env.local` and `.data/` are git-ignored, and `.env.example` contains placeholders only.
- **SSRF protection** (`src/lib/server/net.ts`): http/https on ports 80/443 only, and no credentials in URLs. Every DNS answer must be public: private, loopback, link-local, CGNAT, multicast, reserved, documentation and cloud-metadata ranges are blocked, including IPv4-mapped, NAT64 and 6to4 IPv6. The connection is **pinned to the validated IP** (DNS-rebinding protection). Every redirect hop is re-validated. Limits: max 4 redirects, 150 KB, 5 s per hop and 9 s total. The body is read as text and never executed or rendered, and suspicious sites are never opened in the user's browser. Links inside messages are not fetched unless they are shortened.
- **Prompt injection:** web content goes to AI inside an `<untrusted_web_sources>` block with explicit instructions to ignore it; AI output never affects the score.
- **Input validation and limits** on every API route (JSON size caps, field lengths, enum checks), same-origin checks, per-IP rate limits, and HTML escaping in exported reports.
- **Privacy:** messages are analysed locally on the server. AI receives the evidence summary, not the raw message. Redaction (cards with Luhn check, IBANs, Emirates ID, OTPs, emails, phone digits) is applied to exports, the threat feed and deal AI requests. Capability toggles (live checks / research / AI) in the assistant show exactly what is sent where.

---

## Measured detection accuracy (`npm run eval`, full report in `docs/EVALUATION.md`)
113 labelled cases: real official UAE government, bank and international URLs; synthetic phishing, brand impersonation, deceptive subdomains, Unicode look-alikes, shorteners, fake payment links; Arabic, English and mixed messages (scam and benign); ambiguous unknown sites; synthetic vehicle and plate deals. Positive = score ≥ 50.

| Set | N | Accuracy | Precision | Recall | F1 | FPR | FNR |
|---|---|---|---|---|---|---|---|
| All | 113 | 98.2% | 100.0% | 96.6% | 98.3% | 0.0% | 3.4% |
| URLs | 69 | 98.6% | 100.0% | 97.0% | 98.5% | 0.0% | 3.0% |
| Messages | 32 | 96.9% | 100.0% | 95.0% | 97.4% | 0.0% | 5.0% |
| Secure Deal | 12 | 100% | 100% | 100% | 100% | 0.0% | 0.0% |

**Read with care:** the first, unadjusted run scored 94.7% accuracy / 89.8% recall. Two rule gaps it exposed were then fixed, so the numbers above may be optimistic. The dataset was written by the same team as the rules, so this is a sanity benchmark, not independent validation, and it makes no claim about any hidden judging dataset. Live checks and AI are not part of the benchmark.

---

## Project structure
```
src/app/                 pages: / · /assistant · /deal · /deal/new · /deal/view
src/app/api/             analyze · ai/explain · ai/status · threats · deals · deals/[id] · deals/[id]/ai · deals/seed
src/lib/analysis/        url · email (messages) · business (listings/phones) · social · report · domain · export
src/lib/server/          pipeline · net (SSRF-safe fetch) · intel (RDAP/DNS) · research (Tavily) · threats · deals · util
src/lib/ai/              contract (evidence, prompt, validation) · orchestrator.server (failover) · client
src/lib/deal/            engine (state machine + risk) · validators (VIN/IBAN/plate) · client
src/data/                brands (verified official domains) · samples (synthetic)
eval/                    dataset + benchmark          scripts/   provider check · domain verification
tests/                   unit tests                   docs/      EVALUATION · PRESENTATION · domain verification evidence
```

## Limitations
- Prototype: no user accounts. The Secure Deal role switch (buyer / seller / reviewer) is for demonstration, and the server trusts the role the client claims.
- Payments, escrow, ownership transfer and release are simulated. There is no RTA / ITC / MOI / bank / registry integration, no plate valuation, and no document authentication.
- No threat-intelligence blocklists (Safe Browsing, VirusTotal) and no page-content rendering. `.ae` domains have no public RDAP, so their age cannot be checked.
- Research depends on Tavily's index. "No public reports found" never means "safe".
- Data is stored in local JSON files (`.data/`). A production deployment needs a database. Rate limits and caches are per server process.
- Free-tier AI capacity varies (we observed 429/503/timeouts). The report always works without AI.
- The evaluation dataset is small and self-authored (see above).

## Future authorized integration pathway
1. **Abu Dhabi Police / Dubai Police:** a reporting API so exported AMAN reports (already structured JSON with IDs, timestamps, sources and redaction) can be submitted to official reporting channels with user consent, plus a feed of police-confirmed scam domains and numbers to replace public-web research for those items.
2. **TDRA / CSC / domain registry (aeDA):** official takedown-request workflow for impersonation domains, and `.ae` registration data where policy allows.
3. **RTA / ITC / licensing authorities:** authorized vehicle and plate ownership verification and real transfer status to replace the simulated steps (the engine already isolates these as discrete states).
4. **Licensed escrow / bank partner, Central Bank framework:** real payment holding and release, beneficiary-name verification for IBANs.
5. **UAE PASS:** verified identities for buyers, sellers and reviewers instead of the demo role switch.

## One-minute demo
1. **Assistant → "SMS / WhatsApp / email" → "Traffic fine SMS (AR/EN)" → Analyze.** Show *Dangerous*, the fake-traffic-fine scenario, the **official website comparison** (Abu Dhabi Police: `adpolice.gov.ae` vs. the link), the **registry fact** (the link's domain is not registered), the **scam-warning sources with links and timestamps**, and the **AI Analysis Completed** card naming the provider. Toggle **العربية**.
2. **"Check a link" → "Deceptive subdomain".** `dubaipolice.gov.ae.fines-portal.online` is flagged; then **Print / Save PDF** to show the exportable report.
3. **Early-warning feed tab:** impersonated organizations and scam patterns from the analyses just run.
4. **Secure Deal → New premium plate deal → "Suspicious" example → Create → attach sample files as Seller, then as Buyer → Submit.** The deal is **automatically flagged** (seller is not the registered owner, account holder mismatch, invalid IBAN, deposit + screenshot conditions). As Reviewer, point out that **payment release is locked**.
