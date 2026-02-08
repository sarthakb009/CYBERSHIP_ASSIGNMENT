/**
 * Integration tests: OAuth token acquisition, caching, and refresh (stubbed HTTP).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { UpsOAuthClient } from "./auth.js";
import { StubHttpClient } from "../http/stub-client.js";
import { authError, rateLimitError } from "../domain/errors.js";

const baseUrl = "https://wwwcie.ups.com";
const tokenUrl = `${baseUrl}/security/v1/oauth/token`;

function oauthSuccess(expiresIn = 3600): { status: number; body: string } {
  return {
    status: 200,
    body: JSON.stringify({
      access_token: "test-token-123",
      token_type: "Bearer",
      expires_in: expiresIn,
    }),
  };
}

describe("UpsOAuthClient", () => {
  let http: StubHttpClient;
  let client: UpsOAuthClient;

  beforeEach(() => {
    http = new StubHttpClient();
    client = new UpsOAuthClient(
      {
        baseUrl,
        clientId: "client-id",
        clientSecret: "client-secret",
        timeoutMs: 5000,
      },
      http
    );
  });

  it("acquires token and returns it", async () => {
    http.setResponse(oauthSuccess());
    const token = await client.getValidToken();
    expect(token).toBe("test-token-123");
    const requests = http.getRecordedRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain("oauth/token");
    expect(requests[0].headers?.Authorization).toMatch(/^Basic /);
    expect(requests[0].method).toBe("POST");
  });

  it("reuses cached token on second call", async () => {
    http.setResponses([oauthSuccess(3600), oauthSuccess(3600)]);
    const t1 = await client.getValidToken();
    const t2 = await client.getValidToken();
    expect(t1).toBe(t2);
    expect(http.getRecordedRequests()).toHaveLength(1);
  });

  it("refreshes when token is invalidated", async () => {
    http.setResponses([oauthSuccess(), oauthSuccess()]);
    await client.getValidToken();
    client.invalidateToken();
    const token = await client.getValidToken();
    expect(token).toBe("test-token-123");
    expect(http.getRecordedRequests()).toHaveLength(2);
  });

  it("returns AUTH_FAILED on 401", async () => {
    http.setResponse({ status: 401, headers: {}, body: "Unauthorized" });
    await expect(client.getValidToken()).rejects.toMatchObject({
      name: "CarrierIntegrationError",
      details: { code: "AUTH_FAILED" },
    });
  });

  it("returns rate limit error on 429", async () => {
    http.setResponse({
      status: 429,
      headers: { "retry-after": "60" },
      body: "Too Many Requests",
    });
    await expect(client.getValidToken()).rejects.toMatchObject({
      name: "CarrierIntegrationError",
      details: { code: "RATE_LIMITED", httpStatus: 429 },
    });
  });

  it("throws on malformed token response", async () => {
    http.setResponse({
      status: 200,
      headers: {},
      body: JSON.stringify({ no_access_token: true }),
    });
    await expect(client.getValidToken()).rejects.toMatchObject({
      name: "CarrierIntegrationError",
      details: { code: "AUTH_FAILED" },
    });
  });
});
