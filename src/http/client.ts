/**
 * HTTP client abstraction. Allows stubbing in tests without touching carrier logic.
 */

export interface HttpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface HttpError extends Error {
  readonly request: HttpRequest;
  readonly response?: HttpResponse;
  readonly code?: "ETIMEDOUT" | "ECONNRESET" | "ENOTFOUND" | "ABORT_ERR";
}

/**
 * Minimal HTTP client interface. Default implementation uses global fetch.
 * Tests inject a stub that returns controlled responses.
 */
export interface IHttpClient {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/**
 * Default implementation using fetch with timeout.
 */
export class FetchHttpClient implements IHttpClient {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      request.timeoutMs ?? 30_000
    );
    try {
      const res = await fetch(request.url, {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          ...request.headers,
        },
        body: request.body,
        signal: controller.signal,
      });
      const body = await res.text();
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => (headers[k] = v));
      return { status: res.status, headers, body };
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.name === "AbortError") {
        const timeoutErr = Object.assign(new Error(`Request timed out: ${request.url}`), {
          request,
          code: "ETIMEDOUT" as const,
        }) as HttpError;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
