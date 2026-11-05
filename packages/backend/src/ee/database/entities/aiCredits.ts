import {
    type AiCreditAllowanceAlertThreshold,
    type AiCreditAllowanceMode,
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

export const AiCreditContractsTableName = 'ai_credit_contracts';

export type DbAiCreditContract = {
    ai_credit_contract_uuid: string;
    organization_uuid: string;
    starts_at: Date;
    ends_at: Date | null;
    reset_interval_months: number;
    allowance_credits: string | null;
    allowance_mode: AiCreditAllowanceMode;
    created_at: Date;
    updated_at: Date;
};

export type DbAiCreditContractInsert = {
    organization_uuid: string;
    starts_at: Date;
    ends_at: Date | null;
    reset_interval_months: number;
    allowance_credits: number | null;
    // Defaults to warn in the database.
    allowance_mode?: AiCreditAllowanceMode;
};

export type AiCreditContractsTable = Knex.CompositeTableType<
    DbAiCreditContract,
    DbAiCreditContractInsert,
    Partial<DbAiCreditContractInsert> & { updated_at?: Date }
>;

export const AiCreditHoldsTableName = 'ai_credit_holds';

export type DbAiCreditHold = {
    ai_credit_hold_uuid: string;
    organization_uuid: string;
    user_uuid: string | null;
    ai_credit_contract_uuid: string | null;
    window_start: Date | null;
    // Numeric columns arrive as strings through the pg driver.
    exhausted_allowance_credits: string | null;
    reason: AiCreditHoldReason;
    notes: string | null;
    placed_by: string;
    placed_at: Date;
    expires_at: Date | null;
    released_at: Date | null;
};

export type DbAiCreditHoldInsert = Omit<
    DbAiCreditHold,
    | 'ai_credit_hold_uuid'
    | 'placed_at'
    | 'released_at'
    | 'exhausted_allowance_credits'
> & { exhausted_allowance_credits: number | null };

export type AiCreditHoldsTable = Knex.CompositeTableType<
    DbAiCreditHold,
    DbAiCreditHoldInsert,
    Partial<Pick<DbAiCreditHold, 'released_at' | 'expires_at'>>
>;

export const AiCreditAllowanceAlertsTableName = 'ai_credit_allowance_alerts';

export type DbAiCreditAllowanceAlert = {
    ai_credit_allowance_alert_uuid: string;
    organization_uuid: string;
    ai_credit_contract_uuid: string;
    window_start: Date;
    threshold_percent: AiCreditAllowanceAlertThreshold;
    // Numeric columns arrive as strings through the pg driver.
    allowance_credits: string;
    used_credits: string;
    reached_at: Date;
    delivered_at: Date | null;
};

export type DbAiCreditAllowanceAlertInsert = Pick<
    DbAiCreditAllowanceAlert,
    | 'organization_uuid'
    | 'ai_credit_contract_uuid'
    | 'window_start'
    | 'threshold_percent'
> & { allowance_credits: number; used_credits: number };

export type AiCreditAllowanceAlertsTable = Knex.CompositeTableType<
    DbAiCreditAllowanceAlert,
    DbAiCreditAllowanceAlertInsert,
    Partial<Pick<DbAiCreditAllowanceAlert, 'delivered_at'>> & {
        allowance_credits?: number;
    }
>;
