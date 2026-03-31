# Advanced Features — Implementation Roadmap

This document is a **phased implementation plan** to evolve the Food Delivery project toward advanced marketplace, payments, logistics, growth, and platform capabilities. Phases are ordered so each step builds on the previous one.

**Related docs:** `README.md`, `SETUP_AND_RUN_GUIDE.md`, `PROJECT_FEATURES_DOCUMENTATION.md`, `DEPLOYMENT_GUIDE.md`

---

## Principles (apply in every phase)

- **Snapshot order lines:** Persist prices, names, modifiers, and tax basis at checkout—do not rely only on live menu references for fulfilled orders.
- **Idempotency:** Use idempotency keys on payment create/capture/refund and wallet mutations; verify webhook signatures from payment providers.
- **Order status as a state machine:** Allow only valid transitions; record each change in an append-only **order event log** for timeline and audits.
- **Feature flags:** Gate major capabilities with environment variables or a small config module until stable in production.

---

## Phase 0 — Baseline and conventions

**Duration (indicative):** 1–2 weeks  
**Goal:** Make later phases safer and faster to ship.

| Work item | Detail |
|-----------|--------|
| API conventions | Consistent error JSON shape; pagination on list endpoints; optional `/api/v2` prefix for breaking changes later. |
| Order event log (schema) | Collection: `orderId`, `type`, `payload`, `actor` (user/system), `createdAt`—UI can follow in Phase 2. |
| Background jobs | Standardize on **Redis + BullMQ** (or equivalent) for emails, webhooks, notifications; migrate cron-only flows where needed. |
| Configuration | Centralize feature flags (`ENABLE_MARKETPLACE`, etc.) in env + a small `config` module. |

**Exit criteria:** New routes use shared errors and pagination; jobs run through a queue; orders can append internal events from the service layer.

---

## Phase 1 — Catalog and marketplace foundation

**Duration (indicative):** 3–5 weeks  
**Goal:** Platform semantics—who sells, what they sell, when and where.

| Capability | Implementation focus |
|------------|----------------------|
| Multi-restaurant | `Restaurant` as owner of menu items; admin onboarding; link staff users to restaurants. |
| Modifiers and variants | Modifier groups (min/max), price deltas; cart and order lines store **resolved** selections. |
| Operating hours and exceptions | Weekly schedule + blackout dates; block checkout with clear, localized errors. |
| Service zones | Delivery polygons or radius per restaurant; validate address at checkout server-side. |
| Inventory / 86ing | Stock counts or `isAvailable`; refresh via polling first; real-time push in Phase 6. |

**Touchpoints:** MongoDB models, cart/order APIs, admin restaurant and menu UIs, customer menu and checkout.

**Exit criteria:** Multiple restaurants; modifiers on orders; hours and zones enforced on the server; inventory reflected in catalog.

---

## Phase 2 — Order lifecycle and scheduling

**Duration (indicative):** 2–4 weeks  
**Goal:** Predictable, traceable orders and richer order types.

| Capability | Implementation focus |
|------------|----------------------|
| Status machine | Explicit states and allowed transitions; reject illegal updates. |
| Timeline | Persist every transition to the **order event log**; customer and admin history read from it. |
| Scheduled / slot orders | `scheduledFor` or slot identifier; validate against restaurant hours; optional job to advance queue state. |
| Menu versioning on order | Snapshot each line at place-order (names, unit price, modifiers, tax basis). |
| Group cart (optional) | Shared session and leader; can be deferred to Phase 10 if scope is tight. |

**Touchpoints:** Order routes and controllers, models, frontend order detail, admin order board.

**Exit criteria:** Scheduled orders supported; full audit trail; snapshots support disputes and payouts.

---

## Phase 3 — Payments and money core

**Duration (indicative):** 4–6 weeks  
**Goal:** Production-grade payment flows and internal money representation.

| Capability | Implementation focus |
|------------|----------------------|
| Payment provider | Stripe, Razorpay, or similar: create/capture flow; **webhooks** with signature verification. |
| Idempotency | Keys on create, capture, and refund; store provider payment ids on `Order` / `Payment` documents. |
| Wallet and ledger | **Append-only ledger** entries per user (and later per restaurant); balance derived from entries only. |
| Tips and fees | Separate line items; included in reconciliation and exports. |
| Refunds | Provider refund API + matching ledger entries; support partial refunds. |

**Touchpoints:** Payment routes, dedicated webhook route, admin payment views, checkout UI, receipt emails (optional).

**Exit criteria:** At least one live payment method end-to-end; webhooks reconcile state; wallet is ledger-backed.

---

## Phase 4 — Marketplace economics and payouts

**Duration (indicative):** 3–5 weeks  
**Goal:** Revenue share and restaurant payables.

| Capability | Implementation focus |
|------------|----------------------|
| Commissions | Rules per restaurant or category; snapshot **commission rate** (or amount) on the order. |
| Payout batches | Statement periods, minimum thresholds, payable balance from ledger; admin review and export. |
| Tax and invoicing hooks | Jurisdiction-specific fields (e.g. GST/VAT); tax snapshot on order where required. |
| Disputes (financial) | Tickets linked to order and payment; states; complements bank chargeback process outside the app. |

**Touchpoints:** Admin finance and reporting, optional restaurant partner portal, extensions to order and payment models.

**Exit criteria:** Per-order commission clarity; batch payout workflow; dispute records tied to payment lifecycle.

---

## Phase 5 — Logistics: drivers, maps, proof of delivery

**Duration (indicative):** 4–6 weeks  
**Goal:** Operational delivery beyond text status updates.

| Capability | Implementation focus |
|------------|----------------------|
| Driver role | User type `driver`; authentication; assign, accept, reject with reasons. |
| Assignment | Start manual (admin); evolve to rules-based or distance-based assignment; store `assignedDriverId`. |
| Maps and ETA | Distance Matrix or Directions API; cache and rate-limit; store ETA snapshot on the order. |
| Proof of delivery | OTP, signature capture, or photo; store metadata and files (object storage in Phase 9 if not earlier). |
| Batching (optional) | Multiple stops per driver—only after single-stop flow is stable. |

**Touchpoints:** Driver API, driver-facing UI (web or app), admin dispatch, customer tracking UI.

**Exit criteria:** Driver lifecycle complete; ETA visible to customer; POD linked to order event log.

---

## Phase 6 — Real-time, notifications, and engagement

**Duration (indicative):** 3–5 weeks  
**Goal:** Live updates and reliable outbound communication.

| Capability | Implementation focus |
|------------|----------------------|
| WebSockets or SSE | Per-order or per-user channel; push status and ETA from backend when events occur. |
| Notification queue | Email, SMS, and push jobs via queue; retries and dead-letter handling; templates. |
| Push notifications | FCM or web push; device tokens on user profile; same queue as above. |
| In-app notification center | Read/unread inbox backed by MongoDB. |

**Touchpoints:** Web server upgrade or separate WS gateway, Redis adapter if scaling sockets, frontend subscriptions on tracking pages.

**Exit criteria:** Order updates without full page reload; outbound messages observable and retryable.

---

## Phase 7 — Growth: referrals, loyalty, campaigns

**Duration (indicative):** 3–5 weeks  
**Goal:** Acquisition and retention loops.

| Capability | Implementation focus |
|------------|----------------------|
| Referrals | Codes, attribution window, rewards via ledger, velocity and abuse caps. |
| Loyalty points | Accrue on paid orders; redemption rules; expiry via scheduled job. |
| Campaigns | User segments (tags or simple RFM); targeted coupons; integrate with **feature flags** for experiments. |
| Dynamic pricing (light) | Time- or load-based multipliers; Redis-cached rules; transparent breakdown in cart. |

**Touchpoints:** Extend offers/coupons, user profile, admin campaign tools, checkout.

**Exit criteria:** Referral and points flows measurable in admin; campaigns repeatable; pricing rules auditable.

---

## Phase 8 — Trust, fraud, KYC, compliance depth

**Duration (indicative):** 3–5 weeks  
**Goal:** Safer marketplace and operator confidence.

| Capability | Implementation focus |
|------------|----------------------|
| Restaurant KYC | Document upload, verification states, block go-live until approved. |
| Fraud signals | Velocity limits, duplicate accounts, elevated chargeback flags; use existing activity logging. |
| Dispute resolution | SLA states, internal notes, attachments; link to refunds from Phase 3. |
| GDPR and retention | Purpose-based retention jobs; extend data export to new entities (ledger, events, KYC). |

**Touchpoints:** Admin review queues, secure file handling, minimal risk dashboard.

**Exit criteria:** Onboarding gated by KYC where configured; fraud signals visible; disputes have end-to-end workflow.

---

## Phase 9 — Platform scale and professional infrastructure

**Duration (indicative):** 4–8 weeks (first slice)  
**Goal:** Discoverability, media at scale, and observability.

| Capability | Implementation focus |
|------------|----------------------|
| Search | Meilisearch, Elasticsearch, or OpenSearch for dishes and restaurants; sync on menu changes. |
| Object storage | S3-compatible storage for images, POD, KYC; signed URLs; lifecycle policies. |
| Analytics events | Append-only `analytics_events` or stream to a warehouse later; nightly export optional. |
| Observability | Structured logging, request IDs, metrics (e.g. Prometheus or OpenTelemetry); deepen health checks. |
| Subscriptions / meal plans (optional) | Recurring billing and order generation—only after Phase 3 is stable. |

**Exit criteria:** Search is a primary discovery path; uploads off local disk; operational visibility for production.

---

## Phase 10 — Advanced extras and polish

**Priority:** Choose based on product need; can run in parallel with late phases.

| Capability | Notes |
|------------|--------|
| Group orders / split payment | Shared cart + settlement against ledger; complex UX and edge cases. |
| A/B testing | Assignment service (e.g. Redis); experiment metadata in admin. |
| Route optimization | OR-Tools or third-party last-mile APIs; after Phase 5 is mature. |
| Partner API | OAuth2 client credentials for POS or external fulfillment. |

---

## Dependency overview

```
Phase 0 (conventions, event log, job queue)
    → Phase 1 (catalog, zones, hours, modifiers)
        → Phase 2 (lifecycle, snapshots, scheduling)
            → Phase 3 (payments, wallet, webhooks)
                → Phase 4 (commissions, payouts, financial disputes)
                    → Phase 5 (drivers, maps, POD)
                        → Phase 6 (real-time + notifications)
                            → Phase 7 (growth)
                                → Phase 8 (trust / KYC / fraud)
                                    → Phase 9 (search, storage, analytics)
                                        → Phase 10 (optional advanced)
```

---

## Execution notes

- Treat **each phase as a release boundary** (or multiple PRs behind feature flags).
- After **Phase 2**, treat **order document shape** as contractual for payments and payouts—use migrations and versioning when changing it.
- Run **regression checks** after Phases 3 (money), 5 (dispatch), and 6 (real-time).

---

## Document history

| Version | Notes |
|---------|--------|
| 1.0 | Initial roadmap aligned with advanced feature areas (marketplace, payments, logistics, growth, trust, platform). |
