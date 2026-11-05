export class DbtAbortError extends Error {
    constructor(readonly reason: unknown) {
        super(reason instanceof Error ? reason.message : 'dbt command aborted');
        this.name = 'DbtAbortError';
    }
}
