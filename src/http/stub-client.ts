/**
 * Stub HTTP client for integration tests: record requests and return configured responses.
 */

import type { HttpRequest, HttpResponse, IHttpClient } from "./client.js";

export type StubResponse = HttpResponse | (() => Promise<HttpResponse>);

/**
 * Stub that returns responses in order for each request, or a single response for all.
 * URL or method can be used to dispatch (e.g. OAuth vs Rating).
 */
export class StubHttpClient implements IHttpClient {
  private responses: StubResponse[] = [];
  private recordedRequests: HttpRequest[] = [];

  /** Set one response to return for every request */
  setResponse(res: StubResponse): void {
    this.responses = [res];
  }

  /** Set a sequence of responses (one per request) */
  setResponses(res: StubResponse[]): void {
    this.responses = [...res];
  }

  /** Append a response to the queue */
  addResponse(res: StubResponse): void {
    this.responses.push(res);
  }

  getRecordedRequests(): HttpRequest[] {
    return [...this.recordedRequests];
  }

  /** Clear recorded requests and response queue */
  reset(): void {
    this.recordedRequests = [];
    this.responses = [];
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    this.recordedRequests.push(request);
    const next = this.responses.shift();
    if (next === undefined) {
      return {
        status: 500,
        headers: {},
        body: JSON.stringify({ error: "No stub response configured" }),
      };
    }
    if (typeof next === "function") {
      return next();
    }
    return next;
  }
}
