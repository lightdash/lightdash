import {
    type AiCreditHoldReason,
    type AiCreditModelTier,
} from '@lightdash/common';
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

export type DbAiCreditRateCardInsert = Omit<
    DbAiCreditRateCard,
    | 'ai_credit_rate_card_uuid'
    | 'created_at'
    | 'input_credits_per_mtok'
    | 'output_credits_per_mtok'
    | 'cache_read_credits_per_mtok'
    | 'cache_write_credits_per_mtok'
> & {
    input_credits_per_mtok: number;
    output_credits_per_mtok: number;
    cache_read_credits_per_mtok: number;
    cache_write_credits_per_mtok: number;
};

export type AiCreditRateCardTable = Knex.CompositeTableType<
    DbAiCreditRateCard,
    DbAiCreditRateCardInsert
>;

export const AiCreditEntitlementsTableName = 'ai_credit_entitlements';

export type DbAiCreditEntitlement = {
    ai_credit_entitlement_uuid: string;
    organization_uuid: string;
    period_start: Date;
    period_end: Date;
    allowance_credits: string | null;
    created_at: Date;
};

export type DbAiCreditEntitlementInsert = {
    organization_uuid: string;
    period_start: Date;
    period_end: Date;
    allowance_credits: number | null;
};

export type AiCreditEntitlementsTable = Knex.CompositeTableType<
    DbAiCreditEntitlement,
    DbAiCreditEntitlementInsert,
    Partial<DbAiCreditEntitlementInsert>
>;

export const AiCreditHoldsTableName = 'ai_credit_holds';

export type DbAiCreditHold = {
    ai_credit_hold_uuid: string;
    organization_uuid: string;
    user_uuid: string | null;
    ai_credit_entitlement_uuid: string | null;
    reason: AiCreditHoldReason;
    notes: string | null;
    placed_by: string;
    placed_at: Date;
    expires_at: Date | null;
    released_at: Date | null;
};

export type DbAiCreditHoldInsert = Omit<
    DbAiCreditHold,
    'ai_credit_hold_uuid' | 'placed_at' | 'released_at'
>;

export type AiCreditHoldsTable = Knex.CompositeTableType<
    DbAiCreditHold,
    DbAiCreditHoldInsert,
    { released_at: Date }
>;
