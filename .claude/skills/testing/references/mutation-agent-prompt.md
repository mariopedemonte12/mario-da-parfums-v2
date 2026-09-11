# Independent mutation-agent prompt

Use this when classical mutation operators (Stryker, or hand-applied arithmetic/relational/boundary flips) plausibly won't hit the domain-specific fault classes that matter for this code — e.g. a swapped business constant, an inverted permission check, an off-by-one in a price/quantity threshold.

## Why independent

Spawn this as a **fresh subagent** (`Agent` tool, `subagent_type: general-purpose`) that has **not** seen the test suite for this module — only the source and the spec. An agent that has read the tests will unconsciously avoid proposing mutants those tests already catch, which defeats the point: you want mutants shaped like bugs a developer could actually introduce, not bugs shaped to survive the current suite.

Do not paste this prompt into the current (testing) session's own reasoning — actually delegate it via the Agent tool so the mutant generation happens without visibility into the tests.

## Prompt template

Fill in the bracketed parts and hand this to a fresh agent:

```
You are generating mutation-testing mutants for a code review exercise. You have NOT seen and must NOT ask to see any test files for this code — work only from the source and the spec below.

SOURCE FILE(S):
[paste the full contents of the file(s) under test, e.g. backend/src/listings/listings.service.ts]

SPEC / INTENDED BEHAVIOR:
[paste or summarize the business rules this code must satisfy — from the PR description, ticket, DTO decorators, or docs. Be concrete: e.g. "quantity must be a positive integer", "only the listing's owner or an admin may update it", "an auction listing must have auctionEndsAt in the future at creation time".]

TASK:
Propose exactly [N, e.g. 8-12] mutants: small, realistic code changes that a developer could plausibly introduce by mistake and that violate the spec above in an observable way. For each mutant:

1. Give a unified diff (or before/after snippet) against the source.
2. State in one sentence which specific spec requirement it violates and how (not "changes a number" — say what real bug this simulates, e.g. "off-by-one: allows quantity=0 through, violating the positive-integer requirement").
3. Rate your confidence (high/medium/low) that this mutant is NOT semantically equivalent to the original (i.e. that some valid test really could observe the difference).

Rules:
- Do not propose mutants that are obviously dead code or unreachable.
- Do not propose trivial always-true/always-false conditional flips unless they correspond to a realistic mistake (e.g. flipping `>` to `>=` at a real boundary is realistic; flipping an unrelated `true` literal is not).
- Prefer mutants that target boundaries, permission/ownership checks, state-transition guards, and business-rule constants over mutants that target logging, formatting, or other non-observable behavior.
- Do not include the string "mutant" or "bug" in the diff itself — just the code change and your one-sentence explanation.

Output as a numbered list, one mutant per entry, in the format above.
```

## Applying the results

Back in the testing session (not the agent):

1. Apply each proposed diff to a scratch copy of the file (or the worktree, one at a time, reverting between mutants — don't leave a mutant applied when done).
2. Run the real test suite against it.
3. Record killed vs. survived per mutant, alongside the agent's confidence rating.
4. Every survivor: write the missing test, or justify equivalence in writing and exclude it — per the main skill's workflow.
