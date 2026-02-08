#!/usr/bin/env node
/**
 * Simple CLI demo: get rates from UPS (or stub when no credentials).
 * Run: npm run demo
 * With UPS_CLIENT_ID and UPS_CLIENT_SECRET in .env: live API. Without: stub mode.
 */

import { CarrierService, createUpsAdapter, FetchHttpClient, loadConfig } from "../index.js";
import { StubHttpClient } from "../http/stub-client.js";

const sampleRequest = {
  origin: {
    addressLines: ["123 Main St"],
    city: "Timonium",
    stateProvinceCode: "MD",
    postalCode: "21093",
    countryCode: "US",
  },
  destination: {
    addressLines: ["456 Oak Ave"],
    city: "Alpharetta",
    stateProvinceCode: "GA",
    postalCode: "30005",
    countryCode: "US",
  },
  package: {
    length: 5,
    width: 5,
    height: 5,
    dimensionUnit: "in" as const,
    weight: 1,
    weightUnit: "lb" as const,
  },
};

function stubResponses() {
  return [
    {
      status: 200,
      headers: {},
      body: JSON.stringify({
        access_token: "demo-stub-token",
        token_type: "Bearer",
        expires_in: 3600,
      }),
    },
    {
      status: 200,
      headers: {},
      body: JSON.stringify({
        RateResponse: {
          Response: { TransactionReference: { CustomerContext: "demo-tx-1" } },
          RatedShipment: [
            { Service: { Code: "03", Description: "Ground" }, TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "14.25" } },
            { Service: { Code: "01", Description: "Next Day Air" }, TransportationCharges: { CurrencyCode: "USD", MonetaryValue: "28.50" } },
          ],
        },
      }),
    },
  ];
}

async function main() {
  const hasCredentials =
    process.env.UPS_CLIENT_ID && process.env.UPS_CLIENT_SECRET;

  let service: CarrierService;
  if (hasCredentials) {
    const config = loadConfig(process.env);
    const http = new FetchHttpClient();
    const upsAdapter = createUpsAdapter(
      {
        baseUrl: config.UPS_BASE_URL,
        clientId: config.UPS_CLIENT_ID,
        clientSecret: config.UPS_CLIENT_SECRET,
        tokenUrl: config.UPS_OAUTH_TOKEN_URL,
        transactionSource: config.TRANSACTION_SOURCE,
        rateTimeoutMs: config.HTTP_TIMEOUT_RATE_MS,
      },
      http
    );
    service = new CarrierService({
      carriers: new Map([["ups", upsAdapter]]),
      defaultCarrierIds: ["ups"],
    });
    console.log("Requesting rates from UPS (live)...\n");
  } else {
    const stub = new StubHttpClient();
    stub.setResponses(stubResponses());
    const upsAdapter = createUpsAdapter(
      {
        baseUrl: "https://wwwcie.ups.com",
        clientId: "stub",
        clientSecret: "stub",
        transactionSource: "demo",
      },
      stub
    );
    service = new CarrierService({
      carriers: new Map([["ups", upsAdapter]]),
      defaultCarrierIds: ["ups"],
    });
    console.log("Requesting rates from UPS (stub mode — set UPS_CLIENT_ID and UPS_CLIENT_SECRET for live API)...\n");
  }

  const result = await service.getRates(sampleRequest, { carrierId: "ups" });
  if (result.ok) {
    console.log("Quotes:", JSON.stringify(result.value.quotes, null, 2));
    if (result.value.requestId) console.log("Request ID:", result.value.requestId);
  } else {
    console.error("Error:", result.error.details);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
