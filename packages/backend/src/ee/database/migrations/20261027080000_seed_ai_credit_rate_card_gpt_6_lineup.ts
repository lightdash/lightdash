import { Knex } from 'knex';

const TABLE = 'ai_credit_rate_card';
const EFFECTIVE_FROM = new Date('2026-10-27T00:00:00Z');

export const classification = {
    kind: 'safe',
    reason: 'Adds effective-dated OpenAI rate card rows with conflict handling; existing rates are unchanged.',
};

// Standard USD prices converted at 20 credits per dollar; cache writes use 30m retention.
const ROWS = [
    {
        model_key: 'gpt-6.1-sol',
        tier: 'premium',
        input_credits_per_mtok: 40,
        output_credits_per_mtok: 200,
        cache_read_credits_per_mtok: 2,
        cache_write_credits_per_mtok: 50,
    },
    {
        model_key: 'gpt-6.1-terra',
        tier: 'standard',
        input_credits_per_mtok: 20,
        output_credits_per_mtok: 100,
        cache_read_credits_per_mtok: 1,
        cache_write_credits_per_mtok: 25,
    },
    {
        model_key: 'gpt-6-luna',
        tier: 'fast',
        input_credits_per_mtok: 2,
        output_credits_per_mtok: 10,
        cache_read_credits_per_mtok: 0.2,
        cache_write_credits_per_mtok: 2.5,
    },
];

export async function up(knex: Knex): Promise<void> {
    await knex(TABLE)
        .insert(
            ROWS.map((row) => ({
                ...row,
                provider: 'openai',
                pricing_scope: '__default__',
                effective_from: EFFECTIVE_FROM,
            })),
        )
        .onConflict([
            'provider',
            'pricing_scope',
            'model_key',
            'effective_from',
        ])
        .ignore();
}

export async function down(knex: Knex): Promise<void> {
    await knex(TABLE)
        .where({ provider: 'openai', pricing_scope: '__default__' })
        .whereIn(
            'model_key',
            ROWS.map((row) => row.model_key),
        )
        .where('effective_from', EFFECTIVE_FROM)
        .delete();
}
