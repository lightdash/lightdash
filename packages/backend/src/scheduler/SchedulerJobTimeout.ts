import { Job } from 'graphile-worker';
import Logger from '../logger';

async function timeout(prom: Promise<any>, time: number, exception: Symbol) {
    let timer: NodeJS.Timeout;
    return Promise.race([
        prom,
        new Promise((_, reject) => {
            timer = setTimeout(reject, time, exception);
        }),
    ]).finally(() => clearTimeout(timer));
}

const DEFAULT_JOB_TIMEOUT = 1000 * 60 * 10; // 10 minutes
export async function tryJobOrTimeout(
    prom: Promise<any>,
    job: Job,
    time: number = DEFAULT_JOB_TIMEOUT,
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
        }
    }
}
