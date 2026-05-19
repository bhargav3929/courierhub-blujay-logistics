# Client Dashboard — Self-Shipment Test Plan

Validates the self-shipment integration inside the merchant-facing
client portal. Scope is **client-side only**: legacy `(client)` route
group + the self-shipment feature added on top of `/add-shipment` and
`/client-shipments`.

For B2B platform testing, see
[b2b/B2B_PLATFORM_TEST_PLAN.md](b2b/B2B_PLATFORM_TEST_PLAN.md).

---

## 0. Overview

| Surface | Tests | Severity mix |
|---|---|---|
| Booking flow | 4 | 3×P0 · 1×P1 |
| Tracking dialog | 2 | 1×P0 · 1×P2 |
| Status progression | 3 | 2×P0 · 1×P1 |
| Label printing | 1 | 1×P0 |
| Mobile + persistence | 3 | 2×P0 · 1×P1 |
| Permission isolation | 2 | 2×P0 |

**Total: 15 tests · ~1.5 hours** for one operator with browser + DevTools.

---

## 1. Pre-flight

| # | Check | How |
|---|---|---|
| PF-1 | Dev server running on `:3000` | `npm run dev` |
| PF-2 | At least one client user (role = `franchise` / `shopify` / `white_label`) exists | `node scripts/promote-to-admin.mjs` lists users with roles |
| PF-3 | Signed in as that client user | Look at `/client-dashboard` — header should say client's name, not "Super Admin" |
| PF-4 | A clean shipment list to start | Optional: `node scripts/delete-self-shipments.mjs --all` |

If you need to switch from an admin session to a client session:
- Click the avatar at the bottom of the sidebar → **Log out**
- Sign in as a client account at the login page

---

## 2. Test format

```
### XX-NN  Title                                       [P0 | P1 | P2]
Validates: <what it proves>
Setup: <preconditions>
Steps: 1, 2, 3 ...
Expected: <pass criteria>
Failure modes: <what wrong looks like>
```

| Tier | Meaning |
|---|---|
| **P0** | Blocks the feature shipping |
| **P1** | Should fix before broad rollout |
| **P2** | Polish — backlog |

---

## A. Booking flow

### CD-01  Self-shipment booking — happy path                        [P0]

Validates: end-to-end creation through the `/add-shipment` wizard.

Setup: signed in as client; no other self-shipments needed.

Steps:
1. Open `/add-shipment`.
2. Step 1 — fill From and To addresses. Use real Indian pincodes (e.g., From 560001, To 560066). Phones must be 10–15 digits.
3. Step 2 — weight 500g, dims 20×15×10 cm, declared value ₹500.
4. Step 3 — at least one product line ("Test product").
5. Step 4 — select the **Self Shipment** card (violet, with `Package` icon, tagline "You arrange transport · BJ tracking number").
6. The violet "Expected delivery date + Notes" block should appear under the card grid.
7. Click **Book via Self Shipment**.

Expected:
- Toast: "Creating self-shipment..." → "Self-shipment created! Tracking: BJ-..."
- Redirect to `/client-shipments` within ~1.5 s
- New row at the top with channel `Direct` (or `Shopify` if booking from a Shopify order), status `BOOKED`, tracking starting with `BJ-`

Failure modes:
- Toast "Booking Failed: Blue Dart Error" → the Self Shipment branch wasn't entered; verify `selectedCourier === 'Self Shipment'` reached `handleBookSelfShipment`
- 401 redirect → role mismatch; check Section E

### CD-02  Optional fields — expected delivery + notes                [P1]

Validates: optional self-shipment inputs persist correctly.

Steps:
1. Repeat CD-01 but in step 6 enter a date 5 days from today and a note "handle with care".
2. Submit, wait for redirect, find the new row.
3. Click the three-dot menu → **Track Package**.

Expected: the tracking dialog shows the date under "Expected delivery" and the note under "Notes".

Failure modes:
- Fields missing → check `Shipment` type accepts `expectedDeliveryDate` and the value flowed through `handleBookSelfShipment`

### CD-03  Card selection — only Self Shipment shows the extras       [P1]

Validates: the violet expected-delivery + notes block only appears when Self Shipment is selected, doesn't leak into the carrier UX.

Steps:
1. On `/add-shipment` Step 4, click each card in turn: Blue Dart, DTDC, Delhivery.
2. Then click Self Shipment.

Expected:
- For Blue Dart / DTDC / Delhivery: the violet block is **hidden**; carrier-specific service-type pickers are visible
- For Self Shipment: the violet block is **visible**; no carrier service-type pickers

### CD-04  Pickup-address autosave doesn't conflict                   [P2]

Validates: if the client has a saved default pickup address, choosing Self Shipment doesn't break the saved-address load.

Steps:
1. Open `/add-shipment` — pickup fields should auto-populate from saved default.
2. Pick Self Shipment → the saved address remains.
3. Submit.

Expected: the booked self-shipment uses the saved pickup address.

---

## B. Tracking dialog

### CD-05  Tracking dialog — simplified timeline                      [P0]

Validates: client-facing tracking surface hides all operational details.

Steps:
1. On any self-shipment row, click the three-dot menu → **Track Package**.

Expected: the new `SelfShipmentTrackingDialog` opens with:
- Violet "Self Shipment" header label
- Copyable tracking number pill at the top
- 4-stage horizontal timeline: Booked → Picked Up → In Transit → Delivered, with the current stage highlighted
- From / To / Contact rows
- If present: Expected delivery / Notes rows
- Footer: "Status updates are entered manually by the sender."

**Must NOT appear:**
- Raw event log
- Saga checkpoint
- Internal status codes
- `partnerId` / `clientId` / `shipmentId` (the BJ number is the only identifier shown)
- Retry counters
- Carrier scan codes

Failure modes:
- Old carrier-style dialog opens → `handleTrackShipment` didn't early-return for Self Shipment
- Raw events visible → wrong component is being rendered

### CD-06  Track copy-to-clipboard                                    [P2]

Steps: click the tracking number pill at the top of the tracking dialog.

Expected: toast "Tracking number copied"; the copy icon flips to a checkmark for ~1.5 s; clipboard contains the BJ number.

---

## C. Status progression

### CD-07  Inline next-status pill — Mark Picked Up                   [P0]

Validates: inline pill button is visible and works (without opening the dropdown).

Setup: a fresh self-shipment in `pending` status.

Steps:
1. Look at the Action column on the row.
2. There should be a **violet pill** "Mark Picked Up" to the left of the three-dot menu.
3. Click it → confirm prompt → OK.

Expected:
- Toast "Marked In Transit"
- Status badge flips from `BOOKED` to `TRANSIT`
- Pill turns emerald with "Mark Delivered" label
- The tracking dialog timeline now shows the In Transit stage as current

Failure modes:
- No pill at all → check `shp.courier === 'Self Shipment'` AND `shp.status === 'pending'` conditions
- Pill renders but click does nothing → state isn't updating; check `handleAdvanceSelfShipmentStatus`

### CD-08  Inline next-status pill — Mark Delivered                   [P0]

Validates: terminal forward transition.

Setup: continuing from CD-07 (status = `transit`).

Steps:
1. Click the emerald **Mark Delivered** pill → confirm.

Expected: badge → `DELIVERED`. Pill disappears. Inline action column shows only the three-dot menu.

### CD-09  Invalid transition not offered                             [P1]

Validates: only the legal next transition is offered.

Steps:
1. On a `pending` row, three-dot menu — only "Mark In Transit" is shown (not "Mark Delivered" yet).
2. After marking In Transit, re-open the menu — "Mark In Transit" is now gone, "Mark Delivered" is visible.
3. After marking Delivered, the menu shows neither (terminal state).

Expected: the menu honors linear progression. No "Mark Delivered" appears when status is `pending`.

Note: legacy `Shipment['status']` collapses `picked_up` and `in_transit` into a single `transit` value. The B2B platform has finer granularity; legacy doesn't. This is intentional for client UX simplicity.

---

## D. Label printing

### CD-10  Label printing — Self Shipment label renders               [P0]

Steps:
1. Three-dot menu → click **Invoice**.
2. The label dialog opens.
3. Confirm the **violet Blujay-branded label** renders with:
   - "Blujay · SELF SHIPMENT" header in violet
   - Date
   - From and To boxes
   - Big BJ tracking number with a barcode
   - Weight, dimensions, declared value
   - Contents list
   - Footer: "No carrier · Customer arranges transport · Updates manual"
4. Toggle **Thermal 4×6** ↔ **A4 Sheet** at the top-left — both options should be available.
5. Click **Print Label** at the top-right.

Expected: a new browser window opens with the formatted label and an auto-print dialog appears.

Failure modes:
- BlueDart label renders instead → check `selectedShipmentForLabel.courier === 'Self Shipment'` branch
- Print window blank → `printSelfShipmentLabel` couldn't find the `#self-shipment-label` element

---

## E. Mobile + persistence

### CD-11  Mobile responsiveness                                      [P1]

Validates: every client surface works on a 375 px phone viewport.

Steps:
1. DevTools → device mode → iPhone 12 Pro (390 × 844).
2. Walk through CD-01 → CD-10 at that viewport.

Expected:
- `/add-shipment` wizard steps stack vertically, no horizontal scroll
- Courier picker cards stack to 1 column
- Self Shipment extras (date + notes) stack vertically
- Tracking dialog timeline icons shrink (`h-8 w-8` mobile vs `h-10 w-10` desktop)
- Inline pill button doesn't push the three-dot menu off-screen
- Label dialog scrolls cleanly

Failure modes:
- Horizontal scroll → some element wider than viewport; inspect with DevTools
- Truncated text → add `truncate` or shorten label

### CD-12  Refresh persistence                                        [P0]

Validates: state survives full page reloads.

Steps:
1. Mark a self-shipment as In Transit.
2. **Hard-refresh** the page (Ctrl + Shift + R).

Expected: the row still shows `TRANSIT` status; the inline pill is still "Mark Delivered"; the timeline in the tracking dialog still shows In Transit as current.

Failure modes:
- Status reverts → status wasn't persisted to Firestore (local-state-only bug)
- Pill disappears → menu visibility condition is wrong

### CD-13  Double-click safety                                        [P1]

Validates: rapid clicks on the inline pill don't double-write.

Steps:
1. Chrome DevTools → Network tab → throttling → **Slow 3G**.
2. On a `pending` self-shipment, click **Mark Picked Up** twice in rapid succession.

Expected: only one Firestore write happens. Status ends at `transit`, not stuck. Toast appears once or twice but no error.

Failure modes:
- Two writes (visible in Firebase Console history) → handler isn't guarding against in-flight state. Add a `loading` flag to the pill, mirroring how `cancellingId` is used for cancel.
- Inconsistent badge → race condition; fix by disabling pill while `loading`

---

## F. Permission isolation

### CD-14  Client cannot access admin routes                          [P0]

Validates: route group ProtectedRoute keeps clients out of admin pages.

Steps: signed in as a client user, paste each into the address bar one at a time:
- `http://localhost:3000/admin-dashboard`
- `http://localhost:3000/shipments`
- `http://localhost:3000/b2b/shipments`
- `http://localhost:3000/b2b/operations`
- `http://localhost:3000/b2b/api-keys`
- `http://localhost:3000/b2b/self-ship/new`

Expected: each redirects to `/client-dashboard` within ~300 ms. No admin content is visible at any time during the redirect.

Failure modes:
- Admin page renders → **P0 critical**; `ProtectedRoute` not catching role mismatch
- Brief flash of admin content before redirect → acceptable (client-side guard); but the `useEffect` should fire quickly

### CD-15  Client sidebar has no admin/operational links               [P0]

Validates: the ClientSidebar shouldn't even tempt a client into an admin route.

Steps: open `/client-dashboard`. Inspect the left sidebar nav items.

Expected: every link goes to a `(client)` route group page. No link to `/b2b/*`, `/admin-dashboard`, `/shipments` (legacy admin), `/clients`, `/couriers`, `/reports` (admin).

Failure modes: if any admin route is linked, the link will appear to work for an admin user but will redirect a client back — confusing UX even if technically blocked.

---

## 3. Sign-off

| Group | Tester | Date | Result | Notes |
|---|---|---|---|---|
| Booking (CD-01..04) | | | | |
| Tracking (CD-05..06) | | | | |
| Progression (CD-07..09) | | | | |
| Label (CD-10) | | | | |
| Mobile + Persist (CD-11..13) | | | | |
| Permissions (CD-14..15) | | | | |

**Pass criteria:** all P0 green, all P1 green or waived.

---

## 4. Cleanup after testing

```bash
node scripts/delete-self-shipments.mjs --all
```

Wipes every Self Shipment row from the legacy `shipments` collection.

---

## 5. Known limitations (not Phase 1–4 bugs)

| Limitation | Why | Workaround |
|---|---|---|
| Status granularity collapses `picked_up` and `in_transit` into a single legacy `transit` value | Legacy `Shipment['status']` predates this work | Live with it for client UX; B2B platform has fine-grained statuses |
| No automatic delivery date reminder | Out of scope for Phase 4 | Sender remembers / calendars |
| Manifest print on `/client-shipments` doesn't yet handle Self Shipment | Pre-existing; out of scope | Use the per-row "Invoice" label as a stand-in |
| Return Shipment from a Self Shipment row inherits the courier — Self Shipment can't currently return | Pre-existing | Manual workaround: cancel + book new |

These belong to a future iteration. None block the Self Shipment client feature.
