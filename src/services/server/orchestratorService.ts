// Order → shipment fulfilment orchestrator.
//
// Sequences the three Shiprocket steps (create-order → assign-awb →
// generate-label) on a single order. Each step is idempotent — re-running
// after a partial completion picks up where it left off.
//
// Retry layers:
//   1. Inner   (shiprocketRequest)         retries 5xx + 401 + network within
//                                          a single API call (1s, 4s, 16s).
//   2. Step    (this orchestrator)         each step is wrapped in withRetry
//                                          to absorb the rare cross-step
//                                          eventual-consistency hiccup
//                                          (e.g. assign-awb run too soon
//                                          after create-order).
//   3. Cron    (Phase 7)                   on permanent failure here, we
//                                          set automation.nextRetryAt and
//                                          a cron picks the order back up.
//
// Phase 5 implements layers 1 and 2 + records intent for layer 3.
// Phase 7 will add the cron that executes layer 3.
import { withRetry } from '@/lib/retry';
import {
    getOrderById,
    setAutomationStage,
    scheduleRetry,
    clearScheduledRetry,
    tryAcquireFulfillmentLock,
    releaseFulfillmentLock,
} from '@/services/server/orderAdminService';
import {
    ensureShiprocketOrder,
    ensureAwbAssigned,
    ensureLabel,
    ShiprocketOpError,
} from '@/services/server/shiprocketOps';
import type { Order } from '@/types/order';

export type FulfillmentStep = 'create_order' | 'assign_awb' | 'generate_label';

export interface FulfillmentResult {
    ok: boolean;
    orderId: string;
    completedSteps: FulfillmentStep[];
    shipment?: {
        shiprocketOrderId?: string;
        shipmentId?: string;
        awb?: string;
        courierId?: number;
        courierName?: string;
        labelUrl?: string;
    };
    failedAt?: FulfillmentStep;
    error?: string;
    retryScheduledAt?: number;     // epoch ms; only set when we've enqueued a retry
    nextStepHint?: string;
}

interface FulfillOptions {
    courierId?: number;     // override Shiprocket's recommendation
}

// Backoff schedule for transient failures (re-runnable later).
// attempts → minutes-until-next-retry
//   0 → 5 min      (first failure: quick retry, likely a blip)
//   1 → 15 min
//   2 → 60 min     (1 hour)
//   3 → 240 min    (4 hours)
//   4 → 720 min    (12 hours)
//   ≥5 → don't schedule — give up; ops alert needed.
function backoffMinutes(attempt: number): number | null {
    const ladder = [5, 15, 60, 240, 720];
    if (attempt >= ladder.length) return null;
    return ladder[attempt];
}

// HTTP status codes that indicate a permanent (non-retryable) condition.
// 4xx other than 408/409/429 are caller errors that won't fix themselves.
function isPermanent(err: unknown): boolean {
    if (!(err instanceof ShiprocketOpError)) return false;
    const s = err.status;
    if (s >= 500) return false;       // server error → retryable
    if (s === 408 || s === 429) return false;
    if (s === 409) return false;       // conflict (e.g. not paid yet) — retry later may help
    return true;                      // 400, 401, 403, 404, 422 — fix the input
}

async function runStep<T>(
    step: FulfillmentStep,
    fn: () => Promise<T>
): Promise<T> {
    return withRetry(fn, {
        retries: 1,                     // one in-process retry; inner code already retries 5xx
        baseDelayMs: 2500,
        factor: 2,
        shouldRetry: (err) => !isPermanent(err),
        onRetry: (attempt, err) =>
            console.warn(
                `[orchestrator] step=${step} retry ${attempt}: ${(err as any)?.message}`
            ),
    });
}

/**
 * Run the full fulfilment pipeline for an order. Idempotent and safe to
 * call repeatedly (each step is a no-op when already complete).
 *
 * Returns success metadata or — on permanent failure — sets
 * automation.stage='failed'. On transient failure, schedules a retry
 * via automation.nextRetryAt for Phase 7's cron to pick up.
 */
export async function fulfillOrder(
    orderId: string,
    opts: FulfillOptions = {}
): Promise<FulfillmentResult> {
    const initial = await getOrderById(orderId);
    if (!initial) {
        return {
            ok: false,
            orderId,
            completedSteps: [],
            error: 'Order not found',
        };
    }

    // Soft pre-checks — surface clearly without retrying.
    if (initial.payment.status !== 'paid' && initial.payment.provider !== 'cod') {
        return {
            ok: false,
            orderId,
            completedSteps: [],
            error: 'Order is not paid yet — fulfilment skipped',
            nextStepHint: 'wait for payment.captured webhook or COD confirmation',
        };
    }
    if (initial.automation.stage === 'cancelled') {
        return {
            ok: false,
            orderId,
            completedSteps: [],
            error: 'Order is cancelled',
        };
    }

    // Concurrency lock — prevents a manual retry from running while the webhook
    // is also fulfilling the same order (and vice-versa). Stale locks (>2 min)
    // are auto-reclaimed inside tryAcquireFulfillmentLock.
    const lock = await tryAcquireFulfillmentLock(orderId);
    if (!lock.acquired) {
        console.warn(
            `[orchestrator] order=${orderId} skipped: ${lock.reason}`
        );
        return {
            ok: false,
            orderId,
            completedSteps: [],
            error: lock.reason || 'Fulfilment already in progress',
        };
    }

    try {
    const completed: FulfillmentStep[] = [];
    const shipment: FulfillmentResult['shipment'] = {};
    let order: Order = initial;

    const handleFailure = async (step: FulfillmentStep, err: unknown) => {
        const message =
            err instanceof Error ? err.message : String(err);
        const permanent = isPermanent(err);
        const attemptsSoFar = order.automation.attempts ?? 0;

        if (permanent) {
            await setAutomationStage(order.id, 'failed', {
                error: message,
                note: `permanent failure at ${step}`,
            });
            await clearScheduledRetry(order.id);
            console.error(
                `[orchestrator] order=${order.id} permanent failure at ${step}: ${message}`
            );
            return {
                ok: false as const,
                orderId,
                completedSteps: completed,
                shipment,
                failedAt: step,
                error: message,
            };
        }

        const minutes = backoffMinutes(attemptsSoFar);
        if (minutes === null) {
            // Out of attempts.
            await setAutomationStage(order.id, 'failed', {
                error: `${message} (max retries exceeded)`,
                note: `transient failure at ${step}, gave up after ${attemptsSoFar} attempts`,
            });
            await clearScheduledRetry(order.id);
            return {
                ok: false as const,
                orderId,
                completedSteps: completed,
                shipment,
                failedAt: step,
                error: `${message} (max retries exceeded)`,
            };
        }

        await scheduleRetry(order.id, minutes, message);
        const nextAt = Date.now() + minutes * 60 * 1000;
        console.warn(
            `[orchestrator] order=${order.id} transient failure at ${step}: ${message}. retry scheduled in ${minutes}m`
        );
        return {
            ok: false as const,
            orderId,
            completedSteps: completed,
            shipment,
            failedAt: step,
            error: message,
            retryScheduledAt: nextAt,
        };
    };

    // ---- Step 1: create-order ----
    try {
        const r = await runStep('create_order', () =>
            ensureShiprocketOrder(order)
        );
        shipment.shiprocketOrderId = r.shiprocketOrderId;
        shipment.shipmentId = r.shipmentId;
        completed.push('create_order');
        // Re-load order so the next step sees freshly-attached IDs.
        const reloaded = await getOrderById(order.id);
        if (reloaded) order = reloaded;
    } catch (err) {
        return handleFailure('create_order', err);
    }

    // ---- Step 2: assign-awb (auto-pick recommended courier when no override) ----
    try {
        const r = await runStep('assign_awb', () =>
            ensureAwbAssigned(order, opts.courierId)
        );
        shipment.awb = r.awb;
        shipment.courierId = r.courierId;
        shipment.courierName = r.courierName;
        completed.push('assign_awb');
        const reloaded = await getOrderById(order.id);
        if (reloaded) order = reloaded;
    } catch (err) {
        return handleFailure('assign_awb', err);
    }

    // ---- Step 3: generate-label ----
    try {
        const r = await runStep('generate_label', () => ensureLabel(order));
        shipment.labelUrl = r.labelUrl;
        completed.push('generate_label');
    } catch (err) {
        return handleFailure('generate_label', err);
    }

    // All done — clear any pending retry.
    await clearScheduledRetry(order.id);
    console.log(
        `[orchestrator] order=${order.id} fulfilled awb=${shipment.awb} courier=${shipment.courierName}`
    );

    return {
        ok: true,
        orderId,
        completedSteps: completed,
        shipment,
    };
    } finally {
        // Always release the lock, even on early return / thrown error.
        // Swallow release errors — stale-lock recovery (2-min timeout) is the safety net.
        await releaseFulfillmentLock(orderId).catch((err) => {
            console.warn(
                `[orchestrator] failed to release lock for order=${orderId}: ${err?.message || err}`
            );
        });
    }
}
