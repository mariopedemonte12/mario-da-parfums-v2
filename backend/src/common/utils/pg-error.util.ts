interface PgError {
  code?: string;
}

function isPgError(value: unknown): value is PgError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

// drizzle-orm (0.45.x) wraps every real driver error in a DrizzleQueryError
// whose own top-level shape has no `code` — the original pg error (and its
// `code`, e.g. '23505' for a unique violation, '23503' for a foreign-key
// violation) lives on `.cause`. Check both so a real constraint violation is
// actually recognized instead of falling through to a generic 500. Shared by
// every service that inserts/updates rows with a unique or FK constraint.
export function getPgErrorCode(err: unknown): string | undefined {
  if (isPgError(err) && err.code) return err.code;
  if (err instanceof Error && isPgError(err.cause)) return err.cause.code;
  return undefined;
}
