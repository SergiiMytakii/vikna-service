"use client";

import {FormEvent, useMemo, useState} from "react";
type PaymentMethod = "full" | "paypart" | "moment_part";

interface ApiSuccess {
  actionUrl: string;
  data: string;
  signature: string;
  orderId: string;
  amount: number;
  currency: string;
}

interface ApiError {
  error: string;
}

const FUNCTIONS_BASE_URL =
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL || "";

export function PaymentForm() {
  const [productType, setProductType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("paypart");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const total = useMemo(() => {
    const parsedQuantity = Number(quantity);
    const parsedUnitPrice = Number(unitPrice);

    if (
      !Number.isFinite(parsedQuantity) ||
      !Number.isFinite(parsedUnitPrice) ||
      parsedQuantity <= 0 ||
      parsedUnitPrice <= 0
    ) {
      return 0;
    }

    return Math.round(parsedQuantity * parsedUnitPrice * 100) / 100;
  }, [quantity, unitPrice]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const trimmedProduct = productType.trim();
    const parsedQuantity = Number(quantity);
    const parsedUnitPrice = Number(unitPrice);

    if (!trimmedProduct) {
      setError("Вкажіть тип товару або послуги.");
      return;
    }

    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Кількість має бути цілим числом більше 0.");
      return;
    }

    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice <= 0) {
      setError("Ціна має бути додатним числом.");
      return;
    }

    if (!/^\d+(?:[.,]\d{1,2})?$/.test(unitPrice.trim())) {
      setError("Ціна може мати не більше 2 знаків після коми.");
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
            productType: trimmedProduct,
            quantity: parsedQuantity,
            unitPrice: parsedUnitPrice,
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

  return (
    <form className="payment-form card" onSubmit={handleSubmit}>
      <label>
        Тип товару
        <input
          type="text"
          placeholder="Наприклад: Вікно металопластикове"
          value={productType}
          onChange={(event) => setProductType(event.target.value)}
          maxLength={100}
          required
        />
      </label>

      <div className="form-row">
        <label>
          Кількість
          <input
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>

        <label>
          Ціна за одиницю, грн
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value.replace(",", "."))}
            required
          />
        </label>
      </div>

      <label>
        Режим оплати
        <select
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value as PaymentMethod)}
        >
          <option value="paypart">Оплата частинами</option>
          <option value="moment_part">Миттєва розстрочка</option>
          <option value="full">Повна оплата</option>
        </select>
      </label>

      {(paymentMethod === "paypart" || paymentMethod === "moment_part") ? (
        <p className="form-hint">
          Кількість платежів і перший внесок покупець обирає на сторінці LiqPay.
          Доступні варіанти залежать від ваших налаштувань у кабінеті LiqPay.
        </p>
      ) : null}

      <div className="total-line">
        <span>Сума до оплати:</span>
        <strong>{total.toFixed(2)} грн</strong>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={isLoading}>
        {isLoading ? "Готуємо оплату..." : "Оплатити"}
      </button>
    </form>
  );
}
