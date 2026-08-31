import knex, { type Knex } from 'knex';
import { down, up } from '../20260831120000_add_live_activity_push_to_start';

describe('Live Activity push-to-start migration PostgreSQL integration', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    const schemaName = `live_activity_push_start_${process.pid}`;

    beforeAll(async () => {
        if (!process.env.PGCONNECTIONURI) {
            throw new Error('PGCONNECTIONURI is required');
        }

        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI,
        });
        transaction = await database.transaction();
        await transaction.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        await transaction.raw('CREATE SCHEMA ??', [schemaName]);
        await transaction.raw('SET LOCAL search_path TO ??, public', [
            schemaName,
        ]);
        await transaction.schema.createTable(
            'mobile_push_installations',
            (table) => {
                table.uuid('mobile_push_installation_uuid').primary();
                table.text('environment').notNullable();
            },
        );
        await transaction.schema.createTable('ai_prompt', (table) => {
            table.uuid('ai_prompt_uuid').primary();
        });
    });

    afterAll(async () => {
        if (transaction && !transaction.isCompleted()) {
            await transaction.rollback();
        }
        await database?.destroy();
    });

    it('creates untruncated PostgreSQL identifiers', async () => {
        await up(transaction);

        const attemptsResult = await transaction.raw<{
            rows: Array<{ identifier: string }>;
        }>(`
            SELECT indexname AS identifier
            FROM pg_indexes
            WHERE schemaname = current_schema()
              AND tablename = 'ai_agent_live_activity_start_attempts'
            UNION
            SELECT conname AS identifier
            FROM pg_constraint
            WHERE conrelid = 'ai_agent_live_activity_start_attempts'::regclass
            ORDER BY identifier
        `);
        const installationsResult = await transaction.raw<{
            rows: Array<{ identifier: string }>;
        }>(`
            SELECT conname AS identifier
            FROM pg_constraint
            WHERE conrelid = 'mobile_push_installations'::regclass
              AND pg_get_constraintdef(oid) LIKE '%push_to_start_token_fingerprint%'
        `);

        expect(attemptsResult.rows.map(({ identifier }) => identifier)).toEqual(
            expect.arrayContaining([
                'live_activity_start_attempts_installation_fk',
                'live_activity_start_attempts_installation_idx',
                'live_activity_start_attempts_installation_prompt_uq',
                'live_activity_start_attempts_status_attempted_idx',
            ]),
        );
        expect(installationsResult.rows).toEqual([
            {
                identifier: 'mobile_push_installations_push_start_token_uq',
            },
        ]);

        await down(transaction);

        expect(
            await transaction.schema.hasTable(
                'ai_agent_live_activity_start_attempts',
            ),
        ).toBe(false);
        await expect(
            transaction('information_schema.columns')
                .select('column_name')
                .where({
                    table_schema: schemaName,
                    table_name: 'mobile_push_installations',
                })
                .whereIn('column_name', [
                    'encrypted_push_to_start_token',
                    'push_to_start_token_fingerprint',
                ]),
        ).resolves.toEqual([]);
    });
});
