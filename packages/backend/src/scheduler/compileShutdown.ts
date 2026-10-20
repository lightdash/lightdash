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
};

export const compileShutdown = new AsyncLocalStorage<CompileShutdownContext>();

export const armCompileShutdown = (): AbortSignal | undefined => {
    const context = compileShutdown.getStore();
    if (!context) return undefined;
    context.armed = true;
    return context.controller.signal;
};
