/** Sent to the client as an ErrorResponse (`code` is a SQLSTATE) */
export class PgWireServerError extends Error {
    constructor(
        message: string,
        public readonly code: string = 'XX000',
        public readonly hint?: string,
    ) {
        super(message);
        this.name = 'PgWireServerError';
    }
}
