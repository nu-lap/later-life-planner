A. Executive summary
- Lint and tests pass: `npm run lint` clean; `npm run test` 193/193 passing.
- Architecture is cleanly split: UI in `src/components`, state in Zustand store, pure financial engine in `src/financialEngine`, and a single API route for AI vision generation.
- The `/api/generate-vision` endpoint is unauthenticated and has no rate limiting or validation, which is a cost/abuse risk.
- Projection calculations are recomputed on many state updates and in multiple components, which can hurt UI responsiveness as data grows.
- The persisted store has no versioning/migration logic, which risks broken sessions after schema changes.
- README states no env vars required, but AI features require `ANTHROPIC_API_KEY`, causing setup confusion.

Overall health: Good core structure and test coverage; main risks are operational/security around the AI endpoint and performance of repeated projection recalculation.

Top 3 risks
1. Public AI endpoint with no auth/rate limit → cost exposure and abuse.
2. Missing request validation/size limits on AI endpoint → unbounded cost + potential denial of service.
3. Projection engine recalculated on most UI changes → UI stalls as scenarios get large.

Top 3 recommended next actions
1. Add validation + rate limiting (or auth) to `/api/generate-vision`.
2. Memoize and/or debounce projection calculations to reduce UI blocking.
3. Add a state version/migration strategy for the persisted store.

B. Architecture overview
- App type: Next.js 14 App Router SPA with one server route (`/api/generate-vision`) for AI text generation.
- Major components:
  - UI: `src/app/page.tsx` orchestrates the 5-step wizard; UI components live in `src/components/**`.
  - State: `src/store/plannerStore.ts` (Zustand with `persist` to localStorage).
  - Domain logic: `src/financialEngine/**` (pure TS financial projection + tax logic).
  - Config: `src/config/financialConstants.ts` centralizes UK tax and pension constants.
- Runtime flow:
  - User lands on `/` → `DisclaimerGate` → wizard steps read/write store.
  - Changes trigger projections for SummaryBar and Dashboard.
  - Optional AI endpoint streams a vision statement to Step 2.

Architectural strengths
- Financial engine is pure and testable; good separation from UI.
- Centralized financial constants reduce drift.
- Tests cover engine logic and key invariants extensively.

Architectural weaknesses
- No validation boundary between UI and API; API trusts client input.
- Heavy compute (projection engine) runs on many UI updates without throttling.
- Persisted store lacks migration strategy.

C. Prioritised findings

[Unauthenticated AI endpoint with no rate limiting]
Severity: high
Confidence: high
Files: `src/app/api/generate-vision/route.ts`
Problem:
The AI endpoint is publicly accessible and streams model output with no authentication or rate limiting. Any visitor can trigger expensive requests.

Impact:
A trivial script can rack up usage costs or exhaust API quotas. This is the highest operational and cost risk in production.

Recommendation:
Add server-side rate limiting (e.g., IP + session), and consider requiring an auth token or signed nonce. At minimum, cap requests per IP and per minute.

[Missing request validation and input limits]
Severity: medium
Confidence: high
Files: `src/app/api/generate-vision/route.ts`
Problem:
`aspirations` and `mode` are accepted from the client without validation or size limits. Large or malformed payloads can be sent.

Impact:
Unbounded input can increase token usage and latency, and raise the risk of prompt injection or unexpected model responses.

Recommendation:
Validate schema (e.g., zod) and clamp list size and total length. Reject invalid `mode` or excessive `aspirations`.

[Projection engine recomputed on many state changes]
Severity: medium
Confidence: medium
Files: `src/components/SummaryBar.tsx`, `src/components/steps/Step4Dashboard.tsx`
Problem:
`calculateProjections` is called in multiple components and re-runs on almost any store change. The state object changes frequently (typing, slider movement).

Impact:
As scenarios become larger or hardware is slow, UI can stutter. This is likely to be the biggest perceived performance issue.

Recommendation:
Use selectors to limit updates, memoize inputs, or debounce recalculations. Consider a derived selector in the store or a worker for heavy computation.

[Persisted store has no migration/version handling]
Severity: medium
Confidence: medium
Files: `src/store/plannerStore.ts`
Problem:
Zustand `persist` stores state under a fixed key but no `version` or `migrate` logic exists.

Impact:
Schema changes can break users’ stored plans or cause runtime errors on load.

Recommendation:
Add `version` and `migrate` to `persist` to handle structural changes safely.

[README contradicts env requirements for AI]
Severity: low
Confidence: high
Files: `README.md`, `.env.example`, `src/app/api/generate-vision/route.ts`
Problem:
README says “No environment variables required,” but Anthropic API key is required for AI features.

Impact:
Confuses onboarding and causes runtime failures for AI features.

Recommendation:
Update README to explicitly list `ANTHROPIC_API_KEY` as optional for AI generation.

D. Security findings
- Public AI endpoint has no auth or rate limiting (`src/app/api/generate-vision/route.ts`).
- No request validation or size limits on AI endpoint (`src/app/api/generate-vision/route.ts`).
- User data persisted in localStorage without encryption (low severity, privacy consideration) (`src/store/plannerStore.ts`).

E. Performance and scalability findings
- `calculateProjections` recomputed on many state changes in SummaryBar and Dashboard, potentially blocking UI (`src/components/SummaryBar.tsx`, `src/components/steps/Step4Dashboard.tsx`).
- Projection runs are O(years) and run multiple times per render, which will scale poorly as life expectancy horizon increases or multiple views are open.

F. Testing gaps
- No tests for `/api/generate-vision` route error handling, validation, or streaming behavior.
- No end-to-end tests for the full wizard flow (state changes across steps, persistence, and dashboard outputs).
- Limited coverage for localStorage persistence and migration behavior.

Highest-value tests to add
1. API route validation + error handling test (missing/invalid fields, missing API key).
2. E2E test: complete wizard flow and verify dashboard outputs (Playwright).
3. Store persistence test: load/upgrade stored state.

G. Quick wins
- Add zod validation and input caps to `/api/generate-vision`.
- Add README note for `ANTHROPIC_API_KEY`.
- Introduce `persist` versioning with a basic migrate function.
- Debounce projection recomputation during slider edits.

H. Suggested refactor plan
Phase 1: urgent fixes
- Add rate limiting or auth for `/api/generate-vision`.
- Validate request payloads and clamp size.

Phase 2: structural cleanup
- Introduce persisted state versioning and migration.
- Centralize projection memoization (store selector or derived data cache).

Phase 3: long-term improvements
- Move heavy projection calc to a Web Worker for smoother UI on large scenarios.
- Add E2E tests for the wizard and dashboard flows.
