// Postgres's LIKE/ILIKE treats `%` and `_` as wildcards and `\` as its own
// escape character by default. Every `ilike()` filter in this codebase
// builds its pattern from raw user input, so a search for a fragrance
// literally named e.g. "50%" or "Him_self" would have the `%`/`_` interpreted
// as wildcards instead of the literal characters the caller typed, silently
// matching far more (or less) than intended — not a SQL-injection risk
// (drizzle already parameterizes the value), but a real correctness bug.
// Escape the backslash first, or a backslash inserted below to escape a
// later `%`/`_` would itself get re-escaped by a later replace.
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

// Builds a `%<escaped>%` pattern for a case-insensitive "contains" filter
// (`ilike(column, containsPattern(value))`) — the shape every partial-match
// search in this codebase (fragrance/vendor/user name, vendor website, user
// email) needs.
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
