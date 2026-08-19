import { MIGRATION_LEASE_EXPIRY_MS } from '../../database/migrationLease';

export const MIGRATION_HEARTBEAT_INTERVAL_MS = 10_000;

export type MigrationHeartbeatClient = {
    heartbeat: (token: string) => Promise<boolean>;
};

type MigrationHeartbeatArguments = {
    leaseManager: MigrationHeartbeatClient;
    token: string;
    intervalMs?: number;
    expiryMs?: number;
    stopTimeoutMs?: number;
    now?: () => number;
    onError?: (error: unknown) => void;
    onLeaseLost?: (error: MigrationLeaseLostError) => void;
};

export class MigrationLeaseLostError extends Error {
    constructor(message = 'Migration lease was lost') {
        super(message);
        this.name = 'MigrationLeaseLostError';
    }
}

export class MigrationHeartbeat {
    private readonly leaseManager: MigrationHeartbeatClient;

    private readonly token: string;

    private readonly intervalMs: number;

    private readonly expiryMs: number;

    private readonly stopTimeoutMs: number;

    private readonly now: () => number;

    private readonly onError: (error: unknown) => void;

    private readonly onLeaseLost: (error: MigrationLeaseLostError) => void;

    private timer: NodeJS.Timeout | null = null;

    private inFlight: Promise<void> | null = null;

    private stopPromise: Promise<void> | null = null;

    private leaseLoss: MigrationLeaseLostError | null = null;

    private lastSuccessfulHeartbeatAt: number | null = null;

    private stopped = false;

    constructor({
        leaseManager,
        token,
        intervalMs = MIGRATION_HEARTBEAT_INTERVAL_MS,
        expiryMs = MIGRATION_LEASE_EXPIRY_MS,
        stopTimeoutMs = MIGRATION_LEASE_EXPIRY_MS,
        now = Date.now,
        onError = () => {},
        onLeaseLost = () => {},
    }: MigrationHeartbeatArguments) {
        this.leaseManager = leaseManager;
        this.token = token;
        this.intervalMs = intervalMs;
        this.expiryMs = expiryMs;
        this.stopTimeoutMs = stopTimeoutMs;
        this.now = now;
        this.onError = onError;
        this.onLeaseLost = onLeaseLost;
    }

    start(): void {
        this.lastSuccessfulHeartbeatAt = this.now();
        this.schedule();
    }

    assertHeld(): void {
        if (this.leaseLoss !== null) {
            throw this.leaseLoss;
        }
    }

    async stop(): Promise<void> {
        this.stopped = true;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.stopPromise ??= this.waitForInFlight();
        await this.stopPromise;
    }

    private async waitForInFlight(): Promise<void> {
        if (this.inFlight === null) {
            return;
        }

        let timeout: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, this.stopTimeoutMs);
            timeout.unref();
        });
        try {
            await Promise.race([this.inFlight, timeoutPromise]);
        } finally {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
        }
    }

    private schedule(): void {
        if (this.stopped || this.leaseLoss !== null) {
            return;
        }
        this.timer = setTimeout(() => {
            this.timer = null;
            this.inFlight = this.beat().finally(() => {
                this.inFlight = null;
                this.schedule();
            });
        }, this.intervalMs);
        this.timer.unref();
    }

    private async beat(): Promise<void> {
        try {
            const renewed = await this.leaseManager.heartbeat(this.token);
            if (!renewed) {
                this.latchLeaseLoss(new MigrationLeaseLostError());
            } else {
                this.lastSuccessfulHeartbeatAt = this.now();
            }
        } catch (error) {
            this.onError(error);
            if (
                this.lastSuccessfulHeartbeatAt !== null &&
                this.now() - this.lastSuccessfulHeartbeatAt >= this.expiryMs
            ) {
                this.latchLeaseLoss(
                    new MigrationLeaseLostError(
                        'Migration lease heartbeat could not be renewed before expiry',
                    ),
                );
            }
        }
    }

    private latchLeaseLoss(error: MigrationLeaseLostError): void {
        if (this.leaseLoss !== null) {
            return;
        }
        this.leaseLoss = error;
        this.onLeaseLost(error);
    }
}
