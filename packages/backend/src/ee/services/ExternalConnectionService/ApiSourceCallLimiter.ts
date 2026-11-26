import {
    TooManyRequestsError,
    type LiveSourceErrorCode,
} from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import type PrometheusMetrics from '../../../prometheus/PrometheusMetrics';
import type {
    LiveRateLimitBucket,
    LiveRateLimits,
} from '../../../services/QuerySourceService/live/spec/types';
import type {
    ApiSourceRateChargedWindow,
    ExternalConnectionModel,
} from '../../models/ExternalConnectionModel';
import type { AdminSetLimits } from './rateLimitSettings';

type RateGateModel = Pick<
    ExternalConnectionModel,
    | 'chargeApiSourceRateBuckets'
    | 'refundApiSourceRateBuckets'
    | 'holdApiSourceRateBuckets'
    | 'bookApiSourceRateTurn'
    | 'tryTakeApiSourceRateSlot'
    | 'releaseApiSourceRateSlot'
>;

type RateGateMetrics = Pick<
    PrometheusMetrics,
    'observeLiveSourceRateWait' | 'incrementLiveSourceRateRefusal'
>;

/** What is limited, and by how much. */
export type RateLimitTarget = {
    /** Rows are kept against it; today the integration's uuid. */
    limitKey: string;
    /** The integration's connector, for metrics. */
    integration: string;
    /** The integration's label, e.g. "HubSpot", for messages and metrics. */
    label: string;
    rateLimits: LiveRateLimits;
    setByAdmin: AdminSetLimits;
    /** How long one call may run; a slot outlives it by a margin. */
    timeoutMs: number;
};

/** The gate's decision for one call, for the per-call log. */
export type RateLimitTurn = {
    limitKey: string;
    /** The ids of the buckets the call was charged to. */
    buckets: string[];
    waitedMs: number;
};

/** A limit that a call has just filled. */
export type ReachedRateLimit = {
    bucket: LiveRateLimitBucket;
    isSetByAdmin: boolean;
};

/** The integration said to slow down; `resumesAt` is null when it didn't say until when. */
export type VendorRateLimit = { resumesAt: Date | null };

/** How long a call may wait for its turn before it is refused. */
export const DEFAULT_RATE_LIMIT_DEADLINE_MS = 60_000;

// Retries after the integration says to slow down, within the deadline.
const MAX_VENDOR_RETRIES = 2;

// Shorter windows fill too often for each filling to be worth recording.
const MIN_REPORTED_WINDOW_MS = 60 * 60 * 1_000;

const SLOT_POLL_MS = 250;
// A crashed server's slot frees itself once the call could no longer be running.
const SLOT_MARGIN_MS = 15_000;
const BUSY_RETRY_AFTER_SECONDS = 5;

const RATE_LIMITED: LiveSourceErrorCode = 'live_source.upstream.rate_limited';
const CONCURRENCY_LIMIT: LiveSourceErrorCode =
    'live_source.internal.concurrency_limit';

const formatCount = (count: number) => count.toLocaleString('en-US');

const formatUtcTime = (date: Date, withSeconds: boolean) =>
    `${date.toISOString().slice(11, withSeconds ? 19 : 16)} UTC`;

const refuse = ({
    message,
    code,
    resumesAt,
    now,
    bucket = null,
    used = null,
    limit = null,
}: {
    message: string;
    code: LiveSourceErrorCode;
    resumesAt: Date;
    now: Date;
    bucket?: Pick<LiveRateLimitBucket, 'id' | 'label'> | null;
    used?: number | null;
    limit?: number | null;
}) =>
    new TooManyRequestsError(message, {
        retryAfterSeconds: Math.max(
            1,
            Math.ceil((resumesAt.getTime() - now.getTime()) / 1_000),
        ),
        resumesAt: resumesAt.toISOString(),
        bucket,
        used,
        limit,
        liveSourceErrorCode: code,
        liveSourceErrorCodes: [code],
    });

/**
 * The buckets a "slow down" holds. With a resume time, every bucket the call
 * charged waits for it. Without one, only the shortest waits to the end of
 * its window: holding an hourly or daily bucket to its end would stop the
 * integration for hours over one throttled call.
 */
const getBucketsToHold = (
    target: RateLimitTarget,
    turn: RateLimitTurn,
    limited: VendorRateLimit,
): LiveRateLimitBucket[] => {
    const charged = target.rateLimits.buckets.filter(({ id }) =>
        turn.buckets.includes(id),
    );
    if (limited.resumesAt || charged.length === 0) return charged;
    const shortest = charged.reduce((a, b) =>
        b.windowMs < a.windowMs ? b : a,
    );
    return [shortest];
};

/** The long-window limits that the charged call used the last of. */
const getReachedLimits = (
    { rateLimits, setByAdmin }: RateLimitTarget,
    windows: ApiSourceRateChargedWindow[],
): ReachedRateLimit[] =>
    rateLimits.buckets
        .filter(
            ({ id, windowMs, capacity }) =>
                windowMs >= MIN_REPORTED_WINDOW_MS &&
                windows.some(
                    ({ bucketId, used }) =>
                        bucketId === id && used === capacity,
                ),
        )
        .map((bucket) => ({
            bucket,
            isSetByAdmin: setByAdmin.bucketIds.includes(bucket.id),
        }));

/**
 * Keeps calls to an integration inside its rate limits, across every backend
 * server. A call charges the buckets, then takes its paced turn, then a slot,
 * waiting for each while that comes before its deadline. A call refused
 * before it was sent gives its charge back.
 */
export class ApiSourceCallLimiter {
    private readonly model: RateGateModel;

    private readonly metrics: RateGateMetrics | undefined;

    private readonly now: () => Date;

    private readonly sleep: (ms: number) => Promise<void>;

    /** Callers waiting for a slot on this server, in arrival order. */
    private readonly slotQueues = new Map<string, symbol[]>();

    constructor(args: {
        model: RateGateModel;
        metrics?: RateGateMetrics;
        now?: () => Date;
        sleep?: (ms: number) => Promise<void>;
    }) {
        this.model = args.model;
        this.metrics = args.metrics;
        this.now = args.now ?? (() => new Date());
        this.sleep =
            args.sleep ??
            ((ms) =>
                new Promise((resolve) => {
                    setTimeout(resolve, ms);
                }));
    }

    /**
     * Runs one call in its turn. When `readRateLimit` says the integration
     * answered "slow down", the charged buckets are held (`getBucketsToHold`), and
     * the call is retried in a new turn, up to twice within the deadline.
     * Other calls on those buckets wait for the hold instead of calling.
     * `onLimitReached` hears of each limit of an hour or longer as a call that
     * gets through fills it.
     */
    async run<T>(
        target: RateLimitTarget,
        call: (turn: RateLimitTurn) => Promise<T>,
        {
            deadlineMs = DEFAULT_RATE_LIMIT_DEADLINE_MS,
            readRateLimit,
            onLimitReached,
        }: {
            deadlineMs?: number;
            readRateLimit?: (result: T) => VendorRateLimit | null;
            onLimitReached?: (reached: ReachedRateLimit) => void;
        } = {},
    ): Promise<T> {
        const giveUpAt = this.now().getTime() + deadlineMs;
        for (let attempt = 0; ; attempt += 1) {
            // eslint-disable-next-line no-await-in-loop
            const { turn, release, reached } = await this.admit(
                target,
                giveUpAt,
            );
            let result: T;
            try {
                reached.forEach((limit) => onLimitReached?.(limit));
                // eslint-disable-next-line no-await-in-loop
                result = await call(turn);
            } finally {
                // eslint-disable-next-line no-await-in-loop
                await release();
            }
            const limited = readRateLimit?.(result) ?? null;
            if (!limited || turn.buckets.length === 0) return result;
            // eslint-disable-next-line no-await-in-loop
            await this.model.holdApiSourceRateBuckets(
                target.limitKey,
                getBucketsToHold(target, turn, limited),
                limited.resumesAt,
            );
            if (attempt >= MAX_VENDOR_RETRIES) return result;
        }
    }

    private async admit(
        target: RateLimitTarget,
        giveUpAt: number,
    ): Promise<{
        turn: RateLimitTurn;
        release: () => Promise<void>;
        reached: ReachedRateLimit[];
    }> {
        const startedAt = this.now().getTime();
        try {
            const windows = await this.chargeBuckets(target, giveUpAt);
            let leaseUuid: string;
            try {
                await this.takePacedTurn(target, giveUpAt);
                leaseUuid = await this.takeSlot(target, giveUpAt);
            } catch (error) {
                // Best effort: a charge left in place only makes the limit stricter
                await this.model
                    .refundApiSourceRateBuckets(target.limitKey, windows)
                    .catch(() => undefined);
                throw error;
            }
            const waitedMs = this.now().getTime() - startedAt;
            this.metrics?.observeLiveSourceRateWait(
                target.integration,
                waitedMs,
            );
            return {
                turn: {
                    limitKey: target.limitKey,
                    buckets: windows.map(({ bucketId }) => bucketId),
                    waitedMs,
                },
                reached: getReachedLimits(target, windows),
                // Best effort: a slot left held frees itself when its lease expires
                release: () =>
                    this.model
                        .releaseApiSourceRateSlot(target.limitKey, leaseUuid)
                        .catch(() => undefined),
            };
        } catch (error) {
            if (error instanceof TooManyRequestsError) {
                this.metrics?.incrementLiveSourceRateRefusal(
                    target.integration,
                    error.data.liveSourceErrorCode,
                );
            }
            throw error;
        }
    }

    /** Charges every bucket, waiting for a full one to reset while that comes in time. */
    private async chargeBuckets(
        { limitKey, label, rateLimits, setByAdmin }: RateLimitTarget,
        giveUpAt: number,
    ): Promise<ApiSourceRateChargedWindow[]> {
        const { buckets } = rateLimits;
        if (buckets.length === 0) return [];
        for (;;) {
            // eslint-disable-next-line no-await-in-loop
            const charge = await this.model.chargeApiSourceRateBuckets(
                limitKey,
                buckets,
            );
            if (charge.charged) return charge.windows;
            const bucket =
                buckets.find(({ id }) => id === charge.bucketId) ?? buckets[0];
            const waitMs = charge.resumesAt.getTime() - charge.now.getTime();
            if (this.now().getTime() + waitMs > giveUpAt) {
                const resumes = `Resumes at ${formatUtcTime(
                    charge.resumesAt,
                    waitMs < 60_000,
                )}.`;
                // A limit lowered mid-window can already be passed
                const used = Math.min(charge.used, bucket.capacity);
                const reached = setByAdmin.bucketIds.includes(bucket.id)
                    ? 'limit set by your admin reached'
                    : 'limit reached';
                throw refuse({
                    message: charge.isHeldByVendor
                        ? `${label} asked Lightdash to slow down. ${resumes}`
                        : `${label} ${reached} (${formatCount(
                              used,
                          )}/${formatCount(bucket.capacity)} calls ${
                              bucket.label
                          }). ${resumes}`,
                    code: RATE_LIMITED,
                    resumesAt: charge.resumesAt,
                    now: charge.now,
                    bucket: { id: bucket.id, label: bucket.label },
                    used,
                    limit: bucket.capacity,
                });
            }
            // eslint-disable-next-line no-await-in-loop
            await this.sleep(Math.max(1, waitMs));
        }
    }

    /** Waits for an evenly spaced turn when the integration limits calls a second. */
    private async takePacedTurn(
        { limitKey, label, rateLimits, setByAdmin }: RateLimitTarget,
        giveUpAt: number,
    ): Promise<void> {
        const { callsPerSecond } = rateLimits;
        if (!callsPerSecond) return;
        const turn = await this.model.bookApiSourceRateTurn(
            limitKey,
            1_000 / callsPerSecond,
            Math.max(0, giveUpAt - this.now().getTime()),
        );
        if (!turn.booked) {
            const allowed = setByAdmin.callsPerSecond
                ? 'allowed by your admin'
                : 'allowed';
            throw refuse({
                message: `Too many ${label} calls are queued (${formatCount(
                    callsPerSecond,
                )} a second ${allowed}). Resumes at ${formatUtcTime(
                    turn.turnAt,
                    true,
                )}.`,
                code: RATE_LIMITED,
                resumesAt: turn.turnAt,
                now: turn.now,
            });
        }
        const waitMs = turn.turnAt.getTime() - turn.now.getTime();
        if (waitMs > 0) await this.sleep(waitMs);
    }

    /**
     * Waits for one of the integration's slots. Callers on this server try
     * in arrival order; across servers, whoever polls first after a release.
     */
    private async takeSlot(
        { limitKey, label, rateLimits, setByAdmin, timeoutMs }: RateLimitTarget,
        giveUpAt: number,
    ): Promise<string> {
        const leaseUuid = randomUUID();
        const ticket = Symbol(leaseUuid);
        const queue = this.slotQueues.get(limitKey) ?? [];
        queue.push(ticket);
        this.slotQueues.set(limitKey, queue);
        try {
            for (;;) {
                if (queue[0] === ticket) {
                    // eslint-disable-next-line no-await-in-loop
                    const taken = await this.model.tryTakeApiSourceRateSlot(
                        limitKey,
                        rateLimits.concurrentCalls,
                        leaseUuid,
                        timeoutMs + SLOT_MARGIN_MS,
                    );
                    if (taken) return leaseUuid;
                }
                const now = this.now();
                if (now.getTime() >= giveUpAt) {
                    const running = `${label} is already running`;
                    const atOnce = formatCount(rateLimits.concurrentCalls);
                    const busy = setByAdmin.concurrentCalls
                        ? `${running} as many concurrent requests as your admin allows (${atOnce})`
                        : `${running} ${atOnce} concurrent requests`;
                    throw refuse({
                        message: `${busy}. Retry in ${BUSY_RETRY_AFTER_SECONDS} seconds.`,
                        code: CONCURRENCY_LIMIT,
                        resumesAt: new Date(
                            now.getTime() + BUSY_RETRY_AFTER_SECONDS * 1_000,
                        ),
                        now,
                        used: rateLimits.concurrentCalls,
                        limit: rateLimits.concurrentCalls,
                    });
                }
                // eslint-disable-next-line no-await-in-loop
                await this.sleep(SLOT_POLL_MS);
            }
        } finally {
            queue.splice(queue.indexOf(ticket), 1);
            if (queue.length === 0) this.slotQueues.delete(limitKey);
        }
    }
}
