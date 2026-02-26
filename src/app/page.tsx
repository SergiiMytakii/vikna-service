import Image from "next/image";
import Link from "next/link";
import {PaymentForm} from "@/components/payment-form";

const services = [
  "Металопластикові вікна та двері",
  "Вхідні та міжкімнатні двері",
  "Жалюзі, ролети, рулонні штори",
  "Продаж і професійний монтаж під ключ",
];

const products = [
  {
    name: "Металопластикове вікно (поворотно-відкидне)",
    price: "від 6 800 грн",
    image: "/products/window.jpg",
    description:
      "Енергоефективний профіль, двокамерний склопакет, базова фурнітура. Ціна залежить від розміру та комплектації.",
  },
  {
    name: "Вхідні двері металеві утеплені",
    price: "від 12 500 грн",
    image: "/products/door.jpg",
    description:
      "Надійні двері для квартири або приватного будинку. Можливі різні варіанти оздоблення та рівня захисту.",
  },
  {
    name: "Рулонні штори / жалюзі",
    price: "від 950 грн/м²",
    image: "/products/blinds.jpeg",
    description:
      "Системи сонцезахисту для дому та офісу. Доступні моделі день-ніч, класичні рулонні штори та горизонтальні жалюзі.",
  },
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
            кроків.
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
            <Link className="btn btn-secondary" href="/public-offer">
              Публічна оферта
            </Link>
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
                вул. Миру 67, т.{" "}
                <a href="tel:+380677774027">067-777-40-27</a>
              </li>
              <li>
                вул. Торгова 57/а, т.{" "}
                <a href="tel:+380972542080">097-254-20-80</a>
              </li>
            </ul>
            <div className="socials">
              <a
                className="btn btn-secondary"
                href="https://www.facebook.com/oknaservis"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FacebookIcon />
                Facebook
              </a>
              <a
                className="btn btn-secondary"
                href="https://www.instagram.com/okna_servis_kiliya"
                target="_blank"
                rel="noopener noreferrer"
              >
                <InstagramIcon />
                Instagram
              </a>
            </div>
          </article>
        </section>

        <section className="catalog-section" id="catalog">
          <div className="payment-header">
            <p className="eyebrow">Каталог товарів</p>
            <h2>Товари з актуальним описом та ціною</h2>
            <p>
              Нижче наведені базові моделі. Точна вартість формується після
              заміру та узгодження параметрів.
            </p>
          </div>

          <div className="product-grid">
            {products.map((product) => (
              <article className="card product-card" key={product.name}>
                <Image
                  src={product.image}
                  alt={product.name}
                  width={1200}
                  height={800}
                />
                <h3>{product.name}</h3>
                <p>{product.description}</p>
                <p className="product-price">{product.price}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section-grid">
          <article className="card legal-card">
            <h2>Інформація про продавця</h2>
            <ul>
              <li>Продавець: ФОП Митакий Сергій</li>
              <li>ІПН: 2930302879</li>
              <li>Торгова назва: Вікна-Сервіс</li>
              <li>Адреса офісу 1: вул. Миру 67, м. Кілія, т. 067-777-40-27</li>
              <li>Адреса офісу 2: вул. Торгова 57/а, т. 097-254-20-80</li>
              <li>м. Кілія, 68300</li>
              
            </ul>
          </article>

          <article className="card legal-card">
            <h2>Доставка, монтаж та повернення</h2>
            <ul>
              <li>
                Узгодження замовлення: після заявки менеджер уточнює розміри,
                комплектацію, строки та фінальну ціну.
              </li>
              <li>
                Доставка/монтаж: виконується у погоджену дату по Кілії та
                найближчих населених пунктах.
              </li>
              <li>
                Повернення коштів: за письмовою заявою клієнта відповідно до
                умов публічної оферти та чинного законодавства України.
              </li>
              <li>
                Строк повернення: до 7 банківських днів після підтвердження
                підстави для повернення.
              </li>
            </ul>
            <p className="legal-link-row">
              Повні права та зобов&rsquo;язання сторін:{" "}
              <Link href="/public-offer">Публічний договір (оферта)</Link>.
            </p>
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
        <div className="footer-links">
          <Link href="/public-offer">Публічна оферта</Link>
          <a href="#top">Вгору</a>
        </div>
      </footer>
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      className="btn-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.2c0-.9.2-1.5 1.5-1.5h1.5V5.1c-.7-.1-1.4-.1-2.1-.1-2.1 0-3.4 1.3-3.4 3.6V11H8.7v3H11v7h2.5Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      className="btn-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
