import { Knex } from 'knex';

const AiCreditRateCardTableName = 'ai_credit_rate_card';

export const classification = {
    kind: 'safe',
    reason: 'Inserts the initial rate card rows into a new, empty table with conflict handling; no existing data is read or changed.',
};

// Later price changes arrive as new effective-dated rows, never as edits.
const SEED_EFFECTIVE_FROM = new Date('2026-09-01T00:00:00Z');

type Tier = 'fast' | 'standard' | 'premium';

// Credits per million tokens for each token class.
type Rates = {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
};

type SeedRow = {
    provider: string;
    pricingScope: string;
    modelKey: string;
    tier: Tier;
    rates: Rates;
};

const OPUS: Rates = { input: 100, output: 500, cacheRead: 10, cacheWrite: 125 };
const SONNET_5: Rates = {
    input: 40,
    output: 200,
    cacheRead: 4,
    cacheWrite: 50,
};
const SONNET_4: Rates = {
    input: 60,
    output: 300,
    cacheRead: 6,
    cacheWrite: 75,
};
const HAIKU: Rates = { input: 20, output: 100, cacheRead: 2, cacheWrite: 25 };
const GPT_5_MINI: Rates = {
    input: 5,
    output: 40,
    cacheRead: 0.5,
    cacheWrite: 0,
};
const GPT_5: Rates = { input: 25, output: 200, cacheRead: 2.5, cacheWrite: 0 };
const GPT_SOL: Rates = {
    input: 100,
    output: 600,
    cacheRead: 10,
    cacheWrite: 125,
};
const GPT_TERRA: Rates = {
    input: 40,
    output: 240,
    cacheRead: 4,
    cacheWrite: 50,
};
const GPT_LUNA: Rates = { input: 4, output: 24, cacheRead: 0.4, cacheWrite: 5 };
const EMBEDDING_SMALL: Rates = {
    input: 0.4,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
};
const OPUS_REGIONAL: Rates = {
    input: 110,
    output: 550,
    cacheRead: 11,
    cacheWrite: 137.5,
};
const SONNET_5_REGIONAL: Rates = {
    input: 44,
    output: 220,
    cacheRead: 4.4,
    cacheWrite: 55,
};
const SONNET_4_REGIONAL: Rates = {
    input: 66,
    output: 330,
    cacheRead: 6.6,
    cacheWrite: 82.5,
};
const HAIKU_REGIONAL: Rates = {
    input: 22,
    output: 110,
    cacheRead: 2.2,
    cacheWrite: 27.5,
};
const GPT_SOL_REGIONAL: Rates = {
    input: 110,
    output: 660,
    cacheRead: 11,
    cacheWrite: 137.5,
};
const GPT_TERRA_REGIONAL: Rates = {
    input: 44,
    output: 264,
    cacheRead: 4.4,
    cacheWrite: 55,
};
const GPT_LUNA_REGIONAL: Rates = {
    input: 4.4,
    output: 26.4,
    cacheRead: 0.44,
    cacheWrite: 5.5,
};
const GPT_41_MINI: Rates = {
    input: 8,
    output: 32,
    cacheRead: 2,
    cacheWrite: 0,
};
const OPENROUTER_DEFAULT: Rates = {
    input: 10,
    output: 40,
    cacheRead: 1,
    cacheWrite: 0,
};

const seed = (
    provider: string,
    pricingScope: string,
    modelKey: string,
    tier: Tier,
    rates: Rates,
): SeedRow => ({ provider, pricingScope, modelKey, tier, rates });

const SEED_ROWS: SeedRow[] = [
    seed('anthropic', '__default__', 'claude-opus-5', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-opus-4-8', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-opus-4-7', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-opus-4-6', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-opus-4-5', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-opus', 'premium', OPUS),
    seed('anthropic', '__default__', 'claude-sonnet-5', 'standard', SONNET_5),
    seed('anthropic', '__default__', 'claude-sonnet-4-6', 'standard', SONNET_4),
    seed('anthropic', '__default__', 'claude-sonnet-4-5', 'standard', SONNET_4),
    seed('anthropic', '__default__', 'claude-sonnet', 'standard', SONNET_5),
    seed('anthropic', '__default__', 'claude-haiku-4-5', 'fast', HAIKU),
    seed('anthropic', '__default__', 'claude-haiku', 'fast', HAIKU),
    seed('anthropic', '__default__', '__default__', 'standard', SONNET_4),
    seed('openai', '__default__', 'gpt-5-mini', 'fast', GPT_5_MINI),
    seed('openai', '__default__', 'gpt-5.4', 'standard', GPT_5),
    seed('openai', '__default__', 'gpt-5.5', 'standard', GPT_5),
    seed('openai', '__default__', 'gpt-5.6-sol', 'premium', GPT_SOL),
    seed('openai', '__default__', 'gpt-5.6-terra', 'standard', GPT_TERRA),
    seed('openai', '__default__', 'gpt-5.6-luna', 'fast', GPT_LUNA),
    seed(
        'openai',
        '__default__',
        'text-embedding-3-small',
        'fast',
        EMBEDDING_SMALL,
    ),
    seed('openai', '__default__', '__default__', 'standard', GPT_5),
    seed('bedrock', '__default__', 'anthropic.claude-opus-5', 'premium', OPUS),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-8',
        'premium',
        OPUS,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-7',
        'premium',
        OPUS,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-6',
        'premium',
        OPUS,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-5',
        'premium',
        OPUS,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-5',
        'standard',
        SONNET_5,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-4-6',
        'standard',
        SONNET_4,
    ),
    seed(
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4,
    ),
    seed('bedrock', '__default__', 'anthropic.claude-haiku-4-5', 'fast', HAIKU),
    seed('bedrock', '__default__', 'openai.gpt-5.6-sol', 'premium', GPT_SOL),
    seed(
        'bedrock',
        '__default__',
        'openai.gpt-5.6-terra',
        'standard',
        GPT_TERRA,
    ),
    seed('bedrock', '__default__', 'openai.gpt-5.6-luna', 'fast', GPT_LUNA),
    seed('bedrock', '__default__', 'claude-sonnet', 'standard', SONNET_5),
    seed('bedrock', '__default__', 'claude-opus', 'premium', OPUS),
    seed('bedrock', '__default__', 'claude-haiku', 'fast', HAIKU),
    seed('bedrock', '__default__', '__default__', 'standard', SONNET_4),
    seed('bedrock', 'us', 'anthropic.claude-opus-5', 'premium', OPUS_REGIONAL),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-opus-4-8',
        'premium',
        OPUS_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-opus-4-7',
        'premium',
        OPUS_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-opus-4-6',
        'premium',
        OPUS_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-opus-4-5',
        'premium',
        OPUS_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-sonnet-5',
        'standard',
        SONNET_5_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-sonnet-4-6',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed(
        'bedrock',
        'us',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed('bedrock', 'us', 'anthropic.claude-haiku-4-5', 'fast', HAIKU_REGIONAL),
    seed('bedrock', 'us', 'openai.gpt-5.6-sol', 'premium', GPT_SOL_REGIONAL),
    seed(
        'bedrock',
        'us',
        'openai.gpt-5.6-terra',
        'standard',
        GPT_TERRA_REGIONAL,
    ),
    seed('bedrock', 'us', 'openai.gpt-5.6-luna', 'fast', GPT_LUNA_REGIONAL),
    seed('bedrock', 'us', '__default__', 'standard', SONNET_4_REGIONAL),
    seed(
        'bedrock',
        'eu',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed('bedrock', 'eu', '__default__', 'standard', SONNET_4_REGIONAL),
    seed(
        'bedrock',
        'au',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed('bedrock', 'au', '__default__', 'standard', SONNET_4_REGIONAL),
    seed(
        'bedrock',
        'jp',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed('bedrock', 'jp', '__default__', 'standard', SONNET_4_REGIONAL),
    seed(
        'bedrock',
        'apac',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4_REGIONAL,
    ),
    seed('bedrock', 'apac', '__default__', 'standard', SONNET_4_REGIONAL),
    seed('bedrock', 'global', 'anthropic.claude-opus-5', 'premium', OPUS),
    seed('bedrock', 'global', 'anthropic.claude-opus-4-8', 'premium', OPUS),
    seed('bedrock', 'global', 'anthropic.claude-opus-4-7', 'premium', OPUS),
    seed('bedrock', 'global', 'anthropic.claude-opus-4-6', 'premium', OPUS),
    seed('bedrock', 'global', 'anthropic.claude-opus-4-5', 'premium', OPUS),
    seed(
        'bedrock',
        'global',
        'anthropic.claude-sonnet-5',
        'standard',
        SONNET_5,
    ),
    seed(
        'bedrock',
        'global',
        'anthropic.claude-sonnet-4-6',
        'standard',
        SONNET_4,
    ),
    seed(
        'bedrock',
        'global',
        'anthropic.claude-sonnet-4-5',
        'standard',
        SONNET_4,
    ),
    seed('bedrock', 'global', 'anthropic.claude-haiku-4-5', 'fast', HAIKU),
    seed('bedrock', 'global', 'openai.gpt-5.6-sol', 'premium', GPT_SOL),
    seed('bedrock', 'global', 'openai.gpt-5.6-terra', 'standard', GPT_TERRA),
    seed('bedrock', 'global', 'openai.gpt-5.6-luna', 'fast', GPT_LUNA),
    seed('bedrock', 'global', '__default__', 'standard', SONNET_4),
    seed('azure', '__default__', 'gpt-4.1-mini', 'fast', GPT_41_MINI),
    seed('azure', '__default__', '__default__', 'standard', GPT_5),
    seed(
        'openrouter',
        '__default__',
        '__default__',
        'standard',
        OPENROUTER_DEFAULT,
    ),
];

export async function up(knex: Knex): Promise<void> {
    await knex(AiCreditRateCardTableName)
        .insert(
            SEED_ROWS.map(
                ({ provider, pricingScope, modelKey, tier, rates }) => ({
                    provider,
                    pricing_scope: pricingScope,
                    model_key: modelKey,
                    tier,
                    input_credits_per_mtok: rates.input,
                    output_credits_per_mtok: rates.output,
                    cache_read_credits_per_mtok: rates.cacheRead,
                    cache_write_credits_per_mtok: rates.cacheWrite,
                    effective_from: SEED_EFFECTIVE_FROM,
                }),
            ),
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
        .where('effective_from', SEED_EFFECTIVE_FROM)
        .delete();
}
