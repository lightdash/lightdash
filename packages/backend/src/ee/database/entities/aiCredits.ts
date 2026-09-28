import { type AiCreditModelTier } from '@lightdash/common';
import { Knex } from 'knex';

export const AiCreditRateCardTableName = 'ai_credit_rate_card';

export type DbAiCreditRateCard = {
    ai_credit_rate_card_uuid: string;
    provider: string;
    pricing_scope: string;
    model_key: string;
    tier: AiCreditModelTier;
    // Postgres numerics arrive as strings through the pg driver.
    input_credits_per_mtok: string;
    output_credits_per_mtok: string;
    cache_read_credits_per_mtok: string;
    cache_write_credits_per_mtok: string;
    effective_from: Date;
    created_at: Date;
};

export type AiCreditRateCardTable = Knex.CompositeTableType<
    DbAiCreditRateCard,
    Omit<DbAiCreditRateCard, 'ai_credit_rate_card_uuid' | 'created_at'>
>;
