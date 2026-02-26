import {Suspense} from "react";
import {ResultContent} from "./result-content";

export default function PaymentResultPage() {
  return (
    <main className="result-page">
      <Suspense fallback={<article className="card result-card">Завантаження...</article>}>
        <ResultContent />
      </Suspense>
    </main>
  );
}
