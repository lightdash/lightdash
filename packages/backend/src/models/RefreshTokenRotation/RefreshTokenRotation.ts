import { UnexpectedServerError } from '@lightdash/common';
import { type Knex } from 'knex';
import { DatabaseError } from 'pg';

export type RefreshRowKey = {
    kind: 'project' | 'organization' | 'user' | 'warehouseConnection';
    uuid: string;
    purpose: string | null;
};

export type RefreshRun<R> = {
    key: RefreshRowKey;
    shareKey: string;
    readCurrentRefreshToken: () => Promise<string | null>;
    exchange: (refreshToken: string) => Promise<R>;
    persist: (args: { lockedRefreshToken: string; result: R }) => Promise<void>;
};

type RefreshResult<R> = { result: R; refreshTokenUsed: string };
type InFlightRefreshes = Map<string, Promise<RefreshResult<unknown>>>;

export class RefreshTokenLockTimeoutError extends UnexpectedServerError {
    constructor() {
        super(
            'Timed out waiting to refresh warehouse credentials. Try again.',
            {
                code: 'warehouse_oauth_refresh_failed',
                retryable: true,
            },
        );
        this.name = 'RefreshTokenLockTimeoutError';
    }
}

export class RefreshTokenRowMissingError extends Error {
    constructor() {
        super('The warehouse credential row or refresh token is missing.');
        this.name = 'RefreshTokenRowMissingError';
    }
}

class RefreshAdmission {
    private active = 0;

    private readonly waiters = new Map<
        () => void,
        ReturnType<typeof setTimeout>
    >();

    constructor(private readonly maxConcurrent: number) {
        if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
            throw new Error('Refresh concurrency must be a positive integer.');
        }
    }

    async acquire(timeoutMs: number): Promise<void> {
        if (this.active < this.maxConcurrent) {
            this.active += 1;
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters.delete(resolve);
                reject(new RefreshTokenLockTimeoutError());
            }, timeoutMs);
            this.waiters.set(resolve, timer);
        });
    }

    release(): void {
        const next = this.waiters.entries().next();
        if (next.done) {
            this.active -= 1;
        } else {
            const [admit, timer] = next.value;
            this.waiters.delete(admit);
            clearTimeout(timer);
            admit();
        }
    }
}

const sharedStates = new WeakMap<
    Knex,
    { inFlight: InFlightRefreshes; admission: RefreshAdmission }
>();
const sharedCoordinators = new WeakMap<Knex, RefreshTokenRotation>();

export class RefreshTokenRotation {
    private readonly database: Knex;

    private readonly inFlight: InFlightRefreshes;

    private readonly admission: RefreshAdmission;

    private readonly admissionTimeoutMs: number;

    constructor({
        database,
        maxConcurrent = 2,
        admissionTimeoutMs = 10_000,
        inFlight,
    }: {
        database: Knex;
        maxConcurrent?: number;
        admissionTimeoutMs?: number;
        inFlight?: InFlightRefreshes;
    }) {
        if (!Number.isFinite(admissionTimeoutMs) || admissionTimeoutMs < 0) {
            throw new Error(
                'Refresh admission timeout must be nonnegative and finite.',
            );
        }
        let state = sharedStates.get(database);
        if (!state) {
            state = {
                inFlight: new Map(),
                admission: new RefreshAdmission(maxConcurrent),
            };
            sharedStates.set(database, state);
        }
        this.database = database;
        this.inFlight = inFlight ?? state.inFlight;
        this.admission = state.admission;
        this.admissionTimeoutMs = admissionTimeoutMs;
    }

    static forDatabase(database: Knex): RefreshTokenRotation {
        let coordinator = sharedCoordinators.get(database);
        if (!coordinator) {
            coordinator = new RefreshTokenRotation({ database });
            sharedCoordinators.set(database, coordinator);
        }
        return coordinator;
    }

    run<R>(run: RefreshRun<R>): Promise<RefreshResult<R>> {
        const rowKey = `${run.key.kind}:${run.key.uuid}:${run.key.purpose ?? ''}`;
        const flightKey = `${rowKey}|${run.shareKey}`;
        const pending = this.inFlight.get(flightKey);
        if (pending) return pending as Promise<RefreshResult<R>>;
        const promise = this.runLeader(run, `oauth-refresh:${rowKey}`).finally(
            () => {
                this.inFlight.delete(flightKey);
            },
        );
        this.inFlight.set(flightKey, promise);
        return promise;
    }

    private async runLeader<R>(
        run: RefreshRun<R>,
        lockKey: string,
    ): Promise<RefreshResult<R>> {
        await this.admission.acquire(this.admissionTimeoutMs);
        try {
            return await this.database.transaction(async (trx) => {
                await trx.raw("SET LOCAL lock_timeout = '5s'");
                try {
                    await trx.raw(
                        'select pg_advisory_xact_lock(hashtextextended(?, 0))',
                        [lockKey],
                    );
                } catch (error) {
                    if (
                        error instanceof DatabaseError &&
                        error.code === '55P03'
                    ) {
                        throw new RefreshTokenLockTimeoutError();
                    }
                    throw error;
                }
                const current = await run.readCurrentRefreshToken();
                if (!current) throw new RefreshTokenRowMissingError();
                const result = await run.exchange(current);
                await run.persist({ lockedRefreshToken: current, result });
                return { result, refreshTokenUsed: current };
            });
        } finally {
            this.admission.release();
        }
    }
}
