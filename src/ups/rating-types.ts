/**
 * UPS Rating API request/response shapes (external API contract).
 * Used only inside the UPS adapter; domain types stay in domain/.
 */

/** UPS Rating API request wrapper (RATERequestWrapper) */
export interface UpsRateRequestWrapper {
  RateRequest: {
    Request?: {
      TransactionReference?: { CustomerContext?: string };
      RequestOption?: string;
    };
    Shipment: UpsRateShipment;
  };
}

export interface UpsRateShipment {
  Shipper: UpsAddressParty;
  ShipTo: UpsAddressParty;
  ShipFrom: UpsAddressParty;
  PaymentDetails?: {
    ShipmentCharge: Array<{
      Type: string;
      BillShipper?: { AccountNumber?: string };
    }>;
  };
  Service?: { Code: string; Description?: string };
  NumOfPieces?: string;
  Package: UpsPackage | UpsPackage[];
  ShipmentTotalWeight?: { UnitOfMeasurement: UpsUnit; Weight: string };
}

export interface UpsAddressParty {
  Name: string;
  ShipperNumber?: string;
  Address: {
    AddressLine: string | string[];
    City: string;
    StateProvinceCode: string;
    PostalCode: string;
    CountryCode: string;
    ResidentialAddressIndicator?: string;
  };
}

export interface UpsUnit {
  Code: string;
  Description?: string;
}

export interface UpsPackage {
  PackagingType: { Code: string; Description?: string };
  Dimensions: {
    UnitOfMeasurement: UpsUnit;
    Length: string;
    Width: string;
    Height: string;
  };
  PackageWeight: {
    UnitOfMeasurement: UpsUnit;
    Weight: string;
  };
}

/** UPS Rating API response (RATEResponseWrapper) — simplified for our use */
export interface UpsRateResponseWrapper {
  RateResponse?: {
    Response?: { TransactionReference?: { CustomerContext?: string } };
    RatedShipment?: UpsRatedShipment | UpsRatedShipment[];
  };
}

export interface UpsRatedShipment {
  Service?: { Code: string; Description?: string };
  RatedShipmentAlert?: Array<{ Code?: string; Description?: string }>;
  BillingWeight?: { UnitOfMeasurement?: UpsUnit; Weight?: string };
  TransportationCharges?: { CurrencyCode?: string; MonetaryValue?: string };
  ItemizedCharges?: Array<{ Code?: string; Description?: string; MonetaryValue?: string }>;
  NegotiatedRateCharges?: { ItemizedCharges?: Array<{ Code?: string; MonetaryValue?: string }>; TotalCharge?: { CurrencyCode?: string; MonetaryValue?: string } };
  FRSShipmentData?: unknown;
  TimeInTransit?: { ServiceSummary?: { EstimatedArrival?: { Arrival?: { Date?: string } }; BusinessTransitDays?: string } };
}

/** UPS API error response (ErrorResponse) */
export interface UpsErrorResponse {
  response?: {
    errors?: Array<{ code?: string; message?: string }>;
  };
  fault?: { faultstring?: string };
}
