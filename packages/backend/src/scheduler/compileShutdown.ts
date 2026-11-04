import { JobStatusType, LightdashError } from '@lightdash/common';
import type { Knex } from 'knex';
import { AsyncLocalStorage } from 'node:async_hooks';
import { JobsTableName } from '../database/entities/jobs';

export class CompileInterruptedError extends LightdashError {
    constructor() {
        super({
            name: 'CompileInterruptedError',
            statusCode: 503,
            message:
                'The worker shut down while this project was compiling. Refresh dbt again.',
            data: {},
        });
    }
}

export type CompileShutdownContext = {
    controller: AbortController;
    jobUuid: string | null;
    armed: boolean;
    state: 'running' | 'publishing' | 'published' | 'terminal';
    isStopping: () => boolean;
    interrupt: () => void;
};

export const compileShutdown = new AsyncLocalStorage<CompileShutdownContext>();

export const armCompileShutdown = (): AbortSignal | undefined => {
    const context = compileShutdown.getStore();
    if (!context) return undefined;
    context.armed = true;
    if (context.isStopping()) context.interrupt();
    return context.controller.signal;
};

export const getCompileShutdownSignal = (): AbortSignal | undefined => {
    const context = compileShutdown.getStore();
    return context?.armed ? context.controller.signal : undefined;
};

export const throwIfCompileAborted = (): void => {
    getCompileShutdownSignal()?.throwIfAborted();
};

export const disarmCompileShutdown = (): void => {
    const context = compileShutdown.getStore();
    if (context) {
        context.state = 'terminal';
        context.armed = false;
    }
};

export const lockCompilePublication = async (
    trx: Knex.Transaction,
): Promise<void> => {
    const context = compileShutdown.getStore();
    if (!context?.armed) return;
    context.controller.signal.throwIfAborted();
    context.state = 'publishing';
    if (context.jobUuid === null) return;
    const job = await trx(JobsTableName)
        .select('job_status')
        .where('job_uuid', context.jobUuid)
        .forUpdate()
        .first();
    if (
        !job ||
        ![JobStatusType.RUNNING, JobStatusType.STARTED].includes(job.job_status)
    )
        throw new CompileInterruptedError();
};

export const markCompilePublished = (): void => {
    const context = compileShutdown.getStore();
    if (context?.armed) context.state = 'published';
};
