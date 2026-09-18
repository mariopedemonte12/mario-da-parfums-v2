// Normalizes a free-text search value before validation: trim, split on
// whitespace, drop case-insensitive duplicate tokens (first occurrence wins),
// rejoin with single spaces. Non-strings pass through untouched so the type
// validators still report them. See specs/text-search-partial.md rules 7-8.
export function normalizeSearchText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const token of value.split(/\s+/).filter(Boolean)) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens.join(' ');
}
