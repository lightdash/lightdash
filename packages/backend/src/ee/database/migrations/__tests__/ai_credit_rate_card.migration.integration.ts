import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { down, up } from '../20260928160000_create_ai_credit_rate_card';

const TABLE = 'ai_credit_rate_card';

describe('AI credit rate card migration on PostgreSQL', () => {
    let database: Knex;
    let transaction: Knex.Transaction;

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
        const schema = `rate_card_test_${randomUUID().replaceAll('-', '')}`;
        await transaction.schema.createSchema(schema);
        await transaction.raw('SET LOCAL search_path TO ??, public', [schema]);
        await up(transaction);
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('seeds every provider with a default row so no call is unpriceable', async () => {
        const defaults = await transaction(TABLE)
            .select('provider')
            .where({ model_key: '__default__', pricing_scope: '__default__' })
            .orderBy('provider');
        expect(defaults.map((row) => row.provider)).toEqual([
            'anthropic',
            'azure',
            'bedrock',
            'openai',
            'openrouter',
        ]);
    });

    test('is idempotent: re-running up leaves the seed unchanged', async () => {
        const [{ count: before }] = await transaction(TABLE).count();
        await up(transaction);
        const [{ count: after }] = await transaction(TABLE).count();
        expect(after).toEqual(before);
    });

    test('a later-dated row for the same model coexists with the seed row', async () => {
        await transaction(TABLE).insert({
            provider: 'anthropic',
            pricing_scope: '__default__',
            model_key: 'claude-sonnet-5',
            tier: 'standard',
            input_credits_per_mtok: 60,
            output_credits_per_mtok: 300,
            cache_read_credits_per_mtok: 6,
            cache_write_credits_per_mtok: 75,
            effective_from: '2026-11-01T00:00:00Z',
        });
        const rows = await transaction(TABLE)
            .where({ provider: 'anthropic', model_key: 'claude-sonnet-5' })
            .orderBy('effective_from');
        expect(rows).toHaveLength(2);
    });

    test('rejects a tier outside the fixed list', async () => {
        await expect(
            transaction(TABLE).insert({
                provider: 'anthropic',
                pricing_scope: '__default__',
                model_key: 'claude-sonnet-5',
                tier: 'ultra',
                input_credits_per_mtok: 1,
                output_credits_per_mtok: 1,
                cache_read_credits_per_mtok: 1,
                cache_write_credits_per_mtok: 1,
                effective_from: '2026-12-01T00:00:00Z',
            }),
        ).rejects.toThrow(/ai_credit_rate_card_tier_check/);
    });

    test('down removes the table', async () => {
        await down(transaction);
        expect(await transaction.schema.hasTable(TABLE)).toBe(false);
    });
});
