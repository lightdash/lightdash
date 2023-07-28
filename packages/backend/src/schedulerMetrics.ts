import opentelemetry, { ValueType } from '@opentelemetry/api';
import { schedulerClient } from './clients/clients';
import { SchedulerWorker } from './scheduler/SchedulerWorker';
import { VERSION } from './version';

const meter = opentelemetry.metrics.getMeter('lightdash-worker', VERSION);
const queueSizeCounter = meter.createObservableUpDownCounter<{
    'job.locked': boolean;
    'job.error': boolean;
}>('queue.jobs.count', {
    description: 'Total count of all jobs in the graphile queue',
    valueType: ValueType.INT,
});

export const registerWorkerMetrics = (worker: SchedulerWorker) => {
    queueSizeCounter.addCallback(async (result) => {
        const jobStats = await schedulerClient.getJobStatistics();
        jobStats.forEach((stats) => {
            result.observe(stats.count, {
                'job.locked': stats.locked,
                'job.error': stats.error,
            });
        });
    });
};
