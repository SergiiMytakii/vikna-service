# Вікна-Сервіс Payment App

Вебзастосунок для прийому оплат через LiqPay для компанії «Вікна-Сервіс».

Продакшн-архітектура:
- Frontend: Next.js (App Router, TypeScript)
- Backend: Firebase Cloud Functions (HTTP endpoints)
- Hosting: Firebase Hosting (static export `out`)
- Payments: LiqPay Checkout + callback verification

## What is implemented

- Головна сторінка українською мовою з брендингом.
- Каталог з фіксованими цінами за м² та кнопками:
  - `Купити` (повна оплата)
  - `Оплата частинами`
- Модальне вікно оплати з вводом площі (м²) і автоматичним розрахунком суми.
- Сторінка результату оплати `/payment/result` з опитуванням фінального статусу через бекенд.
- Перевірка callback підпису LiqPay на бекенді.
- Каталог товарів (назва, ціна, фото, опис).
- Юридичні блоки для модерації LiqPay:
  - інформація про продавця
  - умови доставки/монтажу/повернення
  - окрема сторінка публічної оферти `/public-offer`

## LiqPay flow

1. Frontend викликає `createCheckoutPayload`.
2. Function формує `data/signature` приватним ключем і повертає їх.
3. Frontend робить POST форму на `https://www.liqpay.ua/api/3/checkout`.
4. LiqPay надсилає server-to-server callback на `liqpayCallback`.
5. Result page викликає `getPaymentStatus` за `order_id` до фінального статусу.

## Payment modes mapping

- `paypart` -> `paytypes: paypart`
- `full` -> `paytypes` не передається (застосовуються налаштування Checkout у кабінеті LiqPay)

Примітка: кнопка `Оплата частинами` надсилає `paytypes: paypart,moment_part`, тому клієнт обирає `Оплата частинами` або `Миттєва розстрочка` вже на сторінці LiqPay. Кількість платежів/перший внесок також остаточно підтверджуються в LiqPay.

## Project structure

- `src/app` - Next.js routes
  - `src/app/page.tsx` - головна сторінка
  - `src/app/payment/result` - статус після оплати
  - `src/app/public-offer` - публічний договір (оферта)
- `src/components/product-catalog.tsx` - каталог + кнопки оплати + модальне вікно
- `functions/src/index.ts` - Firebase HTTP functions
- `functions/src/lib/liqpay.ts` - утиліти підпису/валідації LiqPay
- `public/products/*` - фото товарів

## Environment variables

### Frontend локально (`.env.local`)

Локально використовується Functions Emulator:

- `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
- `NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL=http://127.0.0.1:5001/vikna-service-prod/europe-west1`

Для production build використовуйте `.env.production` лише з `NEXT_PUBLIC_*` змінними.

### Functions (prod vs local)

Prod (live):
- LiqPay ключі беруться з **Firebase Secrets**:
  - `LIQPAY_PUBLIC_KEY`
  - `LIQPAY_PRIVATE_KEY`

Local:
- sandbox ключі з `functions/.secret.local`
- локальні env з `functions/.env.local`:
  - `SITE_URL`
  - `FUNCTIONS_BASE_URL`
  - `ALLOWED_ORIGINS`

## Firebase configuration

В репозиторії вже налаштовано:
- `.firebaserc` -> project `vikna-service-prod`
- `firebase.json`:
  - Hosting `public: out`
  - Functions predeploy lint/build

## Local development

Install:

```bash
npm install
npm --prefix functions install
```

Run frontend only:

```bash
npm run dev
```

Run local sandbox flow (recommended):

```bash
npm run emulators:functions
npm run dev:local
```

## Functions endpoints

Base URL (prod):
`https://europe-west1-vikna-service-prod.cloudfunctions.net`

Endpoints:

- `POST /createCheckoutPayload`
  - Input: `productType`, `quantity`, `unitPrice`, `paymentMethod`
  - Output: `actionUrl`, `data`, `signature`, `orderId`, `amount`, `currency`

- `POST /liqpayCallback`
  - Input (from LiqPay): `data`, `signature`
  - Action: signature verify + structured logs

- `POST /getPaymentStatus`
  - Input: `orderId`
  - Action: server-side request to LiqPay `action=status`

## Build and checks

```bash
npm run lint
npm run build
npm run functions:lint
npm run functions:build
```

## Deploy to Firebase

### 1) Login and select project

```bash
firebase login
firebase use vikna-service-prod
```

### 2) Set LiqPay secrets (required for prod/live)

```bash
firebase functions:secrets:set LIQPAY_PUBLIC_KEY --project vikna-service-prod
firebase functions:secrets:set LIQPAY_PRIVATE_KEY --project vikna-service-prod
```

Або з локального `.env.production`:

```bash
set -a; source .env.production; set +a
printf '%s' "$LIQPAY_PUBLIC_KEY" | firebase functions:secrets:set LIQPAY_PUBLIC_KEY --project vikna-service-prod --data-file=-
printf '%s' "$LIQPAY_PRIVATE_KEY" | firebase functions:secrets:set LIQPAY_PRIVATE_KEY --project vikna-service-prod --data-file=-
```

### 3) Deploy functions and hosting

```bash
firebase deploy --only functions,hosting --project vikna-service-prod
```

### 4) Deploy only hosting (frontend-only changes)

```bash
npm run build
firebase deploy --only hosting --project vikna-service-prod
```

### 5) Deploy only functions (backend-only changes)

```bash
firebase deploy --only functions --project vikna-service-prod
```

## Production URL

- Firebase Hosting: `https://vikna-service-prod.web.app`

(Якщо використовується кастомний домен, він має бути підв'язаний у Firebase Hosting і DNS.)

## Security notes

- `LIQPAY_PRIVATE_KEY` ніколи не передається у браузер.
- Підпис LiqPay перевіряється на callback endpoint.
- CORS обмежений allowlist-ом доменів.
- Для live ключі LiqPay мають бути задані тільки через Firebase Secrets.
