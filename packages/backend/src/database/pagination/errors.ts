export class KnexPaginationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'KnexPaginationError';
    }
}
