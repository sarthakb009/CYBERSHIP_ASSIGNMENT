/**
 * UPS OAuth 2.0 client-credentials flow: token acquisition, caching, and transparent refresh.
 * Callers never deal with tokens; the rate operation requests a valid token when needed.
 */

import type { IHttpClient } from "../http/client.js";
import { authError, rateLimitError, timeoutError } from "../domain/errors.js";
import type { HttpError } from "../http/client.js";

const UPS_OAUTH_PATH = "/security/v1/oauth/token";

export interface UpsAuthConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Full token URL overrides baseUrl + path if set */
  tokenUrl?: string;
  timeoutMs?: number;
}

export interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

/**
 * Cached token is considered valid if it expires more than this many ms from now.
 * Refresh before actual expiry to avoid race conditions.
 */
const REFRESH_BUFFER_MS = 60 * 1000; // 1 minute

function isTokenValid(cached: CachedToken | null): boolean {
  if (!cached) return false;
  return Date.now() < cached.expiresAtMs - REFRESH_BUFFER_MS;
}

/**
 * UPS OAuth client: obtains and caches access tokens, refreshes when expired.
 * Thread-safety: single in-flight request for a new token; callers await the same promise.
 */
export class UpsOAuthClient {
  private readonly config: UpsAuthConfig;
  private readonly http: IHttpClient;
  private cached: CachedToken | null = null;
  private refreshPromise: Promise<CachedToken> | null = null;

  constructor(config: UpsAuthConfig, http: IHttpClient) {
    this.config = config;
    this.http = http;
  }

  /**
   * Returns a valid access token, acquiring or refreshing as needed.
   * Transparent to caller: they never see expiry or refresh logic.
   */
  async getValidToken(): Promise<string> {
    if (isTokenValid(this.cached)) {
      return this.cached!.accessToken;
    }
    if (this.refreshPromise) {
      const token = await this.refreshPromise;
      return token.accessToken;
    }
    this.refreshPromise = this.acquireToken();
    try {
      const token = await this.refreshPromise;
      this.cached = token;
      return token.accessToken;
    } finally {
      this.refreshPromise = null;
    }
  }

  /** Force next call to getValidToken() to fetch a new token (e.g. after 401). */
  invalidateToken(): void {
    this.cached = null;
    this.refreshPromise = null;
  }

  private get tokenUrl(): string {
    if (this.config.tokenUrl) return this.config.tokenUrl;
    const base = this.config.baseUrl.replace(/\/$/, "");
    return `${base}${UPS_OAUTH_PATH}`;
  }

  private async acquireToken(): Promise<CachedToken> {
    const url = this.tokenUrl;
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const auth = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      "utf-8"
    ).toString("base64");

    try {
      const res = await this.http.send({
        method: "POST",
        url,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${auth}`,
        },
        body: body.toString(),
        timeoutMs: this.config.timeoutMs ?? 15_000,
      });

      if (res.status === 429) {
        const retryAfter = res.headers["retry-after"];
        throw rateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      if (res.status === 401 || res.status === 403) {
        throw authError(
          `UPS OAuth failed with ${res.status}. Check client credentials.`,
          res.body
        );
      }
      if (res.status !== 200) {
        throw authError(
          `UPS OAuth returned ${res.status}: ${res.body.slice(0, 200)}`,
          res.body
        );
      }

      const data = parseOAuthResponse(res.body);
      const expiresInSeconds = data.expires_in ?? 3600;
      return {
        accessToken: data.access_token,
        expiresAtMs: Date.now() + expiresInSeconds * 1000,
      };
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as HttpError).code === "ETIMEDOUT") {
        throw timeoutError("UPS OAuth token request");
      }
      throw err;
    }
  }
}

interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

function parseOAuthResponse(body: string): OAuthTokenResponse {
  try {
    const data = JSON.parse(body) as unknown;
    if (typeof data !== "object" || data === null || !("access_token" in data)) {
      throw new Error("Missing access_token in OAuth response");
    }
    const token = (data as Record<string, unknown>).access_token;
    if (typeof token !== "string") {
      throw new Error("access_token is not a string");
    }
    let expires_in: number | undefined;
    if ("expires_in" in data && typeof (data as Record<string, unknown>).expires_in === "number") {
      expires_in = (data as Record<string, unknown>).expires_in as number;
    }
    return { access_token: token, expires_in };
  } catch (e) {
    throw authError("Malformed OAuth token response", e);
  }
}
