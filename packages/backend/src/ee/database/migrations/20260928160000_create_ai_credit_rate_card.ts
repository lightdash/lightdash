import { Knex } from 'knex';

const AiCreditRateCardTableName = 'ai_credit_rate_card';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new table and seeds it with rate card rows. Raw SQL only sets a lock timeout and generates UUID defaults; existing tables and data are unchanged.',
};

const SEED_EFFECTIVE_FROM = '2026-09-01T00:00:00Z';

// Credits per million tokens: input, output, cache read, cache write.
// Converted from provider list prices at seed time; later changes arrive as
// new effective-dated rows, never as edits to these.
const SEED_ROWS: [
    string,
    string,
    string,
    string,
    number,
    number,
    number,
    number,
][] = [
    ['anthropic', '__default__', 'claude-opus-5', 'premium', 100, 500, 10, 125],
    [
        'anthropic',
        '__default__',
        'claude-opus-4-8',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'anthropic',
        '__default__',
        'claude-opus-4-7',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'anthropic',
        '__default__',
        'claude-opus-4-6',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'anthropic',
        '__default__',
        'claude-opus-4-5',
        'premium',
        100,
        500,
        10,
        125,
    ],
    ['anthropic', '__default__', 'claude-opus', 'premium', 100, 500, 10, 125],
    ['anthropic', '__default__', 'claude-sonnet-5', 'standard', 40, 200, 4, 50],
    [
        'anthropic',
        '__default__',
        'claude-sonnet-4-6',
        'standard',
        60,
        300,
        6,
        75,
    ],
    [
        'anthropic',
        '__default__',
        'claude-sonnet-4-5',
        'standard',
        60,
        300,
        6,
        75,
    ],
    ['anthropic', '__default__', 'claude-sonnet', 'standard', 40, 200, 4, 50],
    ['anthropic', '__default__', 'claude-haiku-4-5', 'fast', 20, 100, 2, 25],
    ['anthropic', '__default__', 'claude-haiku', 'fast', 20, 100, 2, 25],
    ['anthropic', '__default__', '__default__', 'standard', 60, 300, 6, 75],
    ['openai', '__default__', 'gpt-5-mini', 'fast', 5, 40, 0.5, 0],
    ['openai', '__default__', 'gpt-5.4', 'standard', 25, 200, 2.5, 0],
    ['openai', '__default__', 'gpt-5.5', 'standard', 25, 200, 2.5, 0],
    ['openai', '__default__', 'gpt-5.6-sol', 'premium', 100, 600, 10, 125],
    ['openai', '__default__', 'gpt-5.6-terra', 'standard', 40, 240, 4, 50],
    ['openai', '__default__', 'gpt-5.6-luna', 'fast', 4, 24, 0.4, 5],
    ['openai', '__default__', 'text-embedding-3-small', 'fast', 0.4, 0, 0, 0],
    ['openai', '__default__', '__default__', 'standard', 25, 200, 2.5, 0],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-opus-5',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-8',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-7',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-6',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-opus-4-5',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-5',
        'standard',
        40,
        200,
        4,
        50,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-4-6',
        'standard',
        60,
        300,
        6,
        75,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-sonnet-4-5',
        'standard',
        60,
        300,
        6,
        75,
    ],
    [
        'bedrock',
        '__default__',
        'anthropic.claude-haiku-4-5',
        'fast',
        20,
        100,
        2,
        25,
    ],
    [
        'bedrock',
        '__default__',
        'openai.gpt-5.6-sol',
        'premium',
        100,
        600,
        10,
        125,
    ],
    [
        'bedrock',
        '__default__',
        'openai.gpt-5.6-terra',
        'standard',
        40,
        240,
        4,
        50,
    ],
    ['bedrock', '__default__', 'openai.gpt-5.6-luna', 'fast', 4, 24, 0.4, 5],
    ['bedrock', '__default__', 'claude-sonnet', 'standard', 40, 200, 4, 50],
    ['bedrock', '__default__', 'claude-opus', 'premium', 100, 500, 10, 125],
    ['bedrock', '__default__', 'claude-haiku', 'fast', 20, 100, 2, 25],
    ['bedrock', '__default__', '__default__', 'standard', 60, 300, 6, 75],
    [
        'bedrock',
        'us',
        'anthropic.claude-opus-5',
        'premium',
        110,
        550,
        11,
        137.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-opus-4-8',
        'premium',
        110,
        550,
        11,
        137.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-opus-4-7',
        'premium',
        110,
        550,
        11,
        137.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-opus-4-6',
        'premium',
        110,
        550,
        11,
        137.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-opus-4-5',
        'premium',
        110,
        550,
        11,
        137.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-sonnet-5',
        'standard',
        44,
        220,
        4.4,
        55,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-sonnet-4-6',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    [
        'bedrock',
        'us',
        'anthropic.claude-sonnet-4-5',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    ['bedrock', 'us', 'anthropic.claude-haiku-4-5', 'fast', 22, 110, 2.2, 27.5],
    ['bedrock', 'us', 'openai.gpt-5.6-sol', 'premium', 110, 660, 11, 137.5],
    ['bedrock', 'us', 'openai.gpt-5.6-terra', 'standard', 44, 264, 4.4, 55],
    ['bedrock', 'us', 'openai.gpt-5.6-luna', 'fast', 4.4, 26.4, 0.44, 5.5],
    ['bedrock', 'us', '__default__', 'standard', 66, 330, 6.6, 82.5],
    [
        'bedrock',
        'eu',
        'anthropic.claude-sonnet-4-5',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    ['bedrock', 'eu', '__default__', 'standard', 66, 330, 6.6, 82.5],
    [
        'bedrock',
        'au',
        'anthropic.claude-sonnet-4-5',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    ['bedrock', 'au', '__default__', 'standard', 66, 330, 6.6, 82.5],
    [
        'bedrock',
        'jp',
        'anthropic.claude-sonnet-4-5',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    ['bedrock', 'jp', '__default__', 'standard', 66, 330, 6.6, 82.5],
    [
        'bedrock',
        'apac',
        'anthropic.claude-sonnet-4-5',
        'standard',
        66,
        330,
        6.6,
        82.5,
    ],
    ['bedrock', 'apac', '__default__', 'standard', 66, 330, 6.6, 82.5],
    [
        'bedrock',
        'global',
        'anthropic.claude-opus-5',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-opus-4-8',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-opus-4-7',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-opus-4-6',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-opus-4-5',
        'premium',
        100,
        500,
        10,
        125,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-sonnet-5',
        'standard',
        40,
        200,
        4,
        50,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-sonnet-4-6',
        'standard',
        60,
        300,
        6,
        75,
    ],
    [
        'bedrock',
        'global',
        'anthropic.claude-sonnet-4-5',
        'standard',
        60,
        300,
        6,
        75,
    ],
    ['bedrock', 'global', 'anthropic.claude-haiku-4-5', 'fast', 20, 100, 2, 25],
    ['bedrock', 'global', 'openai.gpt-5.6-sol', 'premium', 100, 600, 10, 125],
    ['bedrock', 'global', 'openai.gpt-5.6-terra', 'standard', 40, 240, 4, 50],
    ['bedrock', 'global', 'openai.gpt-5.6-luna', 'fast', 4, 24, 0.4, 5],
    ['bedrock', 'global', '__default__', 'standard', 60, 300, 6, 75],
    ['azure', '__default__', 'gpt-4.1-mini', 'fast', 8, 32, 2, 0],
    ['azure', '__default__', '__default__', 'standard', 25, 200, 2.5, 0],
    ['openrouter', '__default__', '__default__', 'standard', 10, 40, 1, 0],
];

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        if (!(await knex.schema.hasTable(AiCreditRateCardTableName))) {
            await knex.schema.createTable(
                AiCreditRateCardTableName,
                (table) => {
                    table
                        .uuid('ai_credit_rate_card_uuid')
                        .primary()
                        .defaultTo(knex.raw('uuid_generate_v4()'));
                    table.text('provider').notNullable();
                    table
                        .text('pricing_scope')
                        .notNullable()
                        .comment(
                            'Provider-specific price scope, e.g. the Bedrock routing prefix. __default__ when the provider has one price list.',
                        );
                    table
                        .text('model_key')
                        .notNullable()
                        .comment(
                            'Normalised model id (no dated snapshot, no Bedrock prefix or version). __default__ catches unknown models.',
                        );
                    table.text('tier').notNullable();
                    table
                        .decimal('input_credits_per_mtok', 14, 6)
                        .notNullable();
                    table
                        .decimal('output_credits_per_mtok', 14, 6)
                        .notNullable();
                    table
                        .decimal('cache_read_credits_per_mtok', 14, 6)
                        .notNullable();
                    table
                        .decimal('cache_write_credits_per_mtok', 14, 6)
                        .notNullable();
                    table
                        .timestamp('effective_from', { useTz: true })
                        .notNullable()
                        .comment(
                            'The row prices calls from this instant until a later-dated row for the same key exists. Corrections are new rows.',
                        );
                    table
                        .timestamp('created_at', { useTz: true })
                        .notNullable()
                        .defaultTo(knex.fn.now());
                    table.unique([
                        'provider',
                        'pricing_scope',
                        'model_key',
                        'effective_from',
                    ]);
                    table.check(
                        `tier IN ('fast', 'standard', 'premium')`,
                        [],
                        'ai_credit_rate_card_tier_check',
                    );
                },
            );
        }

        await knex(AiCreditRateCardTableName)
            .insert(
                SEED_ROWS.map(
                    ([
                        provider,
                        pricingScope,
                        modelKey,
                        tier,
                        input,
                        output,
                        cacheRead,
                        cacheWrite,
                    ]) => ({
                        provider,
                        pricing_scope: pricingScope,
                        model_key: modelKey,
                        tier,
                        input_credits_per_mtok: input,
                        output_credits_per_mtok: output,
                        cache_read_credits_per_mtok: cacheRead,
                        cache_write_credits_per_mtok: cacheWrite,
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
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.dropTableIfExists(AiCreditRateCardTableName);
}
