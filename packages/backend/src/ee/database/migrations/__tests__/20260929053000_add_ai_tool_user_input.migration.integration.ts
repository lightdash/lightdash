import knex, { type Knex } from 'knex';
import { down, up } from '../20260929053000_add_ai_tool_user_input';

describe('ai_tool_user_input migration PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    const schemaName = `ai_tool_user_input_${process.pid}`;
    const table = 'ai_tool_user_input';

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI) {
            throw new Error('PGCONNECTIONURI is required');
        }

        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
        });
        transaction = await database.transaction();
        await transaction.raw('CREATE SCHEMA ??', [schemaName]);
        await transaction.raw('SET LOCAL search_path TO ??, public', [
            schemaName,
        ]);
        await transaction.schema.createTable('users', (t) => {
            t.uuid('user_uuid').primary();
        });
    });

    afterAll(async () => {
        if (transaction && !transaction.isCompleted()) {
            await transaction.rollback();
        }
        await database?.destroy();
    });

    it('creates the table on up and drops it on down', async () => {
        await up(transaction);

        expect(await transaction.schema.hasTable(table)).toBe(true);

        const constraints = await transaction.raw<{
            rows: Array<{ contype: string; definition: string }>;
        }>(
            `SELECT contype, pg_get_constraintdef(oid) AS definition
             FROM pg_constraint
             WHERE conrelid = ?::regclass
             ORDER BY contype`,
            [table],
        );
        expect(constraints.rows).toEqual(
            expect.arrayContaining([
                { contype: 'p', definition: 'PRIMARY KEY (tool_call_id)' },
                {
                    contype: 'f',
                    definition:
                        'FOREIGN KEY (user_uuid) REFERENCES users(user_uuid) ON DELETE SET NULL',
                },
            ]),
        );
        expect(constraints.rows).toHaveLength(2);

        const indexes = await transaction.raw<{
            rows: Array<{ indexdef: string }>;
        }>(
            `SELECT indexdef FROM pg_indexes
             WHERE schemaname = current_schema() AND tablename = ?`,
            [table],
        );
        const indexedColumns = indexes.rows.map(({ indexdef }) =>
            indexdef.replace(/^.* USING btree \((.*)\)$/, '$1'),
        );
        expect(indexedColumns).toEqual(
            expect.arrayContaining(['tool_call_id', 'user_uuid', 'created_at']),
        );

        const columns = await transaction('information_schema.columns')
            .select('column_name', 'data_type', 'is_nullable')
            .where({ table_schema: schemaName, table_name: table })
            .orderBy('column_name');
        expect(columns).toEqual([
            {
                column_name: 'created_at',
                data_type: 'timestamp with time zone',
                is_nullable: 'NO',
            },
            { column_name: 'input', data_type: 'jsonb', is_nullable: 'NO' },
            {
                column_name: 'tool_call_id',
                data_type: 'text',
                is_nullable: 'NO',
            },
            { column_name: 'tool_name', data_type: 'text', is_nullable: 'NO' },
            { column_name: 'user_uuid', data_type: 'uuid', is_nullable: 'YES' },
        ]);

        await down(transaction);

        expect(await transaction.schema.hasTable(table)).toBe(false);
    });
});
