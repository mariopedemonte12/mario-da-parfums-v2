# Backend TODO

## 1. Real Postgres errors always report "Unexpected error"

**Status**: open, found while writing the `listings` integration tests
(testing session, not this worktree's implementation session). Not fixed
here — fixing it means editing service code, which is out of scope for a
testing session per the repo's `CLAUDE.md` ("implementation and testing are
separate sessions").

### The bug

`listings.service.ts` (and, identically, `vendors.service.ts` and
`fragrances.service.ts`) detect a Postgres constraint violation like this:

```ts
interface PgError {
  code?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && 'code' in err;
}
```

This assumes the caught error has `.code` directly on it (the shape the
`pg` driver itself throws). But the `drizzle-orm` version pinned in this
repo (`0.45.2`) wraps every real driver error in a `DrizzleQueryError`
whose own top-level object has **no** `code` property — the real Postgres
error (with `.code`) is nested at `err.cause`, i.e. `err.cause.code`, not
`err.code`.

Confirmed directly against the real Postgres container:

```
err.constructor.name: DrizzleQueryError
'code' in err: false
err.code: undefined
err.cause.code: '23502'   // (or '23505' / '23503' for unique/FK violations)
```

So `isPgError()` always returns `false` for a real error, and
`describeWriteError()` (`listings.service.ts`) / `isUniqueViolation()`
(`vendors.service.ts`, `fragrances.service.ts`) always fall through to the
generic branch.

### Impact

For `listings` specifically, every batch write (`POST`/`PATCH`
`/listings/batch`) that hits a real constraint violation reports the
generic `"Unexpected error"` instead of the spec-documented per-item
message:

- A duplicate `(vendorId, fragranceId, sizeMl)` should report *"A listing
  for this vendor/fragrance/size already exists"* (per
  `specs/listings-crud.md`) — currently reports `"Unexpected error"`.
- An unknown `fragranceId`/`vendorId` (FK violation) should report
  *"Fragrance or vendor not found"* — currently reports `"Unexpected
  error"`.

The partial-success guarantee itself is **not** broken — the batch still
isn't aborted, and the item's `success: false` is still correct — only the
`error` text is wrong. But callers (the frontend, an admin, anyone
inspecting the batch response) can no longer distinguish "you tried to
create a duplicate" from "you referenced a fragrance/vendor that doesn't
exist" from "something unrelated broke" — they all look identical.

This is a **pre-existing pattern inherited from `vendors`/`fragrances`**,
not something introduced by the `listings` implementation — but it's
confirmed failing for `listings` specifically (see below), and the same
root cause almost certainly reproduces in the other two modules too (their
`isUniqueViolation`/error-mapping helpers use the exact same `'code' in
err` check).

### Evidence — 4 failing e2e tests

`backend/test/listings.e2e-spec.ts` (run against the real Postgres
container, root `docker-compose.yml`) has 4 tests that currently fail
because of this, each with a `KNOWN BUG` comment pointing back here:

- `POST /listings/batch — real unique + FK constraints > reports a real
  duplicate (vendorId, fragranceId, sizeMl) as a per-item failure without
  aborting the batch`
- `POST /listings/batch — real unique + FK constraints > reports an
  unknown fragranceId/vendorId as a per-item FK failure without aborting
  the batch`
- `PATCH /listings/batch — real constraints on update > reports moving to
  an existing (vendorId, fragranceId, sizeMl) combo as a per-item conflict`
- `PATCH /listings/batch — real constraints on update > reports
  repointing to an unknown vendorId as a per-item FK failure`

Run them with:

```sh
cd backend
pnpm test:e2e -- listings
```

(needs the Postgres container from root `docker-compose.yml` up; the
spec sets sane `DATABASE_URL`/`JWT_SECRET` defaults itself if no `.env` is
present).

The rest of the suite (19/23 e2e tests, and all 368 unit tests) passes —
this is the one open item from the testing pass.

### Suggested fix

Unwrap the driver error before checking `.code`, e.g. in
`listings.service.ts`:

```ts
function isPgError(err: unknown): err is PgError {
  const candidate =
    typeof err === 'object' && err !== null && 'cause' in err
      ? (err as { cause?: unknown }).cause
      : err;
  return typeof candidate === 'object' && candidate !== null && 'code' in candidate;
}
```

(and read `.code` off the unwrapped `candidate`, not `err`). The same fix
shape applies to `isUniqueViolation()` in `vendors.service.ts` and
`fragrances.service.ts`, plus their own FK-violation handling if any.

Once fixed, the 4 e2e tests above should go green with no test changes —
they already assert the spec-documented messages, not the current
"Unexpected error" behavior.

**Who should pick this up**: an **implementation session** against this
same worktree (or a follow-up one) — not a testing session. Recommend
fixing all three modules (`listings`, `vendors`, `fragrances`) together in
one pass, since it's the same root cause and the same fix shape in each.

## 2. Run mutation testing and review the results

Run mutation testing (`pnpm test:mutation`, powered by Stryker + Vitest,
config in `stryker.config.json`) and review the mutation score / surviving
mutants. Not run yet as part of the tooling setup — needs to be executed
against the current test suite at some point.
