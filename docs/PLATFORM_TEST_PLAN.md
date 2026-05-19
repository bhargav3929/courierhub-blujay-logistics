# Blujay Platform — Test Plan Index

The platform has two **separately-testable** surfaces. Each has its own
focused test plan. Use this page as a map.

| Surface | Test plan | Scope | Estimated time |
|---|---|---|---|
| **Client Dashboard — Self-Shipment** | [CLIENT_SELF_SHIPMENT_TEST_PLAN.md](CLIENT_SELF_SHIPMENT_TEST_PLAN.md) | Merchant-facing portal: `/add-shipment`, `/client-shipments`, tracking + label + status progression for self-shipments | ~1.5 hours |
| **B2B Platform** | [b2b/B2B_PLATFORM_TEST_PLAN.md](b2b/B2B_PLATFORM_TEST_PLAN.md) | B2B backend: REST APIs, sagas, webhooks, admin pages, operations, deployment, security | ~8–10 hours |

---

## Which one do I run?

- **Shipping a client-portal change** (anything under `src/app/(client)/`
  or related components): run the **Client Self-Shipment Test Plan**.
- **Shipping a B2B change** (anything under `src/app/(admin)/b2b/`,
  `src/services/b2b/`, `src/app/api/v1/b2b/`, or `src/app/api/cron/`):
  run the **B2B Platform Test Plan**.
- **Shipping a release** that touches both: run both.

The two plans share `Pre-flight` setup (env vars, Firebase, license)
but otherwise touch independent code paths.

---

## Sequence for a full platform release

If you're cutting a release that includes work in both surfaces, the
recommended order:

1. **Client Self-Shipment Test Plan** — faster, surfaces UI regressions early
2. **B2B Platform Test Plan** — heavier, run while the client tests are being signed off

Sign off each plan independently. Either may pass while the other has open issues — the surfaces are decoupled.

---

## Companion docs

These are referenced by both plans:

| Doc | Purpose |
|---|---|
| [b2b/DEPLOYMENT.md](b2b/DEPLOYMENT.md) | Infra deploy checklist |
| [b2b/FIREBASE.md](b2b/FIREBASE.md) | Firestore rules, emulator, backup |
| [b2b/FAILURE_DRILLS.md](b2b/FAILURE_DRILLS.md) | 10 saga + network drills |
| [b2b/WEBHOOK_VALIDATION.md](b2b/WEBHOOK_VALIDATION.md) | Webhook capture / verify / replay |
| [b2b/RUNBOOK.md](b2b/RUNBOOK.md) | 15 symptom-indexed incident workflows |
| [b2b/PRODUCTION_ROLLOUT.md](b2b/PRODUCTION_ROLLOUT.md) | Phased rollout gates |
| [b2b/carriers/](b2b/carriers/) | Per-carrier sandbox validation |
