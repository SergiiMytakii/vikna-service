import Image from "next/image";
import {PaymentForm} from "@/components/payment-form";

const services = [
  "Металопластикові вікна та двері",
  "Вхідні та міжкімнатні двері",
  "Жалюзі, ролети, рулонні штори",
  "Продаж і професійний монтаж під ключ",
];

export default function Home() {
  return (
    <div className="site-shell">
      <header className="hero" id="top">
        <div className="hero-content">
          <p className="eyebrow">Вікна-Сервіс Кілія</p>
          <h1>Надійні вікна, двері та сонцезахист з оплатою онлайн</h1>
          <p className="lead">
            Розрахуйте вартість замовлення та оплатіть через LiqPay у кілька
            кроків. Працюємо по Кілії, Вилковому та Шевченковому.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#payment">
              Перейти до оплати
            </a>
            <a
              className="btn btn-secondary"
              href="https://www.facebook.com/oknaservis"
              target="_blank"
              rel="noopener noreferrer"
            >
              Facebook сторінка
            </a>
          </div>
        </div>

        <div className="brand-panel">
          <Image
            src="/logo.png"
            alt="Логотип Вікна-Сервіс"
            width={334}
            height={130}
            priority
          />
          <p>
            Встановлення металопластикових конструкцій, міжкімнатних і вхідних
            дверей, а також сучасних рішень для захисту від сонця.
          </p>
        </div>
      </header>

      <main>
        <section className="section-grid">
          <article className="card service-card">
            <h2>Що ми робимо</h2>
            <ul>
              {services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
          </article>

          <article className="card contact-card">
            <h2>Контакти</h2>
            <ul>
              <li>
                Телефон: <a href="tel:+380677774027">+38 (067) 777 40 27</a>
              </li>
              <li>
                Email: <a href="mailto:serjmitaki@gmail.com">serjmitaki@gmail.com</a>
              </li>
              <li>Зона обслуговування: Кілія, Вилкове, Шевченкове</li>
            </ul>
            <div className="socials">
              <a
                className="btn btn-secondary"
                href="https://www.facebook.com/oknaservis"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook
              </a>
              <a
                className="btn btn-secondary"
                href="https://www.instagram.com/okna_servis_kiliya"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
            </div>
          </article>
        </section>

        <section className="payment-section" id="payment">
          <div className="payment-header">
            <p className="eyebrow">Оплата через LiqPay</p>
            <h2>Заповніть форму та перейдіть до безпечної оплати</h2>
            <p>
              Доступні методи: картка, Privat24, Оплата частинами та Миттєва
              розстрочка.
            </p>
          </div>
          <PaymentForm />
        </section>
      </main>

      <footer className="footer">
        <p>© {new Date().getFullYear()} Вікна-Сервіс. Усі права захищено.</p>
        <a href="#top">Вгору</a>
      </footer>
    </div>
  );
}
