import { AckPolicy, nanos } from 'nats';
import { type NatsWorkerConfig } from '../config/parseConfig';

export const DEFAULT_NATS_WORKER_ACK_WAIT_MS = 30_000;
export const DEFAULT_NATS_WORKER_ACK_PROGRESS_INTERVAL_MS = 5_000;
export const DEFAULT_NATS_WORKER_MAX_DELIVER = 1;
export const DEFAULT_NATS_WORKER_MAX_BATCH = 1;

type NatsWorkerConsumerSettings = Omit<NatsWorkerConfig, 'enabled' | 'url'>;

export function getDefaultMaxAckPending(workerConcurrency: number): number {
    return workerConcurrency;
}

export function getDefaultMaxWaiting(workerConcurrency: number): number {
    return workerConcurrency;
}

export function getDefaultNatsWorkerConsumerSettings(
    workerConcurrency: number,
): NatsWorkerConsumerSettings {
    return {
        workerConcurrency,
        ackWaitMs: DEFAULT_NATS_WORKER_ACK_WAIT_MS,
        ackProgressIntervalMs: DEFAULT_NATS_WORKER_ACK_PROGRESS_INTERVAL_MS,
        maxDeliver: DEFAULT_NATS_WORKER_MAX_DELIVER,
        maxAckPending: getDefaultMaxAckPending(workerConcurrency),
        maxWaiting: getDefaultMaxWaiting(workerConcurrency),
        maxBatch: DEFAULT_NATS_WORKER_MAX_BATCH,
    };
}

export function getNatsWorkerConsumerConfig(
    settings: NatsWorkerConsumerSettings,
    durableName: string,
    filterSubjects: string[],
) {
    return {
        // Stable identity for the worker group that shares delivery state.
        durable_name: durableName,
        // Restrict this durable to the async-query subjects for its stream.
        filter_subjects: filterSubjects,
        // Require the worker to explicitly mark success or terminal failure.
        ack_policy: AckPolicy.Explicit,
        // Treat an in-flight job as stalled if no ack/progress update arrives in time.
        ack_wait: nanos(settings.ackWaitMs),
        // Stop redelivery after this many attempts.
        max_deliver: settings.maxDeliver,
        // Cap total unacked jobs across all concurrent worker loops.
        max_ack_pending: settings.maxAckPending,
        // Allow one parked pull request per worker loop.
        max_waiting: settings.maxWaiting,
        // Enforce one job per pull request at the server side.
        max_batch: settings.maxBatch,
    };
}
