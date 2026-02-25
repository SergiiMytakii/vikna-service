# Вікна-Сервіс Payment Web App

Next.js single-page website with LiqPay checkout integration and Firebase Functions backend for secure signature generation and callback verification.

## Tech stack

- Next.js (App Router, TypeScript)
- Firebase Cloud Functions (TypeScript)
- LiqPay Checkout (`card, privat24, paypart, moment_part`)
- Netlify deployment (`vikna-service.run.place`)

## Local setup

1. Install dependencies:

```bash
npm install
npm --prefix functions install
```

2. Configure frontend env:

```bash
cp .env.example .env.local
```

3. Configure functions env:

```bash
cp functions/.env.example functions/.env.local
```

4. Start frontend:

```bash
npm run dev
```

## Firebase CLI setup

Project configured: `vikna-service-prod`.

```bash
firebase use vikna-service-prod
```

### LiqPay secrets

Preferred (Blaze plan required):

```bash
firebase functions:secrets:set LIQPAY_PUBLIC_KEY --project vikna-service-prod
firebase functions:secrets:set LIQPAY_PRIVATE_KEY --project vikna-service-prod
```

If Blaze is not enabled yet, use `functions/.env.local` temporarily.

## Functions endpoints

- `createCheckoutPayload` (POST): validates order data and returns `data/signature`
- `liqpayCallback` (POST): verifies signature and logs payment status

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run functions:build
npm run functions:lint
```

## Deploy

### Functions

```bash
firebase deploy --only functions --project vikna-service-prod
```

### Netlify

1. Connect GitHub repo to Netlify.
2. Build command: `npm run build`
3. Publish handled by Next.js plugin.
4. Set env vars in Netlify:
   - `NEXT_PUBLIC_SITE_URL=https://vikna-service.run.place`
   - `NEXT_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL=https://europe-west1-vikna-service-prod.cloudfunctions.net`
5. Set custom domain `vikna-service.run.place` as primary.
6. DNS: create CNAME `vikna-service` -> `<netlify-site>.netlify.app`.

## Payment result route

- `/payment/result`

## Notes

- LiqPay `private_key` is never exposed to the browser.
- `paypart/moment_part` visibility depends on merchant settings in LiqPay cabinet.
- Rotate sandbox keys before production go-live.
