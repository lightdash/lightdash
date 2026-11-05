import { DbtError, ParameterError, type DbtLog } from '@lightdash/common';

export class DbtSourceError extends ParameterError {
    readonly logs: DbtLog[];

    declare readonly cause: unknown;

    constructor(message: string, cause: unknown) {
        super(message);
        Object.defineProperty(this, 'cause', { value: cause });
        this.logs =
            cause instanceof DbtError || cause instanceof DbtSourceError
                ? (cause.logs ?? [])
                : [];
    }
}
