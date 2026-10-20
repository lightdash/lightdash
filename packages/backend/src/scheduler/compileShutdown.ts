import { LightdashError } from '@lightdash/common';
import { AsyncLocalStorage } from 'node:async_hooks';

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
    if (context) context.armed = false;
};
