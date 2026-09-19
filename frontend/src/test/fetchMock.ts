import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response> | Response
) {
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => impl(String(url), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}
