import { ParameterError } from '@lightdash/common';
import Logger from '../logging/logger';

export type CrossSourceTimeouts = {
    prepareMs: number;
    lsMs: number;
    resolutionMs: number;
};

export const DEFAULT_CROSS_SOURCE_TIMEOUTS: CrossSourceTimeouts = {
    prepareMs: 180000,
    lsMs: 300000,
    resolutionMs: 1200000,
};

export const CROSS_SOURCE_SETTLE_GRACE_MS = 10000;

export const waitForDbtSourceCleanup = async (
    cleanup: Promise<unknown>,
): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
        await Promise.race([
            cleanup.catch((error: unknown) => {
                Logger.warn('dbt.compile.crossSourceCleanupFailed', { error });
                throw error;
            }),
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, CROSS_SOURCE_SETTLE_GRACE_MS);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
};

export class CrossSourceCancellation {
    readonly controller = new AbortController();

    private readonly inFlight = new Map<Promise<unknown>, string>();

    private readonly timer: NodeJS.Timeout;

    private readonly onCallerAbort = () =>
        this.controller.abort(this.caller?.reason);

    constructor(
        private readonly caller: AbortSignal | undefined,
        readonly timeouts: CrossSourceTimeouts,
        resolutionElapsedMs = 0,
    ) {
        caller?.addEventListener('abort', this.onCallerAbort, { once: true });
        if (caller?.aborted) this.onCallerAbort();
        const started = Date.now() - resolutionElapsedMs;
        this.timer = setTimeout(
            () => {
                const sources = [...new Set(this.inFlight.values())];
                const pending =
                    sources.length > 0
                        ? ` Sources still in progress: ${sources.map((source) => `"${source}"`).join(', ')}.`
                        : '';
                const error = new ParameterError(
                    `Cross-source dbt resolution timed out after ${timeouts.resolutionMs / 1000} s.${pending}`,
                );
                Logger.warn('dbt.compile.crossSourceTimeout', {
                    event: 'dbt.compile.crossSourceTimeout',
                    source: null,
                    phase: 'resolution',
                    setting: 'DBT_CROSS_SOURCE_RESOLUTION_TIMEOUT_MS',
                    elapsedMs: Date.now() - started,
                });
                this.controller.abort(error);
            },
            Math.max(0, timeouts.resolutionMs - resolutionElapsedMs),
        );
    }

    async run<T>(
        source: string,
        phase: 'prepare' | 'ls',
        operation: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        this.controller.signal.throwIfAborted();
        const controller = new AbortController();
        const abort = () => controller.abort(this.controller.signal.reason);
        this.controller.signal.addEventListener('abort', abort, { once: true });
        const duration =
            phase === 'prepare' ? this.timeouts.prepareMs : this.timeouts.lsMs;
        const started = Date.now();
        const timer = setTimeout(() => {
            const description =
                phase === 'prepare'
                    ? 'cloning the repository and installing dbt packages'
                    : 'running dbt ls';
            const variable =
                phase === 'prepare'
                    ? 'DBT_SOURCE_PREPARE_TIMEOUT_MS'
                    : 'DBT_SOURCE_LS_TIMEOUT_MS';
            const error = new ParameterError(
                `dbt source "${source}" timed out after ${duration / 1000} s while ${description}.`,
            );
            Logger.warn('dbt.compile.crossSourceTimeout', {
                event: 'dbt.compile.crossSourceTimeout',
                source,
                phase,
                setting: variable,
                elapsedMs: Date.now() - started,
            });
            this.controller.abort(error);
        }, duration);
        let onAbort: () => void = () => {};
        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => reject(controller.signal.reason);
            controller.signal.addEventListener('abort', onAbort, {
                once: true,
            });
        });
        const work = Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return operation(controller.signal);
        });
        this.inFlight.set(work, source);
        void work.then(
            () => this.inFlight.delete(work),
            () => this.inFlight.delete(work),
        );
        try {
            const result = await Promise.race([work, aborted]);
            this.controller.signal.throwIfAborted();
            return result;
        } catch (error) {
            throw this.controller.signal.aborted
                ? this.controller.signal.reason
                : error;
        } finally {
            clearTimeout(timer);
            this.controller.signal.removeEventListener('abort', abort);
            controller.signal.removeEventListener('abort', onAbort);
        }
    }

    async wait<T>(source: string, operation: () => Promise<T>): Promise<T> {
        this.controller.signal.throwIfAborted();
        let onAbort = () => {};
        const aborted = new Promise<never>((_, reject) => {
            onAbort = () => reject(this.controller.signal.reason);
            this.controller.signal.addEventListener('abort', onAbort, {
                once: true,
            });
        });
        const work = Promise.resolve().then(() => {
            this.controller.signal.throwIfAborted();
            return operation();
        });
        this.inFlight.set(work, source);
        void work.then(
            () => this.inFlight.delete(work),
            () => this.inFlight.delete(work),
        );
        try {
            const result = await Promise.race([work, aborted]);
            this.controller.signal.throwIfAborted();
            return result;
        } finally {
            this.controller.signal.removeEventListener('abort', onAbort);
        }
    }

    async fail(error: unknown): Promise<never> {
        this.controller.abort(error);
        let timer: NodeJS.Timeout | undefined;
        try {
            await Promise.race([
                Promise.allSettled([...this.inFlight.keys()]),
                new Promise<void>((resolve) => {
                    timer = setTimeout(() => {
                        Logger.warn('dbt.compile.crossSourceSettleTimeout', {
                            event: 'dbt.compile.crossSourceSettleTimeout',
                            sources: [...new Set(this.inFlight.values())],
                        });
                        resolve();
                    }, CROSS_SOURCE_SETTLE_GRACE_MS);
                }),
            ]);
        } finally {
            clearTimeout(timer);
        }
        throw this.controller.signal.reason;
    }

    dispose() {
        clearTimeout(this.timer);
        this.caller?.removeEventListener('abort', this.onCallerAbort);
    }
}
