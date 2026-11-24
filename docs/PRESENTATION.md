# AMAN AI: Pitch Outline (5 minutes)

## 1. Title
**AMAN AI | أمان**: *Check before you click. Protect before you pay.*
UAE fraud detection with verified evidence, and fraud prevention for vehicle and premium plate sales.

## 2. Problem
- UAE residents receive fake traffic-fine, Salik/Darb toll, delivery-fee and bank-suspension messages in Arabic, English and mixed text, often with look-alike domains.
- Fake "customer service" numbers and sponsored ads impersonate banks and government services.
- Vehicle and premium plate sales lose money to deposits, third-party accounts, sellers who are not the owner, and fake payment screenshots.
- Victims get a verdict without the evidence, so they cannot act or report effectively.

## 3. Solution: exactly two services
1. **AMAN AI Assistant:** detection rules + live domain intelligence (RDAP, DNS, safe HTTPS/redirect inspection) + internet research with cited sources + AI explanation in Arabic and English. Includes an early-warning feed.
2. **AMAN Secure Deal:** vehicles and premium plates only. Consistency checks (VIN year and manufacturer, owner vs. seller, IBAN, duplicates, document reuse), automatic flagging, and a server-enforced 10-step flow where payment can never be released before review (payments and transfers simulated).

## 4. Judging criteria
- **Detection accuracy (30%):** 113-case benchmark: 98.2% accuracy, 100% precision, 96.6% recall, 0% false positives (first unadjusted run 94.7% / 89.8% recall, disclosed). Verified official-domain list (41 orgs, DNS + search evidence).
- **Early detection & coverage (25%):** newly registered domains via RDAP, homographs, deceptive subdomains, shorteners, fake payment links, ads, Maps listings, phone numbers, social accounts, and an early-warning feed.
- **Explainability & actionability (20%):** every finding has its source; facts carry timestamps and links; official-site comparison; evidence sufficiency; a check-status list; PDF/JSON export for reporting.
- **UAE relevance & innovation (15%):** UAE PASS, TAMM, police, MOI, ICP, banks, Salik, Darb, e&, du, Emirates Post; Arabic normalization; vehicle and plate fraud patterns.
- **Feasibility & presentation (10%):** runs on free tiers with automatic Gemini → Groq → OpenRouter → rules failover; works without AI; 64 tests + benchmark in CI.

## 5. Honesty and safety
No claimed partnerships. Simulated steps are labelled at the point of use. No API keys in the browser. SSRF-safe server fetching. AI never changes the score.

## 6. Future authorized integrations
Police reporting API and confirmed-scam feeds · TDRA/registry takedowns · RTA/ITC ownership verification · licensed escrow partner · UAE PASS identities.

## 7. Live demo (1 minute)
See "One-minute demo" in the README.
