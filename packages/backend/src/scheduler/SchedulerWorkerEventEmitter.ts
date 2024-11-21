import * as Sentry from '@sentry/node';
import EventEmitter from 'events';
import { WorkerEvents } from 'graphile-worker';
import { Job, Worker } from 'graphile-worker/dist/interfaces';
import ExecutionContext from 'node-execution-context';
import Logger from '../logging/logger';
import { ExecutionContextInfo } from '../logging/winston';

class EventEmitterWithExecutionContent
    extends EventEmitter
    implements WorkerEvents
{
    on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, (...args: any[]) => {
            const { worker, job } = args[0] as { worker?: Worker; job?: Job };
            const executionContext: ExecutionContextInfo = {};
            if (worker) {
                executionContext.worker = {
                    id: worker.workerId,
                };
            }
            if (job) {
                executionContext.job = {
                    id: job.id,
                    queue_name: job.queue_name,
                    task_identifier: job.task_identifier,
                    priority: job.priority,
                    attempts: job.attempts,
                };
            }
            return ExecutionContext.run(
                () => listener(...args),
                executionContext,
            );
        });
    }
}

const schedulerWorkerEventEmitter: WorkerEvents =
    new EventEmitterWithExecutionContent();

// Handle worker events
schedulerWorkerEventEmitter.on('worker:create', ({ worker }) => {
    Logger.info(`Worker ${worker.workerId} was created`);
});

schedulerWorkerEventEmitter.on('worker:stop', ({ worker, error }) => {
    Logger.info(`Worker ${worker.workerId} was stopped. ${error ?? ''}`);
});

schedulerWorkerEventEmitter.on('worker:fatalError', ({ worker, error }) => {
    const message = `Worker ${worker.workerId} has fatal error. ${error}`;
    Logger.info(message);
    Sentry.captureException(new Error(message), {
        extra: { workerId: worker.workerId, error },
    });
});

// Handle job events
schedulerWorkerEventEmitter.on('job:start', ({ worker, job }) => {
    Logger.info(
        `Worker ${worker.workerId} started job ${job.id} (${job.task_identifier}). Attempt ${job.attempts} of ${job.max_attempts}`,
        { payload: job.payload },
    );
});

schedulerWorkerEventEmitter.on('job:success', ({ worker, job }) => {
    Logger.info(
        `Worker ${worker.workerId} successfully executed job ${job.id} (${job.task_identifier})`,
    );
});

schedulerWorkerEventEmitter.on('job:error', ({ worker, job, error }) => {
    Logger.info(
        `Worker ${worker.workerId} errored job ${job.id} (${job.task_identifier}). ${error}`,
    );
});

schedulerWorkerEventEmitter.on('job:failed', ({ worker, job, error }) => {
    const message = `Worker ${worker.workerId} failed job ${job.id} (${job.task_identifier}). ${error}`;
    Logger.info(message);
    Sentry.captureException(new Error(message), {
        extra: {
            workerId: worker.workerId,
            jobId: job.id,
            task: job.task_identifier,
            error,
        },
    });
});

schedulerWorkerEventEmitter.on('job:complete', ({ worker, job }) => {
    Logger.info(
        `Worker ${worker.workerId} concluded job ${job.id} (${job.task_identifier})`,
    );
});

export default schedulerWorkerEventEmitter;
