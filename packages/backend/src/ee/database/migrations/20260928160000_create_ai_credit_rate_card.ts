import { Knex } from 'knex';

const AiCreditRateCardTableName = 'ai_credit_rate_card';

export const classification = {
    kind: 'safe',
    reason: 'Creates one new empty table. Raw SQL only sets a lock timeout and generates UUID defaults; existing tables and data are unchanged.',
};

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
                            'Prices calls from this instant until a later-dated row for the same key exists. Corrections are new rows.',
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
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`SET lock_timeout = '10s'`);
    try {
        await knex.schema.dropTableIfExists(AiCreditRateCardTableName);
    } finally {
        await knex.raw('RESET lock_timeout');
    }
}
