no# THUSO

*Thuso: help, in Tshivenda.* A modular business workspace for startups, established SMEs and corporates. A Coding Wizards product.

React + TypeScript progressive web app, Firebase backend, Clean Architecture.

## What works in this version (phase 1)

| Area | Status |
|---|---|
| Sign up with Google or email and password, email verification gate, sign in, password reset | Done |
| Onboarding: business profile, goals, choose tools, professionals (optional), working hours (optional), resumable | Done |
| Module gate: tools switched on per business, enforced in the UI, Firestore rules and Cloud Functions | Done |
| Home with live setup checklist (shows skipped steps), today's bookings, money owed, low stock | Done |
| Customers: add, edit, archive, duplicate detection, search, history timeline, POPIA consent | Done |
| Bookings: services, availability from working hours, day calendar, double-booking protection, deposits, complete / cancel / no-show | Done |
| Public booking page `/b/<slug>` with QR code, no account needed | Done |
| Invoices: create (VAT aware), server-assigned numbers, Paystack payment links, verified webhook, manual payments, send on WhatsApp or email, print / PDF | Done |
| Stock: items, movements, low-stock alerts, atomic increments that survive offline use | Done |
| Preview, then confirm: every action that sends, moves money or changes stock | Done |
| Ask THUSO: Business assistant (read-only tools over your data) and General assistant, both Gemini | Done |
| Offline: Firestore persistent cache + service worker; installable PWA | Done |
| Settings: business, invoice details and VAT, working hours, tools, booking page, account | Done |
| Compliance, Professionals network, Subscriptions/billing, team invites, automatic reminders | Shown as "coming soon"; data model ready |

## Architecture

```
packages/core     Domain + application (use cases, ports). Pure TypeScript.
                  No React, Firebase or vendor imports (ESLint enforces it).
apps/web          React PWA: presentation + browser adapters (Firestore web SDK).
apps/functions    Cloud Functions: server adapters (Admin SDK, Paystack, Gemini).
firestore.rules   Tenant isolation, roles, module gate, server-only fields.
tests/rules       Security rules tests (Firestore emulator).
```

Each module (workspace, customers, bookings, invoicing, stock, assistant) is a vertical slice with `domain/` and `application/`. Cross-module actions (complete a booking → invoice → stock) live in `core/src/workflows`.

Key ideas:

* **Use cases return plain operations, adapters apply them.** A use case describes changes as domain ops (`booking.save`, `slots.claim`, `stock.move`…). `core/src/storage.ts` turns them into document writes; the browser applies them in a batch, the server in a batch or transaction. Same writes on both sides.
* **Preview, then confirm.** State-changing use cases have a `preview…` that returns plain-language `Effect`s and writes nothing, and an execute that re-plans and commits.
* **Double bookings are impossible.** Each booking claims create-only lock docs, one per 15-minute block. A second booking touching the same block fails, in the app (even offline-queued) and on the public page.
* **Server-owned fields.** Invoice numbers, payment links and card payments are written only by Cloud Functions; rules reject clients.
* **The Business assistant cannot change data or invent it.** It only gets read tools for enabled modules, scoped to one business; suggestions become buttons that open the normal preview screen.

## Run it locally (no Firebase project needed)

Needs Node 22 and Java 11+ (for the emulators).

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run emulators          # Auth, Firestore, Functions, UI at http://localhost:4000
npm run dev                # in a second terminal: http://localhost:5173
```

`.env.local` points at the emulators (`VITE_USE_EMULATORS=true`). Email verification links appear in the emulator UI under Authentication.

Optional, to try payments and the assistant locally: copy `apps/functions/.secret.local.example` to `apps/functions/.secret.local` and add a Paystack **test** secret key and a Gemini API key.

## Checks

```bash
npm run lint         # includes the Clean Architecture import rules
npm run typecheck
npm test             # core use cases and domain rules, functions adapters
npm run test:rules   # security rules against the Firestore emulator
npm run build
```

## Deploy

1. Create a Firebase project (Blaze plan for Functions). Enable Authentication (Email/Password and Google) and Firestore.
2. `cp .firebaserc.example .firebaserc` and set the project id.
3. Fill `apps/web/.env.local` with the web config and set `VITE_USE_EMULATORS=false`.
4. `cp apps/functions/.env.example apps/functions/.env` and set `APP_URL` to your hosting URL.
5. `firebase functions:secrets:set PAYSTACK_SECRET_KEY` and `firebase functions:secrets:set GEMINI_API_KEY`.
6. `npm run deploy`.
7. In the Paystack dashboard, set the webhook URL to the deployed `paystackWebhook` function URL.
8. Add your domain to Firebase Auth authorised domains.

Functions run in `europe-west1` (set in `apps/functions/src/index.ts` and `VITE_FUNCTIONS_REGION`). The Gemini model defaults to `gemini-3.8-flash` and can be changed with the `GEMINI_MODEL` param.

## Before going public

* Replace the draft privacy notice and terms (`apps/web/src/modules/public/LegalPage.tsx`) with reviewed text.
* Turn on Firebase App Check and set `enforceAppCheck` on the public callables.
* Switch Paystack from test to live keys once your merchant account is approved.
