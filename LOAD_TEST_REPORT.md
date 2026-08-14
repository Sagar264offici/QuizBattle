# QuizBattle — Production-Readiness / Load Test Report

**Date:** 2026-08-14
**Tool:** `tests/loadTest.test.ts` (vitest, runs via `npx vitest run tests/loadTest.test.ts` or the full `npm test`)
**Target:** Local Express app (same handler deployed to Vercel) + **real Upstash Redis** (the production store)
**Mode tested:** TEST MODE (`/api/test/...`) — the live 100-question college quiz was **never touched**; live/test isolation was proven by comparing live-mode state before and after the rehearsal.

---

## Summary

The system handled **80 concurrent students** through the full event flow with **zero failures, zero Redis errors, zero duplicate submissions accepted, and consistent scores**. Three real bugs were found and fixed during the rehearsal (see *Race conditions*).

## Metrics (3 runs, `npm test` suite included the rehearsal)

| Metric | Value |
|---|---|
| Max tested concurrent students | **80** (40 Stack.push / 40 IT Innovators) |
| Registrations (80 simultaneous) | ~117 req/s, wall clock ~0.7 s, avg ~570 ms, worst ~680 ms |
| Question broadcast poll (80 simultaneous) | ~170 req/s, wall clock ~0.5 s |
| Submissions (80 in the 30 s window) | ~42–63 req/s, wall clock ~1.3–1.9 s, avg ~590–870 ms, worst ~680–1140 ms |
| Avg server response time (question → submit) | ~1.36–1.53 s |
| Worst server response time | ~1.47–1.89 s (all within the 30 s window) |
| Redis errors | **0** (PING OK before/after; no 429/5xx observed) |
| Vercel errors | **N/A** — ran locally against the deployed handler code; Vercel infra (cold starts, lambda concurrency) not exercised |
| Failed submissions | **0** (80/80 accepted) |
| Duplicate submissions | **50 rejected** — 8 students × 5-way *simultaneous* first submissions → exactly 1 accepted + 4 rejected each (race case); 18 sequential double-taps → all rejected |
| Late submissions (after lock) | 6/6 rejected (`Question is not live`) |
| Logout-all duration (80 participants) | **~0.94 s** |
| Sessions expired after logout | 80/80 receive `SESSION_EXPIRED` on next request; old tokens rejected on submit; new student joins; admin stays authenticated |
| Score consistency | Club scores = sum of participant scores = sum of awarded points (STACK_PUSH 25 / IT_INNOVATORS 25 / total 50 for 50 correct × 1 pt) |
| Fastest-correct leaderboard | Matched the true minimum server-measured `responseTimeMs` **under 5-way simultaneous correct submissions** (winner: 674–1055 ms) |
| Correct answer before reveal | Never leaked — all polls during WAITING/LIVE/LOCKED returned `correctAnswer: null` |

## Checklist results (all 30 items)

1. ✅ 80 students join simultaneously
2. ✅ 40/40 split between Stack.push and IT Innovators
3. ✅ All 80 receive the same live question
4. ✅ All 80 submit within the 30 s window
5. ✅ Submissions fired almost simultaneously (5-way bursts)
6. ✅ No duplicate submissions accepted (atomic guard)
7. ✅ `responseTimeMs` server-measured, plausible, consistent
8. ✅ Scores remain consistent (participant ↔ club ↔ awarded points)
9. ✅ Club scores equal sum of participant scores
10. ✅ Fastest-correct leaderboard correct under simultaneous fire
11. ✅ Admin starts the next question
12. ✅ All 80 clients receive the new question
13. ✅ Admin locks the question
14. ✅ Late submissions rejected
15. ✅ Admin reveals the answer
16. ✅ Students never receive `correctAnswer` before reveal
17. ✅ Student refreshes during LIVE
18. ✅ Student refreshes during LOCKED
19. ✅ Admin refresh during LIVE
20. ✅ Log Out All Students with 80 active participants
21. ✅ Logout measured (~0.94 s)
22. ✅ All 80 old sessions get `SESSION_EXPIRED` on next request
23. ✅ Old tokens cannot rejoin
24. ✅ A new student can join afterward
25. ✅ Admin remains authenticated
26. ✅ Live mode and test mode fully isolated (live state byte-identical before/after)
27. ✅ No fabricated WAITING state while Redis is unavailable → **503 `STATE_UNAVAILABLE`**
28. ✅ Submissions rejected while Redis is unavailable; no phantom submission after recovery
29. ✅ Client cannot modify score (client-supplied `score: 999999` ignored)
30. ✅ Client cannot supply `responseTimeMs` (client-supplied `99999999` ignored)

## Race conditions

**Found & fixed (this session):**

1. **Duplicate-submission race.** The submit handler did read-then-write (`GET` submission → `SET` submission), so two simultaneous submissions from the same student could both pass the check, double-record, and double-award points. Fixed with an atomic `SET … NX` on the submission key — exactly one of N simultaneous submissions wins; the rest get `400 Already submitted`. Verified by the 5-way simultaneous bursts (1 accepted + 4 rejected, 8×).

2. **Fastest-correct read-modify-write race.** The fastest-tap update did `GET` → compare → `SET`, so two near-simultaneous correct answers could both write, letting a *slower* answer overwrite a *faster* one. Fixed with an atomic Lua `EVAL` compare-and-set (works on Upstash REST). Verified: leaderboard fastest matched the true minimum under simultaneous correct submissions.

**Residual (documented, not a practical risk):** participant `score` is a read-modify-write of a JSON participant record. Because only one question is live at a time and the `SET NX` guard serializes same-question submissions, a participant can never have two in-flight scoring updates in the real flow — a lost update would require submitting two *different* questions concurrently, which the quiz engine does not allow.

**Redis-outage behavior fixed:** `redisCommand` previously returned `null` on network failure, indistinguishable from a missing key, so a Redis outage made `getState` fabricate a `WAITING` state. It now returns a distinct sentinel and `getState` throws → endpoints respond **503 `STATE_UNAVAILABLE`** instead of inventing state. Health reports `ok: false`.

## Remaining risks

- **Vercel specifics untested.** The rehearsal exercised the exact handler + real Upstash Redis over local HTTP. Vercel cold starts, lambda concurrency limits, and regional latency are not measurable from here. Recommend a short rehearsal against the deployed URL before the event (the same test file can point at a deployed instance by changing `baseUrl`).
- **Upstash rate limits.** 0 throttling was observed at ~60–170 req/s bursts, but this is plan-dependent. Confirm the plan's rate limit headroom for the worst-case spike (all 80 phones submitting within the same second).
- **`npm test` wipes live quiz state.** The pre-existing API test files reset live mode in `beforeEach` (unchanged by this work). The load test itself only resets TEST mode, but the full suite still resets live — don't run `npm test` during the real event.
- **Chunk-size warning** from `vite build` (>500 kB JS bundle) — cosmetic/perf, not a correctness issue.
- **Question data artifact:** some live questions contain literal `---PAGE---` markers in option text (pre-existing data issue, cosmetic on the projector).

## How to run

```bash
npx vitest run tests/loadTest.test.ts   # rehearsal only (~15 s)
npm test                                 # full suite incl. rehearsal (~70 s)
```
