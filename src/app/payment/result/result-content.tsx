"use client";

import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {useEffect, useMemo, useState} from "react";
import {getFunctionsBaseUrl} from "@/lib/functions-base-url";

const SUCCESS_STATES = new Set([
  "success",
  "subscribed",
  "wait_compensation",
]);
const APPROVED_STATES = new Set([
  "wait_accept",
  "hold_wait",
]);
const FAILURE_STATES = new Set(["error", "failure", "reversed", "unsubscribed"]);
const PENDING_STATES = new Set([
  "3ds_verify",
  "captcha_verify",
  "cvv_verify",
  "ivr_verify",
  "otp_verify",
  "password_verify",
  "phone_verify",
  "pin_verify",
  "receiver_verify",
  "sender_verify",
  "senderapp_verify",
  "wait_qr",
  "wait_sender",
  "cash_wait",
  "invoice_wait",
  "prepared",
  "processing",
  "wait_card",
  "wait_lc",
  "wait_reserve",
  "wait_secure",
]);

interface PaymentStatusResponse {
  status?: string;
  amount?: number | string;
  currency?: string;
  paytype?: string;
  action?: string;
  errorDescription?: string;
  errorCode?: string;
}

export function ResultContent() {
  const functionsBaseUrl = getFunctionsBaseUrl();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id") || "";
  const queryStatus = (searchParams.get("status") || "").toLowerCase();

  const [status, setStatus] = useState(queryStatus || "processing");
  const [amount, setAmount] = useState<string>(searchParams.get("amount") || "-");
  const [currency, setCurrency] = useState(searchParams.get("currency") || "UAH");
  const [paytype, setPaytype] = useState("-");
  const [isLoading, setIsLoading] = useState(Boolean(orderId));
  const [error, setError] = useState("");

  const statusKind = useMemo(() => {
    if (SUCCESS_STATES.has(status) || APPROVED_STATES.has(status)) {
      return "ok";
    }

    if (FAILURE_STATES.has(status)) {
      return "fail";
    }

    return "warn";
  }, [status]);

  useEffect(() => {
    if (!orderId || !functionsBaseUrl) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const fetchStatus = async () => {
      try {
        const response = await fetch(
          `${functionsBaseUrl}/getPaymentStatus`,
          {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({orderId}),
          }
        );

        const payload = (await response.json()) as PaymentStatusResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Не вдалося перевірити статус платежу");
        }

        if (isCancelled) {
          return;
        }

        const normalizedStatus = `${payload.status || queryStatus || "processing"}`
          .toLowerCase();
        setStatus(normalizedStatus);
        setPaytype(`${payload.paytype || "-"}`);

        if (payload.amount !== undefined && payload.amount !== null) {
          setAmount(`${payload.amount}`);
        }

        if (payload.currency) {
          setCurrency(payload.currency);
        }

        setError(payload.errorDescription || "");
        setIsLoading(false);

        if (!isFinalState(normalizedStatus)) {
          timeoutId = setTimeout(fetchStatus, 4000);
        }
      } catch (requestError) {
        if (isCancelled) {
          return;
        }

        setIsLoading(false);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Помилка перевірки статусу"
        );
      }
    };

    fetchStatus();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [functionsBaseUrl, orderId, queryStatus]);

  return (
    <article className={`card result-card ${statusKind}`}>
      <p className="eyebrow">Статус платежу</p>
      <h1>{titleByStatus(statusKind, isLoading)}</h1>
      <p>{descriptionByStatus(statusKind, isLoading, status)}</p>

      <dl>
        <div>
          <dt>Статус</dt>
          <dd>{formatStatus(status)}</dd>
        </div>
        <div>
          <dt>Order ID</dt>
          <dd>{orderId || "-"}</dd>
        </div>
        <div>
          <dt>Сума</dt>
          <dd>{amount === "-" ? "-" : `${amount} ${currency}`}</dd>
        </div>
        <div>
          <dt>Метод</dt>
          <dd>{formatPaytype(paytype)}</dd>
        </div>
      </dl>

      {error ? <p className="form-error">{error}</p> : null}

      <Link className="btn btn-primary" href="/">
        Повернутися на головну
      </Link>
    </article>
  );
}

function isFinalState(status: string): boolean {
  return (
    SUCCESS_STATES.has(status) ||
    APPROVED_STATES.has(status) ||
    FAILURE_STATES.has(status)
  );
}

function titleByStatus(statusKind: string, isLoading: boolean): string {
  if (isLoading) {
    return "Перевіряємо платіж";
  }

  if (statusKind === "ok") {
    if (status === "wait_accept") {
      return "Підтверджено клієнтом";
    }
    if (status === "hold_wait") {
      return "Підтверджено, завершуємо оплату";
    }
    return "Оплату підтверджено";
  }

  if (statusKind === "fail") {
    return "Оплата неуспішна";
  }

  return "Оплата обробляється";
}

function descriptionByStatus(
  statusKind: string,
  isLoading: boolean,
  status: string
): string {
  if (isLoading) {
    return "Очікуємо підтвердження від LiqPay. Це може зайняти до 1 хвилини.";
  }

  if (statusKind === "ok") {
    if (status === "wait_accept") {
      return "Клієнт успішно підтвердив платіж. Фінальна проводка виконується LiqPay автоматично.";
    }
    if (status === "hold_wait") {
      return "Платіж підтверджено. Завершуємо фінальне списання в LiqPay.";
    }
    if (status === "wait_compensation") {
      return "Платіж успішний. Кошти будуть зараховані в щодобовій проводці LiqPay.";
    }
    return "Платіж або погодження Оплати частинами успішно підтверджено.";
  }

  if (statusKind === "fail") {
    return "Якщо кошти списані, але статус неуспішний, зверніться до нас для перевірки.";
  }

  if (PENDING_STATES.has(status)) {
    return "Оплата ще в обробці або очікує додаткового підтвердження. Сторінка оновлює статус автоматично.";
  }

  return "Статус ще не фінальний. Сторінка оновлює його автоматично.";
}

function formatStatus(status: string): string {
  if (!status) {
    return "невідомо";
  }

  const labels: Record<string, string> = {
    success: "Успішно",
    wait_compensation: "Успішно, очікується зарахування",
    processing: "Обробляється",
    prepared: "Створено, очікується завершення",
    wait_accept: "Підтверджено клієнтом",
    hold_wait: "Очікує фінального списання",
    wait_reserve: "Резервування коштів",
    wait_secure: "Платіж на перевірці",
    failure: "Неуспішно",
    error: "Помилка",
    reversed: "Повернено",
  };

  return labels[status] || status;
}

function formatPaytype(paytype: string): string {
  const normalized = paytype.toLowerCase().trim();
  const labels: Record<string, string> = {
    paypart: "Оплата частинами",
    moment_part: "Миттєва розстрочка",
    card: "Картка",
    privat24: "Privat24",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
  };

  if (!normalized) {
    return "-";
  }

  return labels[normalized] || paytype;
}
