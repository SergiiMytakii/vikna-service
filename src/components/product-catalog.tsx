"use client";

import Image from "next/image";
import {FormEvent, useMemo, useState} from "react";
import {getFunctionsBaseUrl} from "@/lib/functions-base-url";

type PaymentMethod = "full" | "paypart";

interface ApiSuccess {
  actionUrl: string;
  data: string;
  signature: string;
}

interface ApiError {
  error: string;
}

interface Product {
  name: string;
  image: string;
  description: string;
  unitPrice: number;
}

const INSTALLMENT_COUNTS = Array.from({length: 24}, (_, index) => index + 2);
const SELLER_COVERAGE_RATE = 5;
const SERVICE_RATE_BY_INSTALLMENTS: Record<number, number> = {
  2: 2.3,
  3: 2.5,
  4: 3.6,
  5: 5.3,
  6: 6.5,
  7: 7.7,
  8: 8.8,
  9: 9.9,
  10: 11.2,
  11: 12.5,
  12: 13.7,
  13: 14.8,
  14: 16,
  15: 17,
  16: 18.1,
  17: 19.1,
  18: 20.1,
  19: 21.1,
  20: 22.3,
  21: 23.2,
  22: 24.3,
  23: 25.3,
  24: 26.3,
  25: 27.3,
};

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

export function ProductCatalog() {
  const functionsBaseUrl = getFunctionsBaseUrl();
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("full");
  const [area, setArea] = useState("1");
  const [installmentCount, setInstallmentCount] = useState("4");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const baseTotal = useMemo(() => {
    if (!activeProduct) {
      return 0;
    }

    const parsedArea = Number(area.trim().replace(",", "."));
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      return 0;
    }

    return Math.round(parsedArea * activeProduct.unitPrice * 100) / 100;
  }, [activeProduct, area]);
  const isInstallment = paymentMethod === "paypart";
  const serviceRate = useMemo(() => {
    if (!isInstallment) {
      return 0;
    }
    const count = Number(installmentCount);
    return SERVICE_RATE_BY_INSTALLMENTS[count] ?? 0;
  }, [installmentCount, isInstallment]);
  const clientSurchargeRate = useMemo(() => {
    if (!isInstallment) {
      return 0;
    }

    const count = Number(installmentCount);
    if (count <= 4) {
      return 0;
    }
    return Math.max(0, serviceRate - SELLER_COVERAGE_RATE);
  }, [installmentCount, isInstallment, serviceRate]);
  const total = useMemo(() => {
    if (!isInstallment) {
      return baseTotal;
    }
    return Math.round((baseTotal * (100 + clientSurchargeRate)) / 100 * 100) / 100;
  }, [baseTotal, clientSurchargeRate, isInstallment]);

  function openDialog(product: Product, method: PaymentMethod) {
    setActiveProduct(product);
    setPaymentMethod(method);
    setArea("1");
    setInstallmentCount("4");
    setError("");
    setIsLoading(false);
  }

  function closeDialog() {
    if (isLoading) {
      return;
    }

    setActiveProduct(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeProduct) {
      return;
    }

    setError("");

    const areaValue = area.trim().replace(",", ".");
    const parsedArea = Number(areaValue);

    if (!/^\d+(?:[.,]\d{1,2})?$/.test(area.trim())) {
      setError("Площа може мати не більше 2 знаків після коми.");
      return;
    }

    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      setError("Вкажіть коректну площу більше 0 м².");
      return;
    }

    const parsedInstallmentCount = Number(installmentCount);
    if (
      isInstallment &&
      (!Number.isInteger(parsedInstallmentCount) ||
        !(parsedInstallmentCount in SERVICE_RATE_BY_INSTALLMENTS))
    ) {
      setError("Оберіть кількість платежів у діапазоні від 2 до 25.");
      return;
    }

    if (!functionsBaseUrl) {
      setError(
        "Не задано адресу Firebase Functions. Додайте NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL."
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${functionsBaseUrl}/createCheckoutPayload`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            productType: activeProduct.name,
            quantity: parsedArea,
            unitPrice: activeProduct.unitPrice,
            paymentMethod,
            installmentCount: isInstallment ? parsedInstallmentCount : undefined,
          }),
        }
      );

      const payload = (await response.json()) as ApiSuccess | ApiError;

      if (!response.ok) {
        throw new Error(
          "error" in payload ? payload.error : "Не вдалося сформувати платіж"
        );
      }

      submitToLiqPay(payload as ApiSuccess);
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
              <div className="product-methods-row">
                <button
                  className="btn btn-secondary product-method-btn"
                  type="button"
                  onClick={() => openDialog(product, "paypart")}
                >
                  <Image
                    className="paypart-icon"
                    src="/icons/paypart.svg"
                    alt="Оплата частинами"
                    width={14}
                    height={14}
                  />
                  Оплата частинами
                </button>
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
              Фіксована ціна: {activeProduct.unitPrice} грн/м²
            </p>

            <form className="payment-modal-form" onSubmit={handleSubmit}>
              <label>
                Площа, м²
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Наприклад: 12,5 або 12.5"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  required
                />
              </label>

              <div className="total-line">
                <span>Сума до оплати:</span>
                <strong>{total.toFixed(2)} грн</strong>
              </div>

              {isInstallment ? (
                <div className="installment-box">
                  <label>
                    Кількість платежів
                    <select
                      value={installmentCount}
                      onChange={(event) => setInstallmentCount(event.target.value)}
                    >
                      {INSTALLMENT_COUNTS.map((count) => (
                        <option key={count} value={count}>
                          {count} платежів
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="installment-hint">
                    Перший внесок і фінальний графік платежів клієнт підтверджує на сторінці LiqPay.
                  </p>
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
  case "full":
  default:
    return "Повна оплата";
  }
}

function submitToLiqPay(payload: ApiSuccess) {
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
