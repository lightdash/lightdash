import * as Sentry from '@sentry/node';
import { Job } from 'graphile-worker';
import Logger from '../logging/logger';

async function timeout(prom: Promise<any>, time: number, exception: Symbol) {
    let timer: NodeJS.Timeout;
    return Promise.race([
        prom,
        new Promise((_, reject) => {
            timer = setTimeout(reject, time, exception);
        }),
    ]).finally(() => clearTimeout(timer));
}

export async function tryJobOrTimeout(
    prom: Promise<any>,
    job: Job,
    time: number,
    onTimeout: (job: Job, error: Error) => Promise<void> = async () => {},
): Promise<void> {
    const timeoutError = Symbol('timeoutError');
    try {
        await timeout(prom, time, timeoutError);
    } catch (e) {
        if (e !== timeoutError) {
            // propagate non-timeout errors
            throw e;
        } else {
            // handle timeout
            Logger.error(
                `Worker ${job.locked_by} timed out job ${job.id} (${job.task_identifier}) after ${time}ms`,
            );
            const timeOutError = new Error(`Job timed out after ${time}ms`);
            Sentry.captureException(timeOutError, {
                extra: {
                    jobId: job.id,
                    workerId: job.locked_by,
                    task: job.task_identifier,
                },
            });
            await onTimeout(job, timeOutError);
        }
    }
}
