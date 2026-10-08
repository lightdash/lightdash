import { Knex } from 'knex';

const AiCreditRateCardTableName = 'ai_credit_rate_card';

export const classification = {
    kind: 'safe',
    reason: 'Inserts new effective-dated rate card rows for Claude Haiku 5.5 with conflict handling; no existing rows are read or changed.',
};

const EFFECTIVE_FROM = new Date('2026-10-07T00:00:00Z');

// Credits per million tokens: $0.10 input / $0.50 output at 20 credits per dollar.
const HAIKU_5_5 = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
const HAIKU_5_5_REGIONAL = {
    input: 2.2,
    output: 11,
    cacheRead: 0.22,
    cacheWrite: 2.75,
};

const SEED_ROWS = [
    {
        provider: 'anthropic',
        scope: '__default__',
        modelKey: 'claude-haiku-5-5',
        rates: HAIKU_5_5,
    },
    {
        provider: 'bedrock',
        scope: '__default__',
        modelKey: 'anthropic.claude-haiku-5-5',
        rates: HAIKU_5_5,
    },
    {
        provider: 'bedrock',
        scope: 'us',
        modelKey: 'anthropic.claude-haiku-5-5',
        rates: HAIKU_5_5_REGIONAL,
    },
    {
        provider: 'bedrock',
        scope: 'global',
        modelKey: 'anthropic.claude-haiku-5-5',
        rates: HAIKU_5_5,
    },
];

export async function up(knex: Knex): Promise<void> {
    await knex(AiCreditRateCardTableName)
        .insert(
            SEED_ROWS.map(({ provider, scope, modelKey, rates }) => ({
                provider,
                pricing_scope: scope,
                model_key: modelKey,
                tier: 'fast',
                input_credits_per_mtok: rates.input,
                output_credits_per_mtok: rates.output,
                cache_read_credits_per_mtok: rates.cacheRead,
                cache_write_credits_per_mtok: rates.cacheWrite,
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
    await knex(AiCreditRateCardTableName)
        .where('effective_from', EFFECTIVE_FROM)
        .delete();
}
