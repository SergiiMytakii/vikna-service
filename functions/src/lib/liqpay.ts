import {createHash, randomBytes} from "crypto";

const LIQPAY_CHECKOUT_ACTION_URL = "https://www.liqpay.ua/api/3/checkout";

export type LiqPayPayload = Record<string, string | number | boolean | object>;
export type PaymentMethod =
  | "full"
  | "paypart"
  | "moment_part";

export interface CheckoutInput {
  productType: string;
  quantity: number;
  unitPrice: number;
  paymentMethod?: PaymentMethod | string;
}

export interface NormalizedCheckoutInput {
  productType: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  paymentMethod: PaymentMethod;
}

export interface SignatureVerificationResult {
  isValid: boolean;
  algorithm: "sha1" | "sha3-256" | null;
}

export const checkoutActionUrl = LIQPAY_CHECKOUT_ACTION_URL;

export function normalizeCheckoutInput(
  input: Partial<CheckoutInput>
): NormalizedCheckoutInput {
  const productType = `${input.productType ?? ""}`.trim();
  const quantity = Number(input.quantity);
  const unitPrice = Number(input.unitPrice);

  if (!productType) {
    throw new Error("Поле 'тип товару' є обов'язковим");
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10000) {
    throw new Error("Кількість має бути цілим числом від 1 до 10000");
  }

  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("Ціна має бути додатним числом");
  }

  const unitPriceCents = toCents(unitPrice);
  const amountCents = unitPriceCents * quantity;

  return {
    productType,
    quantity,
    unitPrice: unitPriceCents / 100,
    amount: amountCents / 100,
    paymentMethod: normalizePaymentMethod(input.paymentMethod),
  };
}

export function buildCheckoutPayload(
  normalized: NormalizedCheckoutInput,
  publicKey: string,
  resultUrl: string,
  serverUrl: string
): LiqPayPayload {
  const description = `${normalized.productType} (${normalized.quantity} шт.)`;
  const orderId = generateOrderId();
  const resultUrlWithOrder = appendOrderIdToResultUrl(resultUrl, orderId);

  return {
    version: 3,
    public_key: publicKey,
    action: "pay",
    amount: normalized.amount,
    currency: "UAH",
    description,
    order_id: orderId,
    language: "uk",
    paytypes: toLiqPayPaytypes(normalized.paymentMethod),
    result_url: resultUrlWithOrder,
    server_url: serverUrl,
  };
}

export function buildStatusPayload(
  orderId: string,
  publicKey: string
): LiqPayPayload {
  return {
    action: "status",
    version: 3,
    public_key: publicKey,
    order_id: orderId,
  };
}

export function encodePayloadToBase64(payload: LiqPayPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodeBase64ToJson(data: string): unknown {
  return JSON.parse(Buffer.from(data, "base64").toString("utf8"));
}

export function createSignatureSha1(data: string, privateKey: string): string {
  return Buffer.from(
    createHash("sha1").update(`${privateKey}${data}${privateKey}`).digest()
  ).toString("base64");
}

export function createSignatureSha3(data: string, privateKey: string): string {
  return Buffer.from(
    createHash("sha3-256").update(`${privateKey}${data}${privateKey}`).digest()
  ).toString("base64");
}

export function verifySignature(
  data: string,
  signature: string,
  privateKey: string
): SignatureVerificationResult {
  const sha1 = createSignatureSha1(data, privateKey);
  if (sha1 === signature) {
    return {isValid: true, algorithm: "sha1"};
  }

  const sha3 = createSignatureSha3(data, privateKey);
  if (sha3 === signature) {
    return {isValid: true, algorithm: "sha3-256"};
  }

  return {isValid: false, algorithm: null};
}

export function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getHttpsProtocol(
  fallbackProtocol: string,
  forwardedHeader: string | string[] | undefined
): string {
  if (Array.isArray(forwardedHeader) && forwardedHeader.length > 0) {
    return forwardedHeader[0] === "https" ? "https" : "http";
  }

  if (typeof forwardedHeader === "string" && forwardedHeader.length > 0) {
    return forwardedHeader.split(",")[0].trim() === "https" ? "https" : "http";
  }

  return fallbackProtocol === "https" ? "https" : "http";
}

function generateOrderId(): string {
  const entropy = randomBytes(5).toString("hex");
  return `VS-${Date.now()}-${entropy}`;
}

function appendOrderIdToResultUrl(resultUrl: string, orderId: string): string {
  const separator = resultUrl.includes("?") ? "&" : "?";
  return `${resultUrl}${separator}order_id=${encodeURIComponent(orderId)}`;
}

function toLiqPayPaytypes(paymentMethod: PaymentMethod): string {
  switch (paymentMethod) {
  case "paypart":
    return "paypart";
  case "moment_part":
    return "moment_part";
  case "full":
  default:
    return "card,privat24";
  }
}

function normalizePaymentMethod(value: unknown): PaymentMethod {
  const method = `${value ?? "full"}`.trim().toLowerCase();

  switch (method) {
  case "paypart":
  case "moment_part":
  case "full":
  case "all":
    return method === "all" ? "full" : method;
  default:
    return "full";
  }
}

function toCents(value: number): number {
  const cents = Math.round(value * 100);
  const delta = Math.abs(value * 100 - cents);

  if (delta > 0.000001) {
    throw new Error("Ціна має містити не більше 2 знаків після коми");
  }

  return cents;
}
