import Link from "next/link";

const SUCCESS_STATES = new Set([
  "success",
  "subscribed",
  "sandbox",
  "wait_compensation",
]);

interface PaymentResultPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PaymentResultPage({
  searchParams,
}: PaymentResultPageProps) {
  const params = await searchParams;

  const status = toSingleValue(params.status).toLowerCase();
  const orderId = toSingleValue(params.order_id) || "-";
  const amount = toSingleValue(params.amount) || "-";
  const isSuccess = SUCCESS_STATES.has(status);

  return (
    <main className="result-page">
      <article className={`card result-card ${isSuccess ? "ok" : "warn"}`}>
        <p className="eyebrow">Статус платежу</p>
        <h1>{isSuccess ? "Оплату отримано" : "Оплата обробляється"}</h1>
        <p>
          {isSuccess
            ? "Дякуємо за замовлення. Ми зв'яжемося з вами для уточнення деталей."
            : "Перевірте статус у LiqPay або зверніться до нас за телефоном +38 (067) 777 40 27."}
        </p>

        <dl>
          <div>
            <dt>Статус</dt>
            <dd>{status || "невідомо"}</dd>
          </div>
          <div>
            <dt>Order ID</dt>
            <dd>{orderId}</dd>
          </div>
          <div>
            <dt>Сума</dt>
            <dd>{amount}</dd>
          </div>
        </dl>

        <Link className="btn btn-primary" href="/">
          Повернутися на головну
        </Link>
      </article>
    </main>
  );
}

function toSingleValue(value: string | string[] | undefined): string {
  if (!value) {
    return "";
  }

  return Array.isArray(value) ? value[0] : value;
}
