---
name: testing
description: "Use whenever writing, reviewing, or evaluating tests in this repo (backend/frontend/chatbot) — unit tests, integration/e2e tests, deciding how much test to write for a change, generating hard-to-craft inputs, or judging test-suite quality with mutation testing. Triggers: \"write tests for X\", \"test this module/service/controller\", \"testear\", \"escribir pruebas\", \"add unit/integration tests\", \"mutation testing\", \"mutation score\", \"is this well tested\", \"fuzz this input\"."
---

# Testing

How tests get designed and evaluated in this repo. This is a companion to the root [`CLAUDE.md`](../../../CLAUDE.md) "Implementation and testing are separate sessions" rule: this skill is meant to run in the **testing session**, treating the implementation as a black box behind its spec, not as source to imitate.

## Scope gate — decide before writing anything

Every executable module/file needs unit tests. Whether it *also* needs integration tests depends on the feature, not on habit:

- **Unit tests only** (default): simple modifications, single-service logic, DTO validation, pure functions, anything whose correctness can be judged by mocking one boundary (e.g. Drizzle at the repository call, per `backend/CLAUDE.md`).
- **Add integration tests on top** only when the feature's correctness genuinely depends on real interaction between components that a mock would paper over: a DB constraint/transaction, a multi-module workflow, an auth flow spanning guard+strategy+service, anything where the bug you're worried about lives *between* units rather than inside one.
- If you're unsure which bucket a feature falls into, ask: "could this break in a way that only shows up when two real components touch?" No → unit only. Don't manufacture an e2e test for a one-line validation tweak.

## Philosophy: black-box first

Tests are written against the **specification**, not the implementation:

- The primary source of truth is the feature's `specs/<feature-slug>.md` file (root `CLAUDE.md` convention) — the agreed record of what the requirement means. Derive expected behavior from it first, falling back to DTO decorators, HTTP status/shape contracts, and other documented business rules only where the spec file doesn't cover something.
- If the only way to know what a test should assert is "read the implementation and copy its behavior," stop — that's a sign the spec file is missing or incomplete. Update `specs/<feature-slug>.md` with the user rather than guessing. A test that just mirrors the implementation can't catch a bug in that implementation.
- Never assert on private state, internal call counts to collaborators that aren't part of the contract, or implementation-only side effects.

## Test design techniques

Apply in this order per unit under test. Each technique is a case-generation method, not optional flavor — skip a technique only when it doesn't apply (noted below), not because it's more work.

### 1. Boundary Value Analysis — two-point

For every ordered input domain the spec implies (numeric ranges, string/array lengths, dates, enums with an order), find every boundary and test **exactly two points per boundary**: the boundary value itself and its nearest neighbor across the line (e.g. `min` and `min − 1`; `max` and `max + 1`; length `0` and `-1`/empty vs one-under).

- Every `class-validator` decorator is its own boundary, not just the overall domain: `@Min(0)` → test `0` and `-1`. `@Length(1, 100)` → test `1`/`0` and `100`/`101`. `@IsPositive()` → test `0`/smallest-positive... etc.
- Two points, not three — don't also test a "typical middle" value under this technique (that's implicitly covered by the happy-path case you already need).

See `references/boundary-and-decision.md` for a worked example.

### 2. Decision / Condition Analysis

Enumerate every boolean condition the spec exposes: guard clauses, `@ValidateIf`, role/permission checks, feature flags, nullable/optional fields that change behavior, `if`/`switch` branches implied by business rules.

- Build a decision table of conditions × outcomes. Cover every combination the spec allows to be reachable.
- Full combinatorial coverage for ≤ 3–4 independent conditions. Beyond that, downgrade to pairwise coverage and say so explicitly (in the test file comment or PR description) — don't silently under-cover without noting it.
- Each row is at minimum one test case.

### 3. Finite-State coverage — 0-switch — only when the feature has explicit state

Applies to status enums, workflow/lifecycle transitions (order status, listing state, token/session lifecycle) — skip entirely for stateless CRUD/DTO logic.

- Model the states and the legal transitions from the spec (not from whatever the code currently allows — if the code allows an illegal transition, that's a bug to report, not a transition to test as valid).
- **0-switch coverage**: every transition (edge), not just every state (node), must be exercised by at least one test. List the transition table (as a comment or in the PR description) so coverage is auditable at a glance.
- Also test at least one illegal transition per state to confirm it's rejected, if the spec defines illegal transitions.

## Generating hard-to-construct inputs — search-based fuzzing (hill climbing)

Manual construction (from BVA / decision tables / FSM transitions) is always preferred — reach for fuzzing only when a value must satisfy several interacting constraints at once and hand-deriving it is impractical (e.g. a payload that passes three chained validators but should trip a fourth; an input that only reveals an off-by-one deep inside a computed expression).

Recipe:
1. Define a fitness function = distance to the target condition (e.g. `abs(computedValue - threshold)`, or count of still-failing validators).
2. Seed from the nearest BVA value you already have.
3. Mutate by small deltas (±1, ±epsilon, adjacent character/byte edits for strings); accept a mutation only if it strictly improves fitness (hill climbing, not random restart).
4. Stop on hit, or after a fixed budget (e.g. 200 iterations) — if the budget is exhausted, that's a signal the constraint may be unsatisfiable, worth a comment.
5. Once found, hard-code the discovered value as a literal in the test with a one-line comment explaining what it targets. Don't ship the fuzzer itself as runtime test infrastructure — it's a one-time case-generation tool, not a test.

## Evaluating suite quality — mutation testing

The quality metric is **mutation score**:

```
mutation score = killed mutants / (total mutants − equivalent mutants)
```

A green test suite proves nothing by itself — it only means the tests you thought to write pass. Mutation score measures whether those tests would actually catch a real bug.

Two ways to generate mutants — use classical operators as the default, reach for an LLM-adversarial pass when you suspect classical operators won't hit the domain-specific fault classes that matter here (a swapped pricing constant, a subtly wrong validation threshold, an inverted permission check):

- **Classical mutation operators** (default): arithmetic/relational/logical operator flips, boundary shifts, statement/return deletion, conditional negation. Apply via a mutation-testing tool for the stack in use (e.g. Stryker for the backend's TS/Vitest setup) once configured, or by hand for a small, targeted set of mutants when tooling isn't set up for the package yet.
- **LLM-adversarial mutants**: spawn an **independent** agent (a fresh subagent that has not seen the test suite) to propose realistic, spec-grounded bugs — not silly always-true/false flips. Use the ready-to-fill prompt in `references/mutation-agent-prompt.md`. Independence matters for the same reason implementation and testing are separate sessions in this repo: an agent that has seen the tests will unconsciously avoid proposing mutants those tests happen to catch.

Workflow:
1. Generate mutants (tool or agent).
2. Apply one mutant at a time, run the real test suite against it.
3. Mutant is **killed** if any test fails, **survived** if the suite stays green.
4. For every survivor: either write the missing test that kills it, or mark it explicitly **equivalent** (same observable behavior as the original — write down why) and exclude it from the denominator. Never leave a survivor unexamined.
5. There is no fixed universal target score — but a feature isn't "tested" while it has unexamined survivors. Drive the survivor list to zero (killed or justified-equivalent) before calling the suite done.

## Session flow

1. Confirm this is the **testing** session for the worktree (not the implementation session) — per root `CLAUDE.md`.
2. Query graphify first for what the module/feature touches (`/graphify query "..."` or `/graphify explain "<Module>"`) instead of re-reading the whole codebase.
3. Recover the spec from `specs/<feature-slug>.md` first, falling back to DTO decorators and other business-rule docs for anything it doesn't cover — not the implementation internals.
4. Apply the scope gate above: unit only, or unit + integration.
5. Design cases: BVA → decision table → (if stateful) 0-switch transitions.
6. Fill in genuinely hard-to-construct cases via hill-climbing fuzzing (only where manual derivation fails).
7. Write the tests — see stack notes below for file placement/conventions.
8. Run the suite, confirm green, and confirm it's testing the spec (re-read each test and ask "would this fail if the spec were violated, independent of how it's implemented?").
9. Run mutation testing (tool and/or independent agent), drive every survivor to killed-or-justified-equivalent.
10. Update the docs mirror (`test_docs/`) and the graphify graph (`/graphify --update`) before ending the session, per root conventions.

## Stack notes

- **Backend** (NestJS + Vitest + Drizzle, see `backend/CLAUDE.md`): unit tests are `*.spec.ts` next to the code, mocking Drizzle/db access at the service boundary. Integration/e2e tests live in `test/` and run via `vitest.config.e2e.ts` against a real test database — reserve these for the cases the scope gate above actually calls for, not by default per module. Run `pnpm test`, `pnpm test:cov`, `pnpm test:e2e`.
- **Frontend / chatbot**: not yet scaffolded (no test tooling configured). When either package gets a test setup, add a stack-notes entry here rather than duplicating the philosophy sections above.
