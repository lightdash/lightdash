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
    ApiSourceRateWindow,
    ExternalConnectionModel,
} from '../../models/ExternalConnectionModel';

type RateGateModel = Pick<
    ExternalConnectionModel,
    | 'chargeApiSourceRateBuckets'
    | 'refundApiSourceRateBuckets'
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

/** How long a call may wait for its turn before it is refused. */
export const DEFAULT_RATE_LIMIT_DEADLINE_MS = 60_000;

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

    async run<T>(
        target: RateLimitTarget,
        call: (turn: RateLimitTurn) => Promise<T>,
        { deadlineMs = DEFAULT_RATE_LIMIT_DEADLINE_MS } = {},
    ): Promise<T> {
        const { turn, release } = await this.admit(target, deadlineMs);
        try {
            return await call(turn);
        } finally {
            await release();
        }
    }

    private async admit(
        target: RateLimitTarget,
        deadlineMs: number,
    ): Promise<{ turn: RateLimitTurn; release: () => Promise<void> }> {
        const startedAt = this.now().getTime();
        const giveUpAt = startedAt + deadlineMs;
        try {
            const windows = await this.chargeBuckets(target, giveUpAt);
            let leaseUuid: string;
            try {
                await this.takePacedTurn(target, giveUpAt);
                leaseUuid = await this.takeSlot(target, giveUpAt);
            } catch (error) {
                await this.model.refundApiSourceRateBuckets(
                    target.limitKey,
                    windows,
                );
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
                release: () =>
                    this.model.releaseApiSourceRateSlot(
                        target.limitKey,
                        leaseUuid,
                    ),
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
        { limitKey, label, rateLimits }: RateLimitTarget,
        giveUpAt: number,
    ): Promise<ApiSourceRateWindow[]> {
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
                throw refuse({
                    message: `${label} limit reached (${formatCount(
                        charge.used,
                    )}/${formatCount(bucket.capacity)} calls ${
                        bucket.label
                    }). Resumes at ${formatUtcTime(
                        charge.resumesAt,
                        bucket.windowMs < 3_600_000,
                    )}.`,
                    code: RATE_LIMITED,
                    resumesAt: charge.resumesAt,
                    now: charge.now,
                    bucket: { id: bucket.id, label: bucket.label },
                    used: charge.used,
                    limit: bucket.capacity,
                });
            }
            // eslint-disable-next-line no-await-in-loop
            await this.sleep(Math.max(1, waitMs));
        }
    }

    /** Waits for an evenly spaced turn when the integration limits calls a second. */
    private async takePacedTurn(
        { limitKey, label, rateLimits }: RateLimitTarget,
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
            throw refuse({
                message: `Too many ${label} calls are queued (${formatCount(
                    callsPerSecond,
                )} a second allowed). Resumes at ${formatUtcTime(
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
        { limitKey, label, rateLimits, timeoutMs }: RateLimitTarget,
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
                    throw refuse({
                        message: `${label} is already running ${formatCount(
                            rateLimits.concurrentCalls,
                        )} calls at once. Retry in ${BUSY_RETRY_AFTER_SECONDS} seconds.`,
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
