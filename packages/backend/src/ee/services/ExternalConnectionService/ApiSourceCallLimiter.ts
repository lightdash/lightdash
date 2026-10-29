import { TooManyRequestsError } from '@lightdash/common';
import { randomUUID } from 'node:crypto';
import type { ApiConnectorLimits } from '../../../services/QuerySourceService/api/ApiConnector';
import type { ExternalConnectionModel } from '../../models/ExternalConnectionModel';

type CallLimiterModel = Pick<
    ExternalConnectionModel,
    | 'tryAcquireApiSourceCallLease'
    | 'tryCountApiSourceCall'
    | 'releaseApiSourceCallLease'
>;

type LimitedConnection = {
    externalConnectionUuid: string;
    name: string;
    timeoutMs: number;
};

// Queries run as background jobs, so waiting a little for a slot beats failing.
const SLOT_WAIT_MS = 15_000;
const SLOT_POLL_MS = 250;
// A crashed server's slot frees itself once the call could no longer be running.
const LEASE_MARGIN_MS = 15_000;
const BUSY_RETRY_AFTER_SECONDS = 5;

export const getWindowStart = (now: Date, windowSeconds: number) =>
    new Date(
        Math.floor(now.getTime() / (windowSeconds * 1_000)) *
            windowSeconds *
            1_000,
    );

/** Keeps calls through a live source inside its API's limits, across every backend server. */
export class ApiSourceCallLimiter {
    private readonly model: CallLimiterModel;

    private readonly now: () => Date;

    private readonly sleep: (ms: number) => Promise<void>;

    constructor(args: {
        model: CallLimiterModel;
        now?: () => Date;
        sleep?: (ms: number) => Promise<void>;
    }) {
        this.model = args.model;
        this.now = args.now ?? (() => new Date());
        this.sleep =
            args.sleep ??
            ((ms) =>
                new Promise((resolve) => {
                    setTimeout(resolve, ms);
                }));
    }

    async run<T>(
        connection: LimitedConnection,
        limits: ApiConnectorLimits,
        call: () => Promise<T>,
    ): Promise<T> {
        const leaseUuid = randomUUID();
        await this.acquireSlot(connection, limits, leaseUuid);
        try {
            await this.countCall(
                connection,
                60,
                'minute',
                limits.callsPerMinute,
            );
            await this.countCall(
                connection,
                3_600,
                'hour',
                limits.callsPerHour,
            );
            return await call();
        } finally {
            await this.model.releaseApiSourceCallLease(
                connection.externalConnectionUuid,
                leaseUuid,
            );
        }
    }

    private async acquireSlot(
        connection: LimitedConnection,
        limits: ApiConnectorLimits,
        leaseUuid: string,
    ): Promise<void> {
        const giveUpAt = this.now().getTime() + SLOT_WAIT_MS;
        for (;;) {
            const expiresAt = new Date(
                this.now().getTime() + connection.timeoutMs + LEASE_MARGIN_MS,
            );
            // eslint-disable-next-line no-await-in-loop
            const acquired = await this.model.tryAcquireApiSourceCallLease(
                connection.externalConnectionUuid,
                limits.concurrentCalls,
                leaseUuid,
                expiresAt,
            );
            if (acquired) return;
            if (this.now().getTime() >= giveUpAt) {
                throw new TooManyRequestsError(
                    `Connection "${connection.name}" is already running ${limits.concurrentCalls} queries at once. Retry in ${BUSY_RETRY_AFTER_SECONDS} seconds.`,
                    { retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS },
                );
            }
            // eslint-disable-next-line no-await-in-loop
            await this.sleep(SLOT_POLL_MS);
        }
    }

    // A call refused by the hourly window still counts in the minute window,
    // which can only make the limiter stricter.
    private async countCall(
        connection: LimitedConnection,
        windowSeconds: number,
        unit: string,
        limit: number,
    ): Promise<void> {
        const now = this.now();
        const windowStartedAt = getWindowStart(now, windowSeconds);
        const counted = await this.model.tryCountApiSourceCall(
            connection.externalConnectionUuid,
            windowSeconds,
            windowStartedAt,
            limit,
        );
        if (counted) return;
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil(
                (windowStartedAt.getTime() +
                    windowSeconds * 1_000 -
                    now.getTime()) /
                    1_000,
            ),
        );
        throw new TooManyRequestsError(
            `Connection "${connection.name}" reached its limit of ${limit} calls per ${unit}. Retry after ${retryAfterSeconds} seconds.`,
            { retryAfterSeconds },
        );
    }
}
