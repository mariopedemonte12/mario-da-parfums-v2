// Spec sources: specs/auth-pages.md (credentials: 'include' on every call),
// backend error envelope (lib/api/errors.ts), specs/auth-logout-conflict-messages.md
// (logout answers 204 No Content).
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, stubFetch } from "@/test/fetchMock";

import { createApiClient } from "./client";
import { ApiError } from "./errors";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createApiClient", () => {
  it("get: prefixes base url, sends credentials 'include', parses JSON", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ a: 1 }));
    const api = createApiClient("http://api");
    await expect(api.get("/x?y=1")).resolves.toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledWith("http://api/x?y=1", { credentials: "include" });
  });

  it("post/delete: method, JSON header, body (defaults to {}), credentials", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    const api = createApiClient("http://api");
    await api.post("/p", { k: "v" });
    await api.post("/p");
    await api.delete("/d", { ids: [1] });
    const [, post1] = fetchMock.mock.calls[0];
    const [, post2] = fetchMock.mock.calls[1];
    const [, del] = fetchMock.mock.calls[2];
    expect(post1).toMatchObject({ method: "POST", credentials: "include" });
    expect((post1?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(post1?.body).toBe('{"k":"v"}');
    expect(post2?.body).toBe("{}");
    expect(del).toMatchObject({ method: "DELETE", body: '{"ids":[1]}' });
  });

  it("withCredentials:false omits credentials (similarity server has no session)", async () => {
    const fetchMock = stubFetch(() => jsonResponse({}));
    const api = createApiClient("http://q", { withCredentials: false });
    await api.get("/search");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("omit");
  });

  it("non-OK with the backend envelope: ApiError with status, message and field errors", async () => {
    const errors = [{ field: "name", errors: [{ code: "TOO_SHORT", meta: { min: 3 } }] }];
    stubFetch(() => jsonResponse({ statusCode: 400, message: "Validation failed", errors }, 400));
    const api = createApiClient("http://api");
    const error = (await api.post("/x").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Validation failed");
    expect(error.fieldError("name")?.errors[0].meta).toEqual({ min: 3 });
    expect(error.fieldError("other")).toBeUndefined();
  });

  it("non-OK without message falls back to statusText", async () => {
    stubFetch(() => new Response("{}", { status: 503, statusText: "Service Unavailable" }));
    const error = (await createApiClient("http://api").get("/x").catch((e) => e)) as ApiError;
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe("Service Unavailable");
  });

  it("non-OK with a non-JSON body still throws ApiError", async () => {
    stubFetch(() => new Response("oops", { status: 500, statusText: "ISE" }));
    const error = (await createApiClient("http://api").delete("/x").catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(500);
  });

  it("network failure propagates the fetch rejection", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(createApiClient("http://api").get("/x")).rejects.toBeInstanceOf(TypeError);
  });

  it("a 204 response resolves with an empty result instead of throwing", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    await expect(createApiClient("http://api").post("/auths/logout")).resolves.toBeUndefined();
  });

  it("a 200 with an empty body resolves with an empty result on get and delete", async () => {
    stubFetch(() => new Response("", { status: 200 }));
    const api = createApiClient("http://api");
    await expect(api.get("/x")).resolves.toBeUndefined();
    await expect(api.delete("/x")).resolves.toBeUndefined();
  });
});
