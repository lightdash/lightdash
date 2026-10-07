import { DbtError, ParameterError, type DbtLog } from '@lightdash/common';

export class DbtSourceError extends ParameterError {
    readonly logs: DbtLog[];

    constructor(message: string, error: unknown) {
        super(message);
        this.logs =
            error instanceof DbtError || error instanceof DbtSourceError
                ? (error.logs ?? [])
                : [];
    }
}
