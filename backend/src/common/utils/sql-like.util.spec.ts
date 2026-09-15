import { describe, expect, it } from 'vitest';
import { containsPattern, escapeLikePattern } from './sql-like.util.js';

describe('escapeLikePattern', () => {
  it('leaves a plain string with no LIKE special characters untouched', () => {
    expect(escapeLikePattern('Chanel')).toBe('Chanel');
  });

  it('escapes a literal `%` so it is not treated as a wildcard', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%');
  });

  it('escapes a literal `_` so it is not treated as a single-char wildcard', () => {
    expect(escapeLikePattern('Him_self')).toBe('Him\\_self');
  });

  it('escapes a literal backslash before escaping `%`/`_`, so it is not misread as escaping the next character', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes all three special characters together in the right order', () => {
    // A naive implementation escaping % and _ before \ would turn the
    // backslashes it just inserted into extra (wrong) escape sequences.
    expect(escapeLikePattern('\\%_')).toBe('\\\\\\%\\_');
  });
});

describe('containsPattern', () => {
  it('wraps a plain value in wildcards for a "contains" match', () => {
    expect(containsPattern('Chanel')).toBe('%Chanel%');
  });

  it('escapes special characters before wrapping in wildcards', () => {
    expect(containsPattern('50%_off')).toBe('%50\\%\\_off%');
  });
});
