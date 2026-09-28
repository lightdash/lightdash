import {
    priceAiUsageInCredits,
    type AiCreditRateCardRow,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { AiCreditRateCardModel } from '../../../models/AiCreditRateCardModel';
import * as createTable from '../20260928160000_create_ai_credit_rate_card';
import * as seedRows from '../20260928160100_seed_ai_credit_rate_card';

const TABLE = 'ai_credit_rate_card';

// The seed converts warehouse list prices with this many credits per dollar.
const CREDITS_PER_USD = 20;

// Warehouse rows: usd per million tokens plus cache multipliers.
const warehouseRows = [
    {
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        input: 2.0,
        output: 10.0,
        cacheRead: 0.1,
        cacheWrite: 1.25,
    },
    {
        provider: 'bedrock',
        model: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        input: 1.1,
        output: 5.5,
        cacheRead: 0.1,
        cacheWrite: 1.25,
    },
    {
        provider: 'openai',
        model: 'gpt-5.4-2026-03-05',
        input: 1.25,
        output: 10.0,
        cacheRead: 0.1,
        cacheWrite: 0,
    },
    {
        provider: 'azure',
        model: 'gpt-4.1-mini',
        input: 0.4,
        output: 1.6,
        cacheRead: 0.25,
        cacheWrite: 0,
    },
];

const call = {
    inputTokens: 250_000,
    outputTokens: 40_000,
    cacheReadTokens: 120_000,
    cacheWriteTokens: 30_000,
};

const warehouseCostUsd = (row: (typeof warehouseRows)[number]): number => {
    const uncached =
        call.inputTokens - call.cacheReadTokens - call.cacheWriteTokens;
    return (
        (uncached * row.input +
            call.cacheReadTokens * row.input * row.cacheRead +
            call.cacheWriteTokens * row.input * row.cacheWrite +
            call.outputTokens * row.output) /
        1e6
    );
};

describe('AI credit rate card migration on PostgreSQL', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let rows: AiCreditRateCardRow[];

    beforeAll(() => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE)
            throw new Error('PostgreSQL integration connection is required');
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
        await createTable.up(transaction);
        await seedRows.up(transaction);
        rows = await new AiCreditRateCardModel({
            database: transaction,
        }).getAll();
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('seeds every provider with a default row so unknown models still price', async () => {
        const defaults = rows.filter(
            (row) =>
                row.modelKey === '__default__' &&
                row.pricingScope === '__default__',
        );
        expect(defaults.map((row) => row.provider).sort()).toEqual([
            'anthropic',
            'azure',
            'bedrock',
            'openai',
            'openrouter',
        ]);
    });

    test('prices a call the way the warehouse does, in credits instead of dollars', () => {
        const at = new Date('2026-09-15T00:00:00Z');
        warehouseRows.forEach((row) => {
            const credits = priceAiUsageInCredits(rows, {
                provider: row.provider,
                model: row.model,
                at,
                tokens: call,
            });
            expect(credits).toBeCloseTo(
                warehouseCostUsd(row) * CREDITS_PER_USD,
                6,
            );
        });
    });

    test('re-running the seed leaves the rows unchanged', async () => {
        await seedRows.up(transaction);
        const [{ count }] = await transaction(TABLE).count();
        expect(Number(count)).toBe(rows.length);
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
            effective_from: new Date('2026-11-01T00:00:00Z'),
        });
        const sonnet = await transaction(TABLE)
            .where({ provider: 'anthropic', model_key: 'claude-sonnet-5' })
            .orderBy('effective_from');
        expect(sonnet).toHaveLength(2);
    });

    test('rejects a tier outside the fixed list', async () => {
        await expect(
            transaction.raw(
                `INSERT INTO ${TABLE} (provider, pricing_scope, model_key, tier, input_credits_per_mtok, output_credits_per_mtok, cache_read_credits_per_mtok, cache_write_credits_per_mtok, effective_from)
                 VALUES ('anthropic', '__default__', 'claude-sonnet-5', 'ultra', 1, 1, 1, 1, '2026-12-01T00:00:00Z')`,
            ),
        ).rejects.toThrow(/ai_credit_rate_card_tier_check/);
    });

    test('down removes the seed rows and then the table', async () => {
        await seedRows.down(transaction);
        const [{ count }] = await transaction(TABLE).count();
        expect(Number(count)).toBe(0);
        await createTable.down(transaction);
        expect(await transaction.schema.hasTable(TABLE)).toBe(false);
    });
});
