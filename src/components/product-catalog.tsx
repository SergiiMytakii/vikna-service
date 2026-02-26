"use client";

import Image from "next/image";
import {FormEvent, useMemo, useState} from "react";

type PaymentMethod = "full" | "paypart" | "moment_part";

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

const FUNCTIONS_BASE_URL =
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL || "";
const INSTALLMENT_COUNTS = Array.from({length: 24}, (_, index) => index + 2);

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
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("full");
  const [area, setArea] = useState("1");
  const [installmentCount, setInstallmentCount] = useState("6");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const total = useMemo(() => {
    if (!activeProduct) {
      return 0;
    }

    const parsedArea = Number(area);
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      return 0;
    }

    return Math.round(parsedArea * activeProduct.unitPrice * 100) / 100;
  }, [activeProduct, area]);
  const isInstallment = paymentMethod === "paypart" || paymentMethod === "moment_part";
  const monthlyEstimate = useMemo(() => {
    const count = Number(installmentCount);
    if (!isInstallment || !Number.isFinite(count) || count <= 0) {
      return 0;
    }
    return Math.round((total / count) * 100) / 100;
  }, [installmentCount, isInstallment, total]);

  function openDialog(product: Product, method: PaymentMethod) {
    setActiveProduct(product);
    setPaymentMethod(method);
    setArea("1");
    setInstallmentCount("6");
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

    if (!FUNCTIONS_BASE_URL) {
      setError(
        "Не задано адресу Firebase Functions. Додайте NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL."
      );
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${FUNCTIONS_BASE_URL.replace(/\/+$/, "")}/createCheckoutPayload`,
        {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            productType: activeProduct.name,
            quantity: parsedArea,
            unitPrice: activeProduct.unitPrice,
            paymentMethod,
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
                <button
                  className="btn btn-secondary product-method-btn"
                  type="button"
                  onClick={() => openDialog(product, "moment_part")}
                >
                  Миттєва розстрочка
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
                  placeholder="Наприклад: 12.5"
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
                    Бажана кількість платежів (орієнтовно)
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
                  <div className="installment-line">
                    <span>Орієнтовний щомісячний платіж:</span>
                    <strong>{monthlyEstimate.toFixed(2)} грн/міс</strong>
                  </div>
                  <p className="installment-hint">
                    Остаточну кількість платежів, перший внесок і графік
                    клієнт обирає на сторінці LiqPay. Зазвичай доступно від 2 до
                    25 платежів залежно від ліміту клієнта та налаштувань магазину.
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
  case "moment_part":
    return "Миттєва розстрочка";
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
