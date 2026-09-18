// Depth-first scan of an already-parsed request value (body, query, param)
// for strings containing a NUL byte. Returns the dotted path of every
// offender ("" is the value itself, e.g. a bare `@Param('id')` string),
// covering nested objects and arrays regardless of any DTO declaration.
// Object *keys* are scanned too. Depth is capped so a hostile deeply
// nested body cannot blow the stack.
const NUL = String.fromCharCode(0);
const MAX_DEPTH = 64;

function printable(key: string): string {
  return key.split(NUL).join('\\u0000');
}

export function findNulPaths(
  value: unknown,
  path = '',
  depth = 0,
  out: string[] = [],
): string[] {
  if (typeof value === 'string') {
    if (value.includes(NUL)) out.push(path);
    return out;
  }
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) {
    return out;
  }
  const join = (key: string) => (path ? `${path}.${key}` : key);
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      findNulPaths(item, join(String(i)), depth + 1, out),
    );
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    const childPath = join(printable(key));
    if (key.includes(NUL)) out.push(childPath);
    findNulPaths(item, childPath, depth + 1, out);
  }
  return out;
}
