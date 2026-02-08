# Cybership Carrier Integration Service

A TypeScript shipping carrier integration service that wraps the **UPS Rating API** for rate shopping. Built as a production-style module that can be extended to support additional carriers (FedEx, USPS, DHL) and operations (labels, tracking, address validation) without rewriting existing code.

## Design Decisions

### 1. Extensible architecture

- **Carrier-agnostic domain**: `RateRequest`, `RateResponse`, `Address`, `Package`, and `RateQuote` live in `src/domain/`. Callers never see UPS-specific request/response shapes.
- **Adapter pattern**: Each carrier implements `CarrierAdapter` (with a `rate: RateOperation`). Adding FedEx means implementing a new adapter and registering it; UPS code is untouched.
- **Operations as first-class**: The same pattern can be used for `TrackingOperation`, `LabelOperation`, etc. Each operation is a clear interface; adapters implement the ones they support.

### 2. Authentication

- **UPS OAuth 2.0 client-credentials**: Implemented in `src/ups/auth.ts`. Token is acquired once, cached in memory, and refreshed when expired (with a 1-minute buffer). Callers use `getValidToken()` and never handle expiry.
- **401 handling**: If the Rating API returns 401, the adapter invalidates the cached token so the next call will obtain a new one.

### 3. Configuration

- All secrets and environment-specific values come from **environment variables**. Validated at load via Zod in `src/config.ts`. No hardcoded credentials.
- `.env.example` lists every variable; copy to `.env` and fill in.

### 4. Types and validation

- **Strong types**: Domain and UPS API types are in TypeScript; UPS request/response DTOs are in `src/ups/rating-types.ts` and never exported to callers.
- **Runtime validation**: Zod schemas in `src/domain/validation.ts` validate `RateRequest` (and nested address/package) before any external call. Invalid input yields a structured `VALIDATION_ERROR`.

### 5. Error handling

- **Structured errors**: `CarrierIntegrationError` with `code`, `message`, optional `httpStatus`, `carrierCode`, `carrierMessage`, and `requestId`. No swallowed exceptions.
- **Failure modes covered**: Auth failures, 4xx/5xx, rate limiting (429), timeouts, malformed JSON. Each maps to a specific error code and message.

### 6. HTTP and testability

- **`IHttpClient`**: All outbound HTTP goes through this interface. Production uses `FetchHttpClient`; tests use `StubHttpClient`, which records requests and returns configured responses. No live API calls in tests.

### 7. Integration tests

- Tests use **stubbed HTTP** and realistic UPS-shaped payloads (from the Rating API docs). They verify:
  - Request payloads are correctly built from domain models (path, body, headers).
  - Successful responses are parsed and normalized into `RateQuote[]`.
  - Auth token lifecycle: acquisition, reuse, invalidate on 401.
  - Error paths: 400, 401, 429, 500, malformed JSON produce the expected structured errors.
  - Validation: invalid input returns `VALIDATION_ERROR` and no HTTP request is made.

## Project structure

```
src/
  config.ts           # Env-based config and validation
  domain/
    types.ts          # RateRequest, RateResponse, Address, Package, RateQuote
    validation.ts     # Zod schemas and parseRateRequest
    errors.ts         # CarrierIntegrationError and helpers
  carriers/
    types.ts          # CarrierAdapter, RateOperation, CarrierResult
  http/
    client.ts         # IHttpClient, FetchHttpClient
    stub-client.ts    # StubHttpClient for tests
  ups/
    auth.ts           # UpsOAuthClient (token acquire, cache, refresh)
    rating-types.ts   # UPS API request/response DTOs
    rating-mapper.ts  # buildUpsRateRequest, parseUpsRateResponse
    rating.ts         # UpsRateOperation (getRates with auth and error handling)
    adapter.ts        # createUpsAdapter
  service/
    carrier-service.ts  # CarrierService (validation + delegate to adapters)
  demo/
    cli.ts            # Simple CLI demo
  index.ts            # Public API
```

## How to run

### Prerequisites

- Node.js 18+
- (Optional) UPS API credentials for live calls

### Install and build

```bash
npm install
npm run build
```

### Tests (no API key required)

```bash
npm test
```

All tests use the stubbed HTTP client; no live UPS calls.

### Demo CLI (requires credentials)

Copy `.env.example` to `.env` and set:

- `UPS_CLIENT_ID`
- `UPS_CLIENT_SECRET`

Then:

```bash
npm run demo
```

Without valid credentials, `loadConfig()` will throw (missing required env). To run the demo against stubbed responses, you would wire a `StubHttpClient` and avoid `loadConfig()` in the demo script (or use a test-only config path).

### Using the service in code

```ts
import {
  CarrierService,
  createUpsAdapter,
  FetchHttpClient,
  loadConfig,
} from "cybership-carrier-integration";

const config = loadConfig(process.env);
const http = new FetchHttpClient();
const ups = createUpsAdapter(
  {
    baseUrl: config.UPS_BASE_URL,
    clientId: config.UPS_CLIENT_ID,
    clientSecret: config.UPS_CLIENT_SECRET,
    transactionSource: config.TRANSACTION_SOURCE,
  },
  http
);
const service = new CarrierService({
  carriers: new Map([["ups", ups]]),
  defaultCarrierIds: ["ups"],
});

const result = await service.getRates({
  origin: { addressLines: ["123 Main St"], city: "Timonium", stateProvinceCode: "MD", postalCode: "21093", countryCode: "US" },
  destination: { addressLines: ["456 Oak Ave"], city: "Alpharetta", stateProvinceCode: "GA", postalCode: "30005", countryCode: "US" },
  package: { length: 5, width: 5, height: 5, dimensionUnit: "in", weight: 1, weightUnit: "lb" },
});

if (result.ok) {
  console.log(result.value.quotes);
} else {
  console.error(result.error.details);
}
```

## Environment variables (.env.example)

See [.env.example](.env.example) for the full list. Required for live UPS:

- `UPS_CLIENT_ID`
- `UPS_CLIENT_SECRET`

Optional: `UPS_BASE_URL`, `UPS_OAUTH_TOKEN_URL`, `HTTP_TIMEOUT_MS`, `HTTP_TIMEOUT_RATE_MS`, `TRANSACTION_SOURCE`.

## What I would improve with more time

1. **Token refresh on expiry**: Add a background refresh (or refresh when we get close to expiry) so the first request after a long idle period doesn’t pay the token latency. Optionally use `expires_in` from the OAuth response to schedule refresh.
2. **Retries**: For transient failures (5xx, timeouts), add a small retry policy with backoff and only for idempotent operations.
3. **Logging and observability**: Structured logger (e.g. request id, carrier, operation, duration, error code) and optional metrics (rate call count, latency, errors by code).
4. **FedEx/USPS stubs**: Implement a minimal `CarrierAdapter` for one other carrier (even with stubbed HTTP) to demonstrate the pattern and multi-carrier `getRatesFromAllCarriers`.
5. **Validation messages**: Improve Zod error messages (e.g. field-level messages) for better API responses.
6. **Time-in-transit**: The UPS Rating API supports `Ratetimeintransit` / `Shoptimeintransit`; map optional transit-day info into `RateQuote.transitDays` where the response provides it (partially done in the parser).
7. **Idempotency**: Use a stable `transId` from the caller when provided, for idempotent rate requests.

## License

MIT.
# CYBERSHIP_ASSIGNMENT
