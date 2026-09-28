import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { down, up } from '../20260928170000_create_ai_usage_ledger';

const TABLE = 'ai_usage_ledger';

const ledgerRow = (organizationUuid: string) => ({
    event_id: randomUUID(),
    organization_uuid: organizationUuid,
    project_uuid: randomUUID(),
    user_uuid: randomUUID(),
    agent_uuid: null,
    thread_uuid: randomUUID(),
    prompt_uuid: randomUUID(),
    app_uuid: null,
    feature: 'agent',
    function_id: 'streamAgentResponse',
    model: 'claude-sonnet-5',
    provider: 'anthropic',
    key_management: 'lightdash-managed',
    outcome: 'complete',
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_tokens: 800,
    cache_write_tokens: 100,
    reasoning_tokens: null,
    total_tokens: 1500,
});

describe('AI usage ledger migration on PostgreSQL', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    const organizationUuid = randomUUID();

    beforeAll(() => {
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        const schema = `usage_ledger_test_${randomUUID().replaceAll('-', '')}`;
        await transaction.schema.createSchema(schema);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await transaction.schema.createTable('organizations', (table) => {
            table.uuid('organization_uuid').primary();
        });
        await transaction.raw(
            'INSERT INTO organizations (organization_uuid) VALUES (?)',
            [organizationUuid],
        );
        await up(transaction);
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('stores one row per call with its token classes', async () => {
        await transaction(TABLE).insert(ledgerRow(organizationUuid));
        const [row] = await transaction(TABLE).select('*');
        expect(row.outcome).toBe('complete');
        expect(Number(row.input_tokens)).toBe(1200);
        expect(row.created_at).toBeInstanceOf(Date);
    });

    test('rejects a second row for the same event id', async () => {
        const row = ledgerRow(organizationUuid);
        await transaction(TABLE).insert(row);
        await expect(transaction(TABLE).insert(row)).rejects.toThrow(
            /ai_usage_ledger_event_id_unique/,
        );
    });

    test('rejects an outcome outside the fixed list', async () => {
        await expect(
            transaction(TABLE).insert({
                ...ledgerRow(organizationUuid),
                outcome: 'aborted',
            }),
        ).rejects.toThrow(/ai_usage_ledger_outcome_check/);
    });

    test('rejects a key origin outside the fixed list', async () => {
        await expect(
            transaction(TABLE).insert({
                ...ledgerRow(organizationUuid),
                key_management: 'unknown',
            }),
        ).rejects.toThrow(/ai_usage_ledger_key_management_check/);
    });

    test('rows follow their organisation when it is deleted', async () => {
        await transaction(TABLE).insert(ledgerRow(organizationUuid));
        await transaction('organizations')
            .where({ organization_uuid: organizationUuid })
            .delete();
        expect(await transaction(TABLE).count()).toEqual([{ count: '0' }]);
    });

    test('indexes rows by thread and by app for the per-thread credits view', async () => {
        const { rows } = await transaction.raw(
            `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ? ORDER BY indexname`,
            [TABLE],
        );
        const byName = Object.fromEntries(
            rows.map((row: { indexname: string; indexdef: string }) => [
                row.indexname,
                row.indexdef,
            ]),
        );
        expect(byName.ai_usage_ledger_thread_uuid_index).toMatch(
            /WHERE \(thread_uuid IS NOT NULL\)/,
        );
        expect(byName.ai_usage_ledger_app_uuid_index).toMatch(
            /WHERE \(app_uuid IS NOT NULL\)/,
        );
    });

    test('down removes the table', async () => {
        await down(transaction);
        expect(await transaction.schema.hasTable(TABLE)).toBe(false);
    });
});
