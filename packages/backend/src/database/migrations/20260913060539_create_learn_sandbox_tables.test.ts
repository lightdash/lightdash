import knexConstructor, { Knex } from 'knex';
import { up } from './20260913060539_create_learn_sandbox_tables';

type Captured = { sql: string; bindings: readonly unknown[] };

/**
 * Compiles the migration against a connection-less pg client, capturing the
 * statements it would run. knex's schema builder inlines a predicate's
 * bindings as bare `$1, $2` placeholders into the DDL text and sends no
 * bindings with it, so a predicate built with `whereIn` instead of
 * `whereRaw` only fails against a real Postgres ("there is no parameter
 * $1"). Compiling here catches it without one.
 */
const captureStatements = async (): Promise<Captured[]> => {
    const statements: Captured[] = [];
    const db = knexConstructor({ client: 'pg' });
    const { client } = db as unknown as {
        client: {
            acquireConnection: () => Promise<unknown>;
            releaseConnection: () => Promise<void>;
            _query: (
                connection: unknown,
                obj: { sql: string; bindings?: readonly unknown[] },
            ) => Promise<unknown>;
            processResponse: () => unknown;
        };
    };
    client.acquireConnection = async () => ({});
    client.releaseConnection = async () => {};
    client._query = async (_connection, obj) => {
        statements.push({ sql: obj.sql, bindings: obj.bindings ?? [] });
        return { rows: [], rowCount: 0 };
    };
    client.processResponse = () => [];
    try {
        await up(db as unknown as Knex);
    } finally {
        await db.destroy();
    }
    return statements;
};

describe('create_learn_sandbox_tables migration', () => {
    it('emits DDL with no positional placeholders left in it', async () => {
        const statements = await captureStatements();
        expect(statements.length).toBeGreaterThan(0);
        const parameterised = statements.filter((s) => /\$\d/.test(s.sql));
        expect(parameterised).toEqual([]);
    });

    it('guards one active command per project with a partial unique index', async () => {
        const statements = await captureStatements();
        const index = statements.find((s) =>
            s.sql.includes('learn_commands_one_active_per_project'),
        );
        expect(index?.sql).toContain("where status in ('queued', 'running')");
        expect(index?.bindings).toEqual([]);
    });
});
