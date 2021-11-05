import odbc, { Result } from 'odbc';

declare module 'odbc' {
    class Connection {
        tables(
            catalog: string | null,
            schema: string | null,
            table: string | null,
        ): Promise<Result<unknown>>;
    }
}
