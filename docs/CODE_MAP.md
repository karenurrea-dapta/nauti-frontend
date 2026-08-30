# Nauti Frontend — Code Map

Angular 20 standalone app, zoneless, signals + rxjs, Tailwind/daisyUI, Firebase Auth. No NgModules, no tests, no environment files.

Bootstrap: `src/main.ts:5` → `App` (`src/app/app.ts:14`) with `appConfig` (`src/app/app.config.ts:11`). **No HTTP interceptor** — no auth token is ever attached to backend calls.

## 1. Routes, guards, shells

`src/app/app.routes.ts:19-51`

| Path | Component | Guard | Shell |
|---|---|---|---|
| `''` | `HomeRedirect` | — | none |
| `/login`, `/signup` | `Login` / `Signup` | `guestGuard` | none |
| `/carriers` | `CarriersDirectory` | `superAdminGuard` | `AdminShell` |
| `/command` | `Command` | `superAdminGuard` | `AdminShell` |
| `/negotiations` | `Audit` | `superAdminGuard` | `AdminShell` |
| `/logs` | `Logs` | `superAdminGuard` | `AdminShell` |
| `/client`, `/client/:id` | `ClientDirectory` / `Client` | `superAdminGuard` | `AdminShell` |
| `/quote-history` | `QuoteHistory` | `superAdminGuard` | `AdminShell` |
| `/deploy` | `DeployAgent` | `superAdminGuard` | `AdminShell` |
| `/portal` | `Audit` | `clientGuard` | `PortalShell` |
| `/portal/command` | `Command` | `clientGuard` | `PortalShell` |
| `/portal/carriers` | `CarriersDirectory` (readonly) | `clientGuard` | `PortalShell` |
| `/portal/calls` | `PortalCalls` | `clientGuard` | `PortalShell` |

Guards (`core/auth/auth.guards.ts`): `superAdminGuard:16` (role `super_admin`; `client` → `/portal`), `clientGuard:29`, `guestGuard:6`.

Shells: both render `<app-navbar>` + outlet. `AdminShell` (`layout/admin-shell`) hosts the global carrier create/edit modal (`admin-shell.html:8-26`) and admin nav + Deploy Agent CTA. `PortalShell` shows `<app-conversation-list>` (client "deals" → `/portal/command?deal=<id>`). Same components serve both shells; role-scoping happens inside via `AuthService.clientId()`.

## 2. Services

### `LogisticsApi` (`core/services/logistics.api.ts`) — the only HTTP service
Bases in `core/config.ts:1,3`: `API_BASE` = nauti Cloud Run backend; `BATCH_API_BASE` = Railway batch-calls app.

| Method | URL | Used by |
|---|---|---|
| `listCarriers` `:48` | GET `{API}/carriers` | CarriersDirectory, Audit, DeployAgent, Command |
| `createCarrier` `:60` / `updateCarrier` `:64` | POST/PUT `{API}/carriers` | CarriersDirectory |
| `listQuotes` `:77` | GET `{API}/quotes` | Command, Audit, CarriersDirectory, QuoteHistory |
| `listPrimaryRoutes` `:92` / `createPrimaryRoute` `:96` | `{API}/primary-routes` | CarrierForm, CarriersDirectory |
| `generateAgentSummary` `:100` | POST `{API}/carriers/summarize` | CarrierForm (LLM scrape of info link) |
| `listClients` `:107` / `getClient` `:111` / `createClient` `:115` | `{API}/clients` | Command, ClientDirectory, Audit, DeployAgent |
| `createOperation` `:119` | POST `{API}/operations` | Command, DeployAgent |
| `normalizeMandateValue` `:123` | POST `{API}/operations/normalize` | Command (free-text normalizer) |
| `callOutbound` `:129` | POST `{API}/operations/call-outbound` | DeployAgent only |
| `dispatchOperationCalls` `:133` | POST `{API}/operations/{id}/dispatch` | DEAD CODE — no caller |
| `startDaptaBatch` `:137` | POST `{BATCH}/batches` | Command `:2095` |
| `pollDaptaBatch` `:141` | POST `{BATCH}/dapta/call-batch` | Command `:2321` |
| `listOperations` `:147` / `getOperation` `:153` | `{API}/operations` | ConversationList, Audit, Command |
| `listCalls` `:157` | GET `{API}/calls` | Logs (unfiltered!), PortalCalls (client-scoped) |
| `getUser` `:163` / `bootstrapUser` `:167` | `{API}/users` | AuthService |
| `listCommitments` `:171` | GET `{API}/commitments` | Audit |
| `getAnalyticsKpis` `:186` | GET `{API}/api/analytics/kpis` | Command, Audit, Client |

`CarrierDialog` (`core/services/carrier-dialog.ts`): signal store for the global carrier modal. `ThemeService`: `nauti`/`nauti-dark` in `localStorage['nauti-theme']`.

## 3. Models (`core/models/`)

- `carrier.ts` — Carrier: id, name, owner_name, phone, email, type, supported_routes[], price_memory, info_link, **agent_summary** (the voice-agent briefing), primary_route, historical_rates.
- `client.ts` — Client: id, name, contact_*, direction inbound/outbound, country fields.
- `operation.ts` — Operation: client_id, origin, destination, mandate_max_price, currency, mandate_target_date, cargo/container/weight/hazmat/pickup/last_free_day/chassis, status, negotiation_style, initial_hook.
- `quote.ts` — Quote: operation_id, carrier_id, initial_price, quoted_price, currency, pickup, valid, status, call_brief, call_id.
- `commitment.ts` — Commitment: agreed_price/name/date, recap_sent, call_id.
- `call.ts` — Call rows for Logs/PortalCalls.
- `call-batch.ts` — Dapta batch types + `agentCallFromDapta:128` (parses `result` JSON → summary/sentiment/voicemail), `FINISHED_CALL_STATUSES:45`.
- `audit.ts` — view-model: `buildNegotiationRows:67` merges commitments + quotes; `formatMoney:31` hardcodes `$`/en-US; currency default 'MXN' `:168,197`.
- `user.ts` — roles `super_admin`/`client`; `homeForRole:22`.
- `deploy-agent.ts` — deploy constants (see §6).

## 4. Features

### Command (`features/command/`, 2812 lines — `/command` and `/portal/command`)
Chat wizard → creates Operation → dials carriers via Railway.
- 16 wizard steps `:220-237`; skippable `:241`; local normalization first, backend `/operations/normalize` fallback `:707-746`; fake typing 900ms `:1220`.
- `?deal=<id>` → read-only view of an existing operation + quotes (`loadExistingDeal:879`).
- **Batch dispatch** `startCarrierCalls:2044`: carriers for lane (cap `MAX_DISPATCH_CARRIERS=5` `:123`) → `startDaptaBatch`. **Dynamic-variable contract** `:2099-2113`: origin, destination, mandate_max_price, mandate_currency, mandate_target_date, cargo_category, weight_kg, container_size, container_type, hazmat, pickup_window, last_free_day, chassis_required; `extra_variables` = {client_id, operation_id} `:134`. No agent_id sent — Railway service owns it.
- Poll: `POLL_INTERVAL_MS=5000` `:116`, `MAX_POLL_ATTEMPTS=120` `:119`, `MAX_POLL_FAILURES=3` `:121`. Results render in "Agent actions" card (`command.html:635-675`), then quotes card `:704-729`.
- Hardcoded chips: currencies MXN/USD/COP `:365`; origins Manzanillo/Veracruz/Lázaro Cárdenas `:372`; destinations Guadalajara/Monterrey/Mexico City `:379`; price suggestions 8500/12000/15000 `:427`; etc.
- All agent copy inline in `command.html` + `retryQuestion:1150`, `needThisAsk:1060`, `otherPrompt:557`, `cityRetryAsk:1142`, `containerTypePrompt:1679`.
- Uses plain fields + ~40 manual `detectChanges()` (unlike the rest of the app, which is signals).

### Audit / Negotiations (`features/audit/` — `/negotiations`, `/portal`)
forkJoin of 6 endpoints `:68`; read-only table + KPIs + receipt rail; CSV export `nauti-audit.csv` `:162` with 13 hardcoded headers `:121-135`; synthesized recap fallback (`audit-receipt.html:70-79`).

### Carriers (`features/carriers/`)
Directory: pageSize 10 `:54`, readonly for clients `:69`. `carrier-form.ts`: the only real create/edit form — routes combobox, phone dial-code (default +52 `:47`), **agent_summary auto-draft** via `/carriers/summarize` after 900ms debounce `:253`, editable textarea (`carrier-form.html:186`).

### Client (`features/client/`)
Directory + create modal (hardcoded sample placeholders `client-directory.html:149-182`). `/client/:id` dashboard is read-only; money always `es-MX`/MXN (`client.ts:99-104`); "OPERATION ACTIVITY" panel is a permanent empty state (`client.html:165-185`).

### Deploy Agent (`features/deploy-agent/` — `/deploy`)
Picks clients + carriers (pre-selects first 50 `:88`) → creates one operation per client (defaults: budget `DEFAULT_MANDATE_BUDGET=1500`, deadline +7 days — `deploy-agent.ts:42,43`) → single `POST /operations/call-outbound` (nauti backend, NOT Railway) — and **never polls**; feed is a one-shot snapshot `:247`. Other constants: `MAX_DEPLOY_CARRIERS=50` `:11`, `SECONDS_PER_CARRIER=45` `:12`, `COST_PER_CARRIER=0.12` `:13`, styles aggressive/balanced/flexible `:36` (default balanced `:47`). Initial-hook placeholder is an English Chicago–Dallas sample (`call-settings.html:31`).

### Logs (`/logs`) and Portal Calls (`/portal/calls`)
Read-only call tables. Logs is **unfiltered across tenants** (`logs.ts:65`); PortalCalls is client-scoped `:60`.

### Quote History (`/quote-history`)
Read-only; manual Client-ID text filter `:38`; status labels `:90`.

### Auth pages
`login.html`/`signup.html`; signup collects company/contact/phone (+52 default)/email/password (min 6).

## 5. Auth flow

- Firebase config committed in `core/firebase.ts:4-12` (project `nauti-backend`). Only firebase/auth used.
- `AuthService` (`core/auth/auth.service.ts`): signals `firebaseUser/appUser/ready`; `onAuthStateChanged` → `loadProfile:107` = GET `/users/{uid}`, on 404 → POST `/users/bootstrap`. Backend decides the role.
- Session persistence = Firebase's own localStorage. Role gating is guards + `clientId()` scoping.
- **Security gap: no Authorization header is ever sent to either backend — authorization is purely client-side.**

## 6. Hardcoded "information" an operator might want to change

- Endpoints: `core/config.ts:1,3` (no environment files — dev and prod share URLs).
- Firebase project: `core/firebase.ts:4`.
- Dapta variable contract: `command.ts:2099-2113`.
- Caps/timers: dispatch cap 5 (`command.ts:123`) vs deploy cap 50 (`deploy-agent.ts:11`); poll 5s/120 attempts/3 failures (`command.ts:116-121`).
- Deploy defaults: budget 1500, +7 days, $0.12/carrier, 45s/carrier (`deploy-agent.ts:11-47`).
- Carrier `agent_summary` — the main already-editable agent variable (carrier form).
- All agent/UI copy inline (English, no i18n): Command prompts, "CLIENT CONTROL TOWER", "REAL DATA ONLY", export filename `nauti-audit.csv`, brand assets `public/nauti-*.png`, title "Nauti Dispatch" (`index.html:11`).
- Dictionaries: `core/utils/mandate-normalize.ts` (currency/city/cargo aliases), `core/utils/phone.ts` (dial codes, default +52), `core/utils/routes.ts` (12 MX route codes), `conversation-list.ts:107-160` (city abbreviations, stage map).
- No feature flags, no settings screen — every change above requires a rebuild.

## 7. State & polling

- Signals + `computed` + `takeUntilDestroyed` everywhere except Command (manual `detectChanges`).
- Only real polling loop: Command batch poll (5s interval, 10-min cap). Deploy Agent never polls.
- Batch rendering: `applyDaptaPoll:2216` → `agentCallFromDapta` → "Agent actions" card; on finish → `loadQuotes:2392` → "Quotes from carriers" card.

## Dead / inconsistent code
- `dispatchOperationCalls` + `CallBatch`/`DispatchCallsRequest` models: no callers.
- Two parallel dispatch paths (Command→Railway vs DeployAgent→nauti backend) with different caps/payloads; only one polls.
- KPIs endpoint uses `/api` prefix unlike everything else (`logistics.api.ts:186`).
