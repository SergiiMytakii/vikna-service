"use client";

import Image from "next/image";
import {FormEvent, useEffect, useMemo, useState} from "react";
import {getFunctionsBaseUrl} from "@/lib/functions-base-url";

type PaymentMethod = "full" | "paypart" | "moment_part";

interface ApiSuccess {
  actionUrl?: string;
  data?: string;
  signature?: string;
  redirectUrl?: string;
  provider?: string;
}

interface ApiError {
  error: string;
}

interface InstallmentSettingsResponse {
  creditProvider?: "payparts" | "liqpay";
  showMomentPart?: boolean;
}

interface Product {
  name: string;
  image: string;
  description: string;
  unitPrice: number;
}

const products: Product[] = [
  {
    name: "Металопластикові вікна",
    unitPrice: 1000,
    image: "/products/window.jpg",
    description:
      "Енергоефективні профілі та склопакети з монтажем під ключ для квартир і будинків.",
  },
  {
    name: "Вхідні двері",
    unitPrice: 1800,
    image: "/products/door.jpg",
    description:
      "Надійні металеві двері з утепленням та різними варіантами оздоблення.",
  },
  {
    name: "Жалюзі та рулонні штори",
    unitPrice: 950,
    image: "/products/blinds.jpeg",
    description:
      "Сонцезахисні системи день-ніч, класичні рулонні штори та горизонтальні жалюзі.",
  },
];

function parseDecimal(input: string): number {
  return Number(input.trim().replace(",", "."));
}

function formatNumber(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

export function ProductCatalog() {
  const functionsBaseUrl = getFunctionsBaseUrl();
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("full");
  const [showMomentPart, setShowMomentPart] = useState(false);
  const [installmentCount, setInstallmentCount] = useState("4");
  const [area, setArea] = useState("1");
  const [amount, setAmount] = useState("0");
  const [unitPriceInput, setUnitPriceInput] = useState("0");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const baseTotal = useMemo(() => {
    if (!activeProduct) {
      return 0;
    }

    const price = parseDecimal(unitPriceInput);
    const parsedArea = parseDecimal(area);
    const parsedAmount = parseDecimal(amount);

    if (Number.isFinite(parsedArea) && parsedArea > 0 && Number.isFinite(price) && price > 0) {
      return Math.round(parsedArea * price * 100) / 100;
    }

    if (Number.isFinite(parsedAmount) && parsedAmount > 0 && Number.isFinite(price) && price > 0) {
      return Math.round(parsedAmount * 100) / 100;
    }

    return 0;
  }, [activeProduct, amount, area, unitPriceInput]);
  const total = baseTotal;
  const installments = Number(installmentCount);
  const installmentCalculator = useMemo(() => {
    if (paymentMethod === "full") {
      return null;
    }

    if (!Number.isFinite(total) || total <= 0) {
      return null;
    }

    if (!Number.isInteger(installments) || installments <= 0) {
      return null;
    }

    if (paymentMethod === "paypart") {
      const monthly = Math.round((total / installments) * 100) / 100;
      return {
        totalForClient: total,
        monthly,
        rateLabel: "0%",
      };
    }

    const totalForClient = Math.round(total * (1 + 0.019 * installments) * 100) / 100;
    const monthly = Math.round((totalForClient / installments) * 100) / 100;
    return {
      totalForClient,
      monthly,
      rateLabel: "1.9% / міс",
    };
  }, [installments, paymentMethod, total]);

  useEffect(() => {
    const onPageShow = () => {
      setIsLoading(false);
    };
    const onVisible = () => {
      if (!document.hidden) {
        setIsLoading(false);
      }
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!functionsBaseUrl) {
      setShowMomentPart(false);
      return;
    }

    let isCancelled = false;

    const loadInstallmentSettings = async () => {
      try {
        const response = await fetch(
          `${functionsBaseUrl}/getInstallmentSettings`,
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: "{}",
          }
        );

        const payload =
          (await response.json()) as InstallmentSettingsResponse | ApiError;

        if (!response.ok || isCancelled) {
          return;
        }

        const settings = payload as InstallmentSettingsResponse;
        setShowMomentPart(Boolean(settings.showMomentPart));
      } catch {
        if (isCancelled) {
          return;
        }
        setShowMomentPart(false);
      }
    };

    loadInstallmentSettings();

    return () => {
      isCancelled = true;
    };
  }, [functionsBaseUrl]);

  useEffect(() => {
    if (!showMomentPart && paymentMethod === "moment_part") {
      setPaymentMethod("paypart");
      setInstallmentCount("4");
    }
  }, [paymentMethod, showMomentPart]);

  function openDialog(product: Product, method: PaymentMethod) {
    setActiveProduct(product);
    setPaymentMethod(method);
    setInstallmentCount(defaultInstallmentCount(method).toString());
    setArea("1");
    setUnitPriceInput(product.unitPrice.toString());
    setAmount(formatNumber(product.unitPrice));
    setError("");
    setIsLoading(false);
  }

  function closeDialog() {
    setActiveProduct(null);
    setError("");
    setIsLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeProduct) {
      return;
    }

    setError("");

    const areaValue = area.trim();
    const amountValue = amount.trim();
    const priceValue = unitPriceInput.trim();

    if (priceValue && !/^\d+(?:[.,]\d{1,2})?$/.test(priceValue)) {
      setError("Ціна може мати не більше 2 знаків після коми.");
      return;
    }

    const parsedUnitPrice = parseDecimal(priceValue);

    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice <= 0) {
      setError("Вкажіть коректну ціну за м² більше 0.");
      return;
    }

    if (areaValue && !/^\d+(?:[.,]\d{1,2})?$/.test(areaValue)) {
      setError("Площа може мати не більше 2 знаків після коми.");
      return;
    }

    if (amountValue && !/^\d+(?:[.,]\d{1,2})?$/.test(amountValue)) {
      setError("Сума може мати не більше 2 знаків після коми.");
      return;
    }

    const parsedArea = parseDecimal(areaValue);
    const parsedAmount = parseDecimal(amountValue);
    let quantity: number | null = null;

    if (Number.isFinite(parsedArea) && parsedArea > 0) {
      quantity = parsedArea;
    } else if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
      const derivedArea = parsedAmount / parsedUnitPrice;
      if (derivedArea > 0) {
        quantity = derivedArea;
      }
    }

    if (!quantity) {
      setError("Вкажіть площу або суму більше 0.");
      return;
    }

    if (paymentMethod !== "full") {
      const range = installmentRange(paymentMethod);
      if (
        !Number.isInteger(installments) ||
        installments < range.min ||
        installments > range.max
      ) {
        setError(
          `Оберіть кількість платежів від ${range.min} до ${range.max}.`
        );
        return;
      }
    }

    if (!functionsBaseUrl) {
      setError(
        "Не задано адресу Firebase Functions. Додайте NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL."
      );
      return;
    }

    setIsLoading(true);

    try {
      const requestBody: {
        productType: string;
        quantity: number;
        unitPrice: number;
        paymentMethod: PaymentMethod;
        installmentCount?: number;
      } = {
        productType: activeProduct.name,
        quantity,
        unitPrice: parsedUnitPrice,
        paymentMethod,
      };

      if (paymentMethod !== "full") {
        requestBody.installmentCount = installments;
      }

      const response = await fetch(
        `${functionsBaseUrl}/createCheckoutPayload`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(requestBody),
        }
      );

      const payload = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Не вдалося сформувати платіж"
        );
      }

      const successPayload = payload as ApiSuccess;
      if (successPayload.redirectUrl) {
        window.location.assign(successPayload.redirectUrl);
        return;
      }

      if (
        successPayload.actionUrl &&
        successPayload.data &&
        successPayload.signature
      ) {
        submitToLiqPay({
          actionUrl: successPayload.actionUrl,
          data: successPayload.data,
          signature: successPayload.signature,
        });
        return;
      }

      throw new Error("Сервер повернув неповні дані для оплати");
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Помилка формування платежу";
      setError(message);
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="product-grid">
        {products.map((product) => (
          <article className="card product-card" key={product.name}>
            <Image
              className="product-main-image"
              src={product.image}
              alt={product.name}
              width={1200}
              height={800}
            />
            <h3>{product.name}</h3>
            <p>{product.description}</p>
            <p className="product-price">{product.unitPrice} грн/м²</p>

            <div className="product-actions">
              <button
                className="btn btn-primary product-buy-btn"
                type="button"
                onClick={() => openDialog(product, "full")}
              >
                Купити
              </button>
              <div
                className={
                  showMomentPart ?
                    "product-methods-row" :
                    "product-methods-row product-methods-row-single"
                }
              >
                <button
                  className="btn btn-secondary product-method-btn"
                  type="button"
                  onClick={() => openDialog(product, "paypart")}
                >
                  <span className="product-method-main">
                    <Image
                      className="paypart-icon"
                      src="/icons/paypart.svg"
                      alt="Оплата частинами"
                      width={14}
                      height={14}
                    />
                    Оплата частинами
                  </span>
                  <span className="product-method-copy">
                    0% переплата,<br />до 5 платежів
                  </span>
                </button>
                {showMomentPart ? (
                  <button
                    className="btn btn-secondary product-method-btn"
                    type="button"
                    onClick={() => openDialog(product, "moment_part")}
                  >
                    <span className="product-method-main">
                      <Image
                        className="moment-icon"
                        src="/icons/moment-part.svg"
                        alt="Миттєва розстрочка"
                        width={14}
                        height={14}
                      />
                      Миттєва розстрочка
                    </span>
                    <span className="product-method-copy">
                      Ставка 1,9% щомісяця,<br />від 5 до 24 платежів
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>

      {activeProduct ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="card payment-modal">
            <div className="payment-modal-head">
              <p className="eyebrow">Оформлення оплати</p>
              <button
                type="button"
                className="modal-close"
                aria-label="Закрити"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            <h3>{activeProduct.name}</h3>
            <p className="payment-modal-method">
              Метод: <strong>{paymentMethodLabel(paymentMethod)}</strong>
            </p>
            <p className="payment-modal-price">
              Ціна за м² можна змінити за потреби
            </p>

            <form className="payment-modal-form" onSubmit={handleSubmit}>
              <label>
                Ціна, грн за м²
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Наприклад: 1200"
                  value={unitPriceInput}
                  onChange={(event) => {
                    const value = event.target.value;
                    setUnitPriceInput(value);

                    const newPrice = parseDecimal(value);
                    const parsedArea = parseDecimal(area);
                    const parsedAmount = parseDecimal(amount);

                    if (Number.isFinite(newPrice) && newPrice > 0) {
                      if (Number.isFinite(parsedArea) && parsedArea > 0) {
                        setAmount(formatNumber(parsedArea * newPrice));
                      } else if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
                        setArea(formatNumber(parsedAmount / newPrice));
                      }
                    }
                  }}
                />
              </label>
              <label>
                Площа, м²
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Наприклад: 12,5 або 12.5"
                  value={area}
                  onChange={(event) => {
                    const value = event.target.value;
                    setArea(value);

                    const parsedArea = parseDecimal(value);
                    const price = parseDecimal(unitPriceInput);
                    if (
                      Number.isFinite(parsedArea) &&
                      parsedArea > 0 &&
                      Number.isFinite(price) &&
                      price > 0
                    ) {
                      setAmount(formatNumber(parsedArea * price));
                    }
                  }}
                />
              </label>

              <label>
                Сума, грн (можна ввести вручну)
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Наприклад: 15000"
                  value={amount}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAmount(value);

                    const parsedAmount = parseDecimal(value);
                    const price = parseDecimal(unitPriceInput);
                    if (
                      Number.isFinite(parsedAmount) &&
                      parsedAmount > 0 &&
                      Number.isFinite(price) &&
                      price > 0
                    ) {
                      setArea(formatNumber(parsedAmount / price));
                    }
                  }}
                />
              </label>

              <div className="total-line">
                <span>Сума до оплати:</span>
                <strong>{total.toFixed(2)} грн</strong>
              </div>

              {paymentMethod !== "full" ? (
                <label>
                  Кількість платежів
                  <select
                    value={installmentCount}
                    onChange={(event) => setInstallmentCount(event.target.value)}
                  >
                    {buildInstallmentOptions(paymentMethod).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {paymentMethod === "paypart" ? (
                <p className="installment-hint">
                  0% переплата. Оберіть від 2 до 5 платежів.
                </p>
              ) : null}

              {paymentMethod === "moment_part" ? (
                <p className="installment-hint">
                  Оберіть від 5 до 24 платежів. Підтвердження договору клієнт
                  проходить на сторінці банку.
                </p>
              ) : null}

              {installmentCalculator ? (
                <div className="installment-box">
                  <div className="total-line">
                    <span>Вартість послуги для покупця</span>
                    <strong>{installmentCalculator.totalForClient.toFixed(2)} грн</strong>
                  </div>
                  <div className="total-line">
                    <span>Процентна ставка</span>
                    <strong>{installmentCalculator.rateLabel}</strong>
                  </div>
                  <div className="total-line">
                    <span>Орієнтовний платіж / міс</span>
                    <strong>{installmentCalculator.monthly.toFixed(2)} грн</strong>
                  </div>
                </div>
              ) : null}

              {error ? <p className="form-error">{error}</p> : null}

              <button className="btn btn-primary" type="submit" disabled={isLoading}>
                {isLoading ? "Готуємо оплату..." : "Перейти до оплати"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
  case "paypart":
    return "Оплата частинами";
  case "moment_part":
    return "Миттєва розстрочка";
  case "full":
  default:
    return "Повна оплата";
  }
}

function defaultInstallmentCount(method: PaymentMethod): number {
  if (method === "paypart") {
    return 4;
  }
  if (method === "moment_part") {
    return 5;
  }
  return 0;
}

function installmentRange(method: PaymentMethod): {min: number; max: number} {
  if (method === "paypart") {
    return {min: 2, max: 5};
  }
  return {min: 5, max: 24};
}

function buildInstallmentOptions(method: PaymentMethod): number[] {
  const range = installmentRange(method);
  const options: number[] = [];

  for (let value = range.min; value <= range.max; value += 1) {
    options.push(value);
  }

  return options;
}

function submitToLiqPay(payload: {
  actionUrl: string;
  data: string;
  signature: string;
}) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payload.actionUrl;
  form.acceptCharset = "utf-8";

  const dataInput = document.createElement("input");
  dataInput.type = "hidden";
  dataInput.name = "data";
  dataInput.value = payload.data;

  const signatureInput = document.createElement("input");
  signatureInput.type = "hidden";
  signatureInput.name = "signature";
  signatureInput.value = payload.signature;

  form.appendChild(dataInput);
  form.appendChild(signatureInput);
  document.body.appendChild(form);
  form.submit();
}
