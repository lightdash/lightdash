import EventEmitter from 'events';
import { WorkerEvents } from 'graphile-worker';
import Logger from '../logger';

const schedulerWorkerEventEmitter: WorkerEvents = new EventEmitter();

// Handle worker events
schedulerWorkerEventEmitter.on('worker:create', ({ worker }) => {
    Logger.info(`Worker ${worker.workerId} was created`);
});

schedulerWorkerEventEmitter.on('worker:stop', ({ worker, error }) => {
    Logger.info(`Worker ${worker.workerId} was stopped. ${error ?? ''}`);
});

schedulerWorkerEventEmitter.on('worker:fatalError', ({ worker, error }) => {
    Logger.info(`Worker ${worker.workerId} has fatal error. ${error}`);
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
    Logger.info(
        `Worker ${worker.workerId} failed job ${job.id} (${job.task_identifier}). ${error}`,
    );
});

schedulerWorkerEventEmitter.on('job:complete', ({ worker, job }) => {
    Logger.info(
        `Worker ${worker.workerId} concluded job ${job.id} (${job.task_identifier})`,
    );
});

export default schedulerWorkerEventEmitter;
