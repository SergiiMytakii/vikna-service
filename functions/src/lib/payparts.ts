import {createHash, randomBytes} from "crypto";

const DEFAULT_PAYPARTS_BASE_URL = "https://payparts2.privatbank.ua/ipp/v2";

export type PaypartsMerchantType = "PP" | "II";

export interface PaypartsProduct {
  name: string;
  count: number;
  price: number;
}

export interface PaypartsCreatePaymentRequest {
  storeId: string;
  orderId: string;
  amount: number;
  partsCount: number;
  merchantType: PaypartsMerchantType;
  products: PaypartsProduct[];
  responseUrl: string;
  redirectUrl: string;
  signature: string;
}

export interface PaypartsCreatePaymentResponse {
  state?: string;
  storeId?: string;
  orderId?: string;
  token?: string;
  message?: string;
  signature?: string;
  sendPhone?: string;
}

export interface PaypartsStateRequest {
  storeId: string;
  orderId: string;
  signature: string;
  showAmount?: boolean;
  showInfo?: boolean;
  showRefund?: boolean;
}

export interface PaypartsStateResponse {
  state?: string;
  paymentState?: string;
  storeId?: string;
  orderId?: string;
  amount?: number;
  message?: string;
  signature?: string;
}

export interface PaypartsCallbackPayload {
  storeId?: string;
  storeIdentifier?: string;
  orderId?: string;
  paymentState?: string;
  message?: string;
  signature?: string;
}

export function createPaypartsOrderId(
  merchantType: PaypartsMerchantType
): string {
  const entropy = randomBytes(5).toString("hex");
  return `${merchantType}-${Date.now()}-${entropy}`;
}

export function normalizePaypartsBaseUrl(baseUrl?: string): string {
  const source = (baseUrl || DEFAULT_PAYPARTS_BASE_URL).trim();
  return source.replace(/\/+$/, "");
}

export function toPaypartsMerchantType(
  paymentMethod: "paypart" | "moment_part"
): PaypartsMerchantType {
  return paymentMethod === "moment_part" ? "II" : "PP";
}

export function buildPaypartsProducts(
  productType: string,
  quantity: number,
  amount: number
): PaypartsProduct[] {
  return [
    {
      name: `${productType} (${formatSquareMeters(quantity)} м²)`,
      count: 1,
      price: amount,
    },
  ];
}

export function buildPaypartsCreatePaymentRequest(params: {
  storeId: string;
  password: string;
  orderId: string;
  amount: number;
  partsCount: number;
  merchantType: PaypartsMerchantType;
  products: PaypartsProduct[];
  responseUrl: string;
  redirectUrl: string;
}): PaypartsCreatePaymentRequest {
  const signatureSource =
    params.password +
    params.storeId +
    params.orderId +
    toAmountCentsText(params.amount) +
    `${params.partsCount}` +
    params.merchantType +
    params.responseUrl +
    params.redirectUrl +
    buildProductsString(params.products) +
    params.password;

  return {
    storeId: params.storeId,
    orderId: params.orderId,
    amount: params.amount,
    partsCount: params.partsCount,
    merchantType: params.merchantType,
    products: params.products,
    responseUrl: params.responseUrl,
    redirectUrl: params.redirectUrl,
    signature: sha1Base64(signatureSource),
  };
}

export function buildPaypartsStateRequest(
  storeId: string,
  orderId: string,
  password: string
): PaypartsStateRequest {
  const signature = sha1Base64(password + storeId + orderId + password);
  return {
    storeId,
    orderId,
    signature,
    showAmount: true,
  };
}

export function buildPaypartsCheckoutUrl(
  token: string,
  baseUrl?: string
): string {
  const normalizedBaseUrl = normalizePaypartsBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/payment?token=${encodeURIComponent(token)}`;
}

export async function createPaypartsPayment(
  payload: PaypartsCreatePaymentRequest,
  baseUrl?: string
): Promise<PaypartsCreatePaymentResponse> {
  return await callPaypartsApi<PaypartsCreatePaymentResponse>(
    `${normalizePaypartsBaseUrl(baseUrl)}/payment/create`,
    payload
  );
}

export async function getPaypartsPaymentState(
  payload: PaypartsStateRequest,
  baseUrl?: string
): Promise<PaypartsStateResponse> {
  return await callPaypartsApi<PaypartsStateResponse>(
    `${normalizePaypartsBaseUrl(baseUrl)}/payment/state`,
    payload
  );
}

export function verifyPaypartsCreateResponseSignature(
  payload: PaypartsCreatePaymentResponse,
  password: string
): boolean {
  const signature = `${payload.signature ?? ""}`.trim();
  if (!signature) {
    return false;
  }

  const state = `${payload.state ?? ""}`.trim();
  const storeId = `${payload.storeId ?? ""}`.trim();
  const orderId = `${payload.orderId ?? ""}`.trim();
  const token = `${payload.token ?? ""}`.trim();
  const message = `${payload.message ?? ""}`.trim();

  const candidates = new Set<string>();
  if (token) {
    candidates.add(
      sha1Base64(password + state + storeId + orderId + token + password)
    );
  }
  if (message) {
    candidates.add(
      sha1Base64(password + state + storeId + orderId + message + password)
    );
    if (token) {
      candidates.add(
        sha1Base64(
          password + state + storeId + orderId + message + token + password
        )
      );
    }
  }

  return candidates.has(signature);
}

export function verifyPaypartsStateResponseSignature(
  payload: PaypartsStateResponse,
  password: string
): boolean {
  const signature = `${payload.signature ?? ""}`.trim();
  if (!signature) {
    return false;
  }

  const state = `${payload.state ?? ""}`.trim();
  const storeId = `${payload.storeId ?? ""}`.trim();
  const orderId = `${payload.orderId ?? ""}`.trim();
  const paymentState = `${payload.paymentState ?? ""}`.trim();
  const message = `${payload.message ?? ""}`.trim();

  const expected = sha1Base64(
    password + state + storeId + orderId + paymentState + message + password
  );

  return signature === expected;
}

export function verifyPaypartsCallbackSignature(
  payload: PaypartsCallbackPayload,
  password: string
): boolean {
  const signature = `${payload.signature ?? ""}`.trim();
  if (!signature) {
    return false;
  }

  const storeId = `${payload.storeId ?? payload.storeIdentifier ?? ""}`.trim();
  const orderId = `${payload.orderId ?? ""}`.trim();
  const paymentState = `${payload.paymentState ?? ""}`.trim();
  const message = `${payload.message ?? ""}`.trim();
  const expected = sha1Base64(
    password + storeId + orderId + paymentState + message + password
  );

  return signature === expected;
}

function buildProductsString(products: PaypartsProduct[]): string {
  return products
    .map((product) => {
      return (
        `${product.name}` +
        `${product.count}` +
        toAmountCentsText(product.price)
      );
    })
    .join("");
}

function toAmountCentsText(value: number): string {
  const cents = Math.round(Number(value) * 100);
  return `${cents}`;
}

function sha1Base64(source: string): string {
  return Buffer.from(
    createHash("sha1").update(source, "utf8").digest()
  ).toString("base64");
}

async function callPaypartsApi<T>(
  url: string,
  payload: object
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "UTF-8",
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Сервіс кредитування повернув неочікувану відповідь: " +
      text.slice(0, 180)
    );
  }

  if (!response.ok) {
    throw new Error("Не вдалося виконати запит до сервісу кредитування");
  }

  return data as T;
}

function formatSquareMeters(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
