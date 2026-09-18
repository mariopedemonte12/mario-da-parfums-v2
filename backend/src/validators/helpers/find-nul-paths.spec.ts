import { findNulPaths } from './find-nul-paths.js';

const NUL = String.fromCharCode(0);

describe('findNulPaths', () => {
  it('returns [] for clean input and non-string values', () => {
    expect(
      findNulPaths({ a: 'x', b: 1, c: null, d: true, e: undefined }),
    ).toEqual([]);
    expect(findNulPaths(42)).toEqual([]);
    expect(findNulPaths(null)).toEqual([]);
  });

  it('flags a bare string with an empty path', () => {
    expect(findNulPaths(`a${NUL}b`)).toEqual(['']);
  });

  it.each([`${NUL}x`, `x${NUL}`, `x${NUL}y`, NUL])(
    'flags NUL at any position: %j',
    (v) => {
      expect(findNulPaths({ name: v })).toEqual(['name']);
    },
  );

  it('reports dotted paths through objects and arrays', () => {
    const body = {
      items: [{ name: 'ok' }, { name: `b${NUL}` }],
      meta: { tag: `t${NUL}` },
    };
    expect(findNulPaths(body)).toEqual(['items.1.name', 'meta.tag']);
  });

  it('flags NUL in object keys', () => {
    expect(findNulPaths({ [`k${NUL}`]: 'v' })).toEqual(['k\\u0000']);
  });

  it('does not overflow the stack on hostile nesting', () => {
    let v: unknown = `x${NUL}`;
    for (let i = 0; i < 100000; i++) v = { a: v };
    expect(() => findNulPaths(v)).not.toThrow();
  });
});
