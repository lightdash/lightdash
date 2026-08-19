export class MigrationWaitTimeoutError extends Error {
    constructor() {
        super('Timed out waiting for database migrations');
        this.name = 'MigrationWaitTimeoutError';
    }
}
